import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isValidNewsletterEmail, NEWSLETTER_AUDIENCE_ID, normalizeNewsletterEmail, subscribeNewsletterContact } from "@/lib/newsletter";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");
const LOCAL_FALLBACK_ENABLED = process.env.NODE_ENV !== "production";

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
  if (!NEWSLETTER_AUDIENCE_ID) {
    if (LOCAL_FALLBACK_ENABLED) return subscribeLocallyForDevelopment(email);
    throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  }

  const result = await subscribeNewsletterContact(email);
  return { alreadySubscribed: result.alreadySubscribed, storage: "resend-audience" as const, contactId: result.contactId };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeNewsletterEmail(body.email || "");

  if (!email || !isValidNewsletterEmail(email)) {
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
