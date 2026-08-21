export interface SignalFeedCursorPayload {
  dropsOffset: number;
  dropSnapshot: string | null;
  memberBoundary: { createdAt: string; id: string } | null;
}

function safeOffset(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
}

function safeSnapshot(value: unknown) {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 500);
}

function safeMemberBoundary(value: unknown): value is { createdAt: string; id: string } | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const boundary = value as Record<string, unknown>;
  return typeof boundary.createdAt === "string"
    && boundary.createdAt.length <= 100
    && Number.isFinite(Date.parse(boundary.createdAt))
    && typeof boundary.id === "string"
    && /^[A-Za-z0-9._:-]{1,160}$/.test(boundary.id);
}

export function encodeSignalFeedCursor(payload: SignalFeedCursorPayload) {
  if (!safeOffset(payload.dropsOffset) || !safeSnapshot(payload.dropSnapshot) || !safeMemberBoundary(payload.memberBoundary)) {
    throw new Error("Invalid Signal feed cursor payload");
  }
  return Buffer.from(JSON.stringify({
    v: 2,
    d: payload.dropsOffset,
    ds: payload.dropSnapshot,
    mb: payload.memberBoundary,
  }), "utf8").toString("base64url");
}

export function decodeSignalFeedCursor(value: string | null | undefined): SignalFeedCursorPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed.v !== 2 || !safeOffset(parsed.d) || !safeSnapshot(parsed.ds) || !safeMemberBoundary(parsed.mb)) return null;
    return {
      dropsOffset: Number(parsed.d),
      dropSnapshot: parsed.ds as string | null,
      memberBoundary: parsed.mb as SignalFeedCursorPayload["memberBoundary"],
    };
  } catch {
    return null;
  }
}
