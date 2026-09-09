// Local staging only. No upload, credentials, rights-clearing, or release action.
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { BottlePhoto, CatalogIdentity } from '../apps/mobile/src/bottle-photos/registry.ts';
const { parsePhotoRegistry } = createRequire(import.meta.url)('../apps/mobile/src/bottle-photos/registry.ts') as typeof import('../apps/mobile/src/bottle-photos/registry.ts');
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function requireGate(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message); }

type PrivateReview = {
  catalogId: string; catalogName: string; path: string; sha256: string; width: number; height: number; bytes: number;
  rightsStatus: string; ownerDeferredLicensing: boolean; identityReviewed: boolean; visualReviewed: boolean;
  reviewedAt: string; reviewEvidence: string[];
  [key: string]: unknown;
};

// Decode only the reviewed format (non-interlaced RGBA8 PNG), including all PNG
// row filters. Check actual alpha and canvas bounds, not just the RGBA header.
function verifyPng(bytes: Buffer) {
  requireGate(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  requireGate(bytes.readUInt32BE(16) === 400 && bytes.readUInt32BE(20) === 600
    && bytes[24] === 8 && bytes[25] === 6 && bytes[26] === 0 && bytes[27] === 0 && bytes[28] === 0, 'PNG RGBA dimensions');
  const parts: Buffer[] = [];
  for (let pos = 8; pos < bytes.length;) {
    const length = bytes.readUInt32BE(pos);
    requireGate(pos + length + 12 <= bytes.length, 'PNG chunk bounds');
    const type = bytes.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') parts.push(bytes.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts), { maxOutputLength: 960600 });
  requireGate(raw.length === 960600, 'PNG scanline size');
  let previous = Buffer.alloc(1600), transparent = false, opaque = false;
  for (let y = 0; y < 600; y++) {
    const filter = raw[y * 1601];
    requireGate(filter <= 4, 'PNG filter');
    const line = Buffer.from(raw.subarray(y * 1601 + 1, (y + 1) * 1601));
    for (let x = 0; x < line.length; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = previous[x], c = x >= 4 ? previous[x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      line[x] = (line[x] + predictor) & 255;
    }
    for (let x = 0; x < 400; x++) {
      const alpha = line[x * 4 + 3];
      if (alpha === 0) transparent = true;
      if (alpha === 255) opaque = true;
      requireGate(!alpha || (x >= 16 && x < 384 && y >= 16 && y < 584), 'PNG approved padding');
    }
    previous = line;
  }
  requireGate(transparent && opaque, 'PNG alpha extrema');
}

export function buildPhotoPublication(rows: PrivateReview[], catalog: readonly CatalogIdentity[], readBytes = readFileSync) {
  requireGate(Array.isArray(rows) && rows.length > 0, 'Empty manifest');
  const ids = new Set<string>();
  const assets = new Map<string, Buffer>();
  const entries: BottlePhoto[] = [];
  const privateAudit: PrivateReview[] = [];
  for (const row of rows) {
    requireGate(!ids.has(row.catalogId), `Duplicate catalog ID: ${row.catalogId}`);
    ids.add(row.catalogId);
    requireGate(catalog.some(c => c.id === row.catalogId && (c.name ?? c.canonicalName) === row.catalogName), `Exact catalog identity: ${row.catalogId}`);
    requireGate(row.identityReviewed === true && row.visualReviewed === true && Boolean(row.reviewedAt)
      && Number.isFinite(Date.parse(row.reviewedAt)) && Array.isArray(row.reviewEvidence)
      && row.reviewEvidence.length > 0 && row.reviewEvidence.every(v => typeof v === 'string' && v.length > 0), `Review gate: ${row.catalogId}`);
    // Deferral is not third-party permission. This owner-deferred staging tool
    // accepts only honest unverified status; it can never mint "cleared" rights.
    requireGate(row.rightsStatus === 'unverified' && row.ownerDeferredLicensing === true, `Deferred rights gate: ${row.catalogId}`);
    const bytes = readBytes(row.path) as Buffer;
    requireGate(/^[a-f0-9]{64}$/.test(row.sha256) && sha(bytes) === row.sha256, `Content hash: ${row.catalogId}`);
    requireGate(row.width === 400 && row.height === 600 && row.bytes === bytes.length && bytes.length < 500_000, `Dimensions/bytes: ${row.catalogId}`);
    if (!assets.has(row.sha256)) verifyPng(bytes);
    assets.set(row.sha256, bytes);
    const exactNames = [row.catalogName];
    // Explicit owner-reviewed alias only. Never normalize all ages or use source/catalog aliases.
    if (row.catalogId === 'eagle-rare-10' && row.catalogName === 'Eagle Rare 10 Year') exactNames.push('Eagle Rare 10Y');
    entries.push({ catalogId: row.catalogId, displayName: row.catalogName, exactNames, sha256: row.sha256, width: 400, height: 600 });
    privateAudit.push({ ...row, rightsStatus: 'unverified', ownerDeferredLicensing: true });
  }
  const names = new Map<string, string>();
  for (const photo of entries) for (const name of photo.exactNames) {
    const key = name.trim().replace(/\s+/g, ' ').replace(/’/g, "'").toLowerCase();
    requireGate(!names.has(key) || names.get(key) === photo.sha256, `Exact-name image ambiguity: ${name}`);
    names.set(key, photo.sha256);
  }
  const registry = parsePhotoRegistry({ schemaVersion: 1, revision: sha(JSON.stringify(entries)), entries });
  requireGate(registry, 'Public schema');
  return { registry, assets, privateAudit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [manifest, auditPath] = process.argv.slice(2);
  requireGate(manifest && auditPath, 'Usage: tsx scripts/stage-bottle-photos.mts <private-manifest.json> <private-audit-outside-repo.json>');
  const root = resolve(import.meta.dirname, '..');
  const audit = resolve(auditPath);
  const rel = relative(root, audit);
  requireGate(rel.startsWith('..') || isAbsolute(rel), 'Private audit must be outside repository');
  const rows = JSON.parse(readFileSync(resolve(manifest), 'utf8'));
  const catalog = JSON.parse(readFileSync(resolve(root, 'apps/mobile/src/cellar/bottle-catalog-seed.json'), 'utf8'));
  const result = buildPhotoPublication(rows, catalog);
  const dir = resolve(root, 'public/bottle-photos');
  // Complete validation/preflight before the first write. Existing hash paths
  // are immutable; keep previous batches' assets for installed metadata caches.
  for (const [hash, bytes] of result.assets) {
    const target = resolve(dir, `${hash}.png`);
    if (existsSync(target)) requireGate(readFileSync(target).equals(bytes), `Immutable path collision: ${hash}`);
  }
  writeFileSync(audit, JSON.stringify(result.privateAudit, null, 2) + '\n');
  mkdirSync(dir, { recursive: true });
  for (const [hash, bytes] of result.assets) {
    const target = resolve(dir, `${hash}.png`);
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx' });
  }
  writeFileSync(resolve(dir, 'registry.v1.json'), JSON.stringify(result.registry, null, 2) + '\n');
  console.log(JSON.stringify({ staged: result.registry.entries.length, hashes: result.assets.size, revision: result.registry.revision, released: false }));
}
