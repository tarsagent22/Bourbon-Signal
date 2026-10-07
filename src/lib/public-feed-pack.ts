import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
export type FeedFreshnessWindow = { startsAt: number; endsAt: number; inclusiveEnd: boolean };
export interface PreparedPublicRows {
  normalizedDrops: object[];
  eligible: object[];
  freshness: ReadonlyMap<object, FeedFreshnessWindow>;
  degradedStates: Set<string>;
}
const MAX_PLAIN_BYTES = 64 * 1024 * 1024;
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
// No member/access objects enter this codec. Row indexes preserve shared object
// identity so time-window lookups still refer to the reconstructed public rows.
export function packPublicFeed(rows: PreparedPublicRows, metadata: Record<string, unknown>) {
  const indexes = new Map(rows.normalizedDrops.map((row, index) => [row, index]));
  const value = {
    version: 2, metadata, rows: rows.normalizedDrops,
    eligible: rows.eligible.map(row => indexes.get(row)),
    windows: rows.normalizedDrops.map(row => rows.freshness.get(row)),
    degradedStates: [...rows.degradedStates],
  };
  const plain = Buffer.from(JSON.stringify(value));
  if (plain.length > MAX_PLAIN_BYTES) throw new Error('Public feed preparation exceeds its size bound');
  return JSON.stringify({ version: 2, bytes: plain.length, hash: hash(plain), brotli: brotliCompressSync(plain, { params: { [constants.BROTLI_PARAM_QUALITY]: 6, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } }).toString('base64') });
}
export function unpackPublicFeed<T extends PreparedPublicRows>(packed: string): T {
  const envelope = JSON.parse(packed);
  if (envelope.version !== 2 || !Number.isSafeInteger(envelope.bytes) || envelope.bytes < 1 || envelope.bytes > MAX_PLAIN_BYTES || typeof envelope.brotli !== 'string') throw new Error('Invalid public feed cache envelope');
  const plain = brotliDecompressSync(Buffer.from(envelope.brotli, 'base64'), { maxOutputLength: envelope.bytes });
  if (plain.length !== envelope.bytes || hash(plain) !== envelope.hash) throw new Error('Public feed cache integrity mismatch');
  const value = JSON.parse(plain.toString('utf8'));
  if (value.version !== 2 || !Array.isArray(value.rows) || !Array.isArray(value.windows) || value.rows.length !== value.windows.length || !Array.isArray(value.eligible) || value.eligible.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0 || Number(index) >= value.rows.length)) throw new Error('Invalid public feed cache rows');
  const freshness = new Map<object, FeedFreshnessWindow>(value.rows.map((row: object, index: number) => {
    const window = value.windows[index];
    return [row, { startsAt: window.startsAt === null ? Number.NEGATIVE_INFINITY : window.startsAt, endsAt: window.endsAt === null ? Number.NaN : window.endsAt, inclusiveEnd: window.inclusiveEnd }];
  }));
  return { ...value.metadata, normalizedDrops: value.rows, eligible: value.eligible.map((index: number) => value.rows[index]), freshness, degradedStates: new Set(value.degradedStates) } as T;
}
