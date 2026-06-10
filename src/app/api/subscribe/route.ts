import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getResendClient } from "@/lib/email-alerts";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");
const DIGEST_AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID;
const LOCAL_FALLBACK_ENABLED = process.env.NODE_ENV !== "production";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resendErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Unknown Resend error";
  const maybeMessage = "message" in error ? error.message : null;
  return typeof maybeMessage === "string" ? maybeMessage : JSON.stringify(error);
}

function resendStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function isExistingContactError(error: unknown) {
  const status = resendStatusCode(error);
  const message = resendErrorMessage(error).toLowerCase();
  return status === 409 || message.includes("already") || message.includes("exist");
}

async function readSubscribers(): Promise<string[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function writeSubscribers(emails: string[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBSCRIBERS_PATH, JSON.stringify(emails, null, 2) + "\n", "utf8");
}

async function subscribeLocallyForDevelopment(email: string) {
  const subscribers = await readSubscribers();
  if (subscribers.includes(email)) {
    return { alreadySubscribed: true, storage: "local-development" as const };
  }

  subscribers.push(email);
  subscribers.sort();
  await writeSubscribers(subscribers);
  return { alreadySubscribed: false, storage: "local-development" as const };
}

async function subscribeToDigestAudience(email: string) {
  if (!DIGEST_AUDIENCE_ID) {
    if (LOCAL_FALLBACK_ENABLED) return subscribeLocallyForDevelopment(email);
    throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  }

  const resend = getResendClient();

  const created = await resend.contacts.create({
    audienceId: DIGEST_AUDIENCE_ID,
    email,
    unsubscribed: false,
  });

  if (!created.error) {
    return { alreadySubscribed: false, storage: "resend-audience" as const, contactId: created.data?.id };
  }

  if (!isExistingContactError(created.error)) {
    throw new Error(resendErrorMessage(created.error));
  }

  const updated = await resend.contacts.update({
    audienceId: DIGEST_AUDIENCE_ID,
    email,
    unsubscribed: false,
  });

  if (updated.error) {
    throw new Error(resendErrorMessage(updated.error));
  }

  return { alreadySubscribed: true, storage: "resend-audience" as const, contactId: updated.data?.id };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email || "");

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  try {
    const result = await subscribeToDigestAudience(email);
    return NextResponse.json({ ok: true, alreadySubscribed: result.alreadySubscribed, storage: result.storage });
  } catch (error) {
    console.error("Weekly digest subscription failed", error);
    return NextResponse.json(
      { error: "We couldn't add that email right now. Please try again in a minute." },
      { status: 502 },
    );
  }
}
