import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBSCRIBERS_PATH = path.join(DATA_DIR, "subscribers.json");

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function readSubscribers(): Promise<string[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    return [];
  }
}

async function writeSubscribers(emails: string[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBSCRIBERS_PATH, JSON.stringify(emails, null, 2) + "\n", "utf8");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email || "");

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const subscribers = await readSubscribers();
  if (subscribers.includes(email)) {
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  subscribers.push(email);
  subscribers.sort();
  await writeSubscribers(subscribers);

  return NextResponse.json({ ok: true, alreadySubscribed: false });
}
