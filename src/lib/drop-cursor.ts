export interface DropCursorPayload {
  snapshot: string;
  offset: number;
}

export class DropCursorSnapshotError extends Error {
  constructor() {
    super("Drop cursor belongs to a different export snapshot");
    this.name = "DropCursorSnapshotError";
  }
}

export function encodeDropCursor(payload: DropCursorPayload): string {
  if (!payload.snapshot || !Number.isSafeInteger(payload.offset) || payload.offset < 0) {
    throw new Error("Invalid drop cursor payload");
  }
  return Buffer.from(JSON.stringify({ v: 1, s: payload.snapshot, o: payload.offset }), "utf8").toString("base64url");
}

export function decodeDropCursor(value: string | null | undefined): DropCursorPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed.v !== 1 || typeof parsed.s !== "string" || !parsed.s || !Number.isSafeInteger(parsed.o) || Number(parsed.o) < 0) return null;
    return { snapshot: parsed.s, offset: Number(parsed.o) };
  } catch {
    return null;
  }
}

export function paginateDrops<T>(
  items: T[],
  options: { limit: number; snapshot: string; cursor?: string | null; offset?: number },
) {
  const decoded = decodeDropCursor(options.cursor);
  if (options.cursor && !decoded) throw new Error("Invalid drop cursor");
  if (decoded && decoded.snapshot !== options.snapshot) throw new DropCursorSnapshotError();
  const offset = decoded?.offset ?? Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit);
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  const hasMore = nextOffset < items.length;
  return {
    items: pageItems,
    offset,
    hasMore,
    nextCursor: hasMore ? encodeDropCursor({ snapshot: options.snapshot, offset: nextOffset }) : null,
  };
}
