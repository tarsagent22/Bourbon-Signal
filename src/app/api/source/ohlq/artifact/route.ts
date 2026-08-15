import { NextRequest, NextResponse } from "next/server";

import {
  OHLQ_WORKER_MAX_BODY_BYTES,
  authorizeOhlqWorkerBearer,
  verifyOhlqWorkerUploadSignature,
} from "@/lib/ohlq-worker-artifact";
import { readLatestOhlqWorkerEnvelope, storeOhlqWorkerEnvelope } from "@/lib/ohlq-worker-artifact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

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
    const artifact = await readLatestOhlqWorkerEnvelope();
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
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > OHLQ_WORKER_MAX_BODY_BYTES) {
    return NextResponse.json({ error: "OHLQ worker artifact is too large." }, { status: 413, headers: PRIVATE_HEADERS });
  }
  const body = await request.text();
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
    const receipt = await storeOhlqWorkerEnvelope(input);
    return NextResponse.json({ ok: true, ...receipt }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("OHLQ worker artifact upload rejected.", error);
    return NextResponse.json({ error: "OHLQ worker artifact upload was rejected." }, { status: 422, headers: PRIVATE_HEADERS });
  }
}
