import { gunzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";

import {
  OHLQ_WORKER_MAX_BODY_BYTES,
  OHLQ_WORKER_MAX_COMPRESSED_BYTES,
  authorizeOhlqWorkerBearer,
  verifyOhlqWorkerUploadSignature,
} from "@/lib/ohlq-worker-artifact";
import { readLatestOhlqWorkerEnvelope, storeOhlqWorkerEnvelope } from "@/lib/ohlq-worker-artifact-store";
import { readLatestOhlqWorkerEnvelopeFromDatabase, storeOhlqWorkerEnvelopeInDatabase } from "@/lib/ohlq-worker-artifact-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function databaseConfigured() {
  return Boolean(process.env.BOURBON_QUEUE_DATABASE_URL || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
}

async function readDurableArtifact() {
  let blobError: unknown = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const artifact = await readLatestOhlqWorkerEnvelope();
      if (artifact) return artifact;
    } catch (error) {
      blobError = error;
      console.warn("OHLQ Blob read failed; attempting the encrypted database fallback.", error);
    }
  }
  if (databaseConfigured()) return readLatestOhlqWorkerEnvelopeFromDatabase();
  if (blobError) throw blobError;
  throw new Error("No OHLQ worker artifact store is configured.");
}

async function storeDurableArtifact(value: unknown) {
  let blobError: unknown = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      return await storeOhlqWorkerEnvelope(value);
    } catch (error) {
      blobError = error;
      console.warn("OHLQ Blob write failed; attempting the encrypted database fallback.", error);
    }
  }
  if (databaseConfigured()) return storeOhlqWorkerEnvelopeInDatabase(value);
  if (blobError) throw blobError;
  throw new Error("No OHLQ worker artifact store is configured.");
}

function unauthorized(request: NextRequest) {
  if (!authorizeOhlqWorkerBearer(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.search) return NextResponse.json({ error: "This endpoint accepts no query parameters." }, { status: 400, headers: PRIVATE_HEADERS });
  const denied = unauthorized(request);
  if (denied) return denied;
  try {
    const artifact = await readDurableArtifact();
    if (!artifact) return NextResponse.json({ error: "No OHLQ worker artifact is available." }, { status: 404, headers: PRIVATE_HEADERS });
    return NextResponse.json(artifact, { headers: { ...PRIVATE_HEADERS, "X-Bourbon-Signal-Source": "ohlq-persistent-worker" } });
  } catch (error) {
    console.error("OHLQ worker artifact read failed.", error);
    return NextResponse.json({ error: "OHLQ worker artifact read failed." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.search) return NextResponse.json({ error: "This endpoint accepts no query parameters." }, { status: 400, headers: PRIVATE_HEADERS });
  const denied = unauthorized(request);
  if (denied) return denied;
  const compressed = request.headers.get("content-encoding")?.toLowerCase() === "gzip";
  const declaredLength = Number(request.headers.get("content-length"));
  const wireLimit = compressed ? OHLQ_WORKER_MAX_COMPRESSED_BYTES : OHLQ_WORKER_MAX_BODY_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > wireLimit) {
    return NextResponse.json({ error: "OHLQ worker artifact is too large." }, { status: 413, headers: PRIVATE_HEADERS });
  }
  let body: string;
  try {
    const wireBody = Buffer.from(await request.arrayBuffer());
    if (wireBody.length > wireLimit) throw new Error("wire body exceeds limit");
    body = compressed ? gunzipSync(wireBody, { maxOutputLength: OHLQ_WORKER_MAX_BODY_BYTES }).toString("utf8") : wireBody.toString("utf8");
  } catch {
    return NextResponse.json({ error: "OHLQ worker artifact encoding is invalid." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (Buffer.byteLength(body) > OHLQ_WORKER_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "OHLQ worker artifact is too large." }, { status: 413, headers: PRIVATE_HEADERS });
  }
  if (!verifyOhlqWorkerUploadSignature({
    body,
    timestamp: request.headers.get("x-ohlq-timestamp"),
    signature: request.headers.get("x-ohlq-signature"),
  })) {
    return NextResponse.json({ error: "Invalid or expired OHLQ worker artifact signature." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  try {
    const input = JSON.parse(body) as unknown;
    const receipt = await storeDurableArtifact(input);
    return NextResponse.json({ ok: true, ...receipt }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("OHLQ worker artifact upload rejected.", error);
    return NextResponse.json({ error: "OHLQ worker artifact upload was rejected." }, { status: 422, headers: PRIVATE_HEADERS });
  }
}
