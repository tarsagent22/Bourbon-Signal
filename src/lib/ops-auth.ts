import { timingSafeEqual } from "node:crypto";

const SCORECARD_SECTIONS = ["company", "product", "data", "shipping", "decision"] as const;
const PRIVATE_KEY = /(?:^|_)(?:email|phone|name|address|user|memberId|clerk|stripe|query|url)(?:$|_)/i;

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeOpsBearer(header: string | null, secret: string | undefined, environment = process.env.NODE_ENV) {
  if (!secret) return environment !== "production";
  if (!header?.startsWith("Bearer ")) return false;
  return constantTimeEqual(header.slice(7), secret);
}

function containsPrivateKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => PRIVATE_KEY.test(key) || containsPrivateKey(child));
}

export function isAggregateScorecard(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || containsPrivateKey(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.contractVersion !== "bourbon-signal/company-scorecard@1" || typeof record.generatedAt !== "string") return false;
  const sections = record.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return false;
  return SCORECARD_SECTIONS.every((section) => section in (sections as Record<string, unknown>));
}
