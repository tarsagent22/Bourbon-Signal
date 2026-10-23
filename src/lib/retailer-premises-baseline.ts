import { createHash } from 'node:crypto';
import type { SqlExecutor } from './alert-queue/postgres-repository';
import { retailerSubmissionLifecycle } from './retailer-portal.ts';
import { isCanonicalFutureRetailerExpiry } from './retailer-repository.ts';

type Row = Record<string, unknown>;
const MAX_ROWS = 10_000, MAX_BYTES = 2 * 1024 * 1024;
const KINDS = new Set(['bottle_drop', 'barrel_pick', 'tasting', 'lottery']);

// One read-only MVCC statement. Private join keys never leave SQL. The global
// sentinel bounds the combined directory + reviewed history, not just live rows.
// No raw JSON, account/submission/store IDs, product data, contact or review data.
export const VERIFIED_RETAILER_PREMISES_BASELINE_SQL = `WITH public_rows AS (
 SELECT 'verified_store_directory'::text AS origin,
   NULL::text AS name,NULL::text AS address,
   left(stores.store_name,121) AS current_name,left(stores.store_address,241) AS current_address,
   NULL::text AS kind,NULL::text AS starts_at,NULL::text AS expires_at,
   false AS sold_out,true AS temporal_shape_valid,stores.updated_at::text AS observed_at
 FROM retailer_stores stores
 JOIN retailer_applications applications ON applications.user_id=stores.user_id
 WHERE applications.status='verified' AND stores.status='verified'
 UNION ALL
 SELECT 'reviewed_submission',
   left(submissions.store_name,121),left(submissions.store_address,241),
   left(stores.store_name,121),left(stores.store_address,241),
   submissions.payload->>'kind',
   CASE WHEN jsonb_typeof(submissions.payload->'startsAt')='string' THEN left(submissions.payload->>'startsAt',81) END,
   CASE WHEN jsonb_typeof(submissions.payload->'expiresAt')='string' THEN left(submissions.payload->>'expiresAt',81) END,
   COALESCE(submissions.payload->>'soldOutAt','')<>'',
   COALESCE(jsonb_typeof(submissions.payload->'expiresAt')='string'
     AND (submissions.payload->>'kind' NOT IN ('bottle_drop','barrel_pick') OR jsonb_typeof(submissions.payload->'startsAt')='string')
     AND (submissions.payload->'soldOutAt' IS NULL OR submissions.payload->'soldOutAt'='null'::jsonb OR jsonb_typeof(submissions.payload->'soldOutAt')='string'),false),
   submissions.created_at::text
 FROM retailer_submissions submissions
 JOIN retailer_applications applications ON applications.user_id=submissions.user_id
 JOIN retailer_stores stores ON stores.id=submissions.store_id AND stores.user_id=submissions.user_id
 WHERE submissions.status='reviewed' AND applications.status='verified' AND stores.status='verified'
   AND jsonb_typeof(submissions.payload)='object'
   AND submissions.payload->>'kind' IN ('bottle_drop','barrel_pick','tasting','lottery')
), bounded AS (
 SELECT origin,name,address,current_name,current_address,kind,starts_at,expires_at,sold_out,temporal_shape_valid,observed_at
 FROM public_rows ORDER BY origin,current_address,address,observed_at LIMIT 10001
)
SELECT statement_timestamp()::text AS statement_at,
 COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY origin,current_address,address,observed_at) FROM bounded p),'[]'::jsonb) AS premises`;

const clean = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : '';
const date = (value: unknown) => {
  const text = clean(value, 80);
  const at = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const normalizeName = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
// Address punctuation can distinguish house numbers and units. Fold only case
// and whitespace; unresolved spelling/punctuation aliases remain conflicts.
const normalizeAddress = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
function hasStreetIdentity(prefix: string) {
  const streetLine = prefix.split(',')[0].trim();
  const numbered = streetLine.match(/^\d+[A-Z]?(?:[-/]\d+[A-Z]?)?(?:\s+\d+\/\d+)?\s+(.+)$/iu);
  if (!numbered) return false;
  const street = numbered[1].trim();
  if (/^(?:unit|suite|ste|apt|apartment|box|p\.?\s*o\.?)\b/iu.test(street)) return false;
  if (/^(?:(?:us|u\.s\.|state|county)\s+)?(?:highway|hwy|route|rte)\s+\d+[A-Z]?\b/iu.test(street)) return true;
  for (const suffix of street.matchAll(/\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|circle|cir|way|parkway|pkwy|place|pl|terrace|ter|trail|trl|pike)\.?(?=\s|$)/giu)) {
    if (/[A-Z]/iu.test(street.slice(0, suffix.index).trim())) return true;
  }
  return false;
}
function premise(nameValue: unknown, addressValue: unknown) {
  const name = clean(nameValue, 120), address = clean(addressValue, 240);
  // Supported identity syntax requires a leading house number plus a named
  // street/type (or numbered highway/route), and a state/postcode suffix. ZIP,
  // city, PO Box and unit-only strings cannot supply the street number. This is
  // conservative syntax validation, not geocoding: unsupported forms stay gaps.
  // Preserve original punctuation and units for separate alias reconciliation.
  const suffix = address.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/iu);
  if (!name || !address || !suffix || !US_STATES.has(suffix[1].toUpperCase()) || !hasStreetIdentity(address.slice(0, suffix.index))) return null;
  const state = suffix[1].toUpperCase();
  return { name, address, state, zip: suffix[2], physicalPremiseId: `verified-retailer-premise:${hash([state, normalizeAddress(address)])}` };
}
const fail = () => new Error('Verified retailer premises baseline unavailable or outside reviewed bounds');

/** Sanitized point-in-time context. No customer eligibility or newness proof. */
export async function readVerifiedRetailerPremisesBaseline(executor: SqlExecutor, { now = Date.now() }: { now?: number } = {}) {
  if (!Number.isFinite(new Date(now).getTime())) throw fail();
  let result: Row | null;
  try {
    const response = await executor.query(VERIFIED_RETAILER_PREMISES_BASELINE_SQL);
    result = Array.isArray(response?.rows) && response.rows.length === 1 ? response.rows[0] : null;
  } catch { throw fail(); }
  if (!result || !Array.isArray(result.premises) || result.premises.length > MAX_ROWS || Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw fail();
  const statementAt = date(result.statement_at); if (!statementAt) throw fail();
  const gaps: Array<{ reason: string; rows?: number }> = [];
  const gapCounts = new Map<string, number>();
  const gap = (reason: string) => gapCounts.set(reason, (gapCounts.get(reason) || 0) + 1);
  const premises: Row[] = [];
  for (const raw of result.premises as Row[]) {
    if (!raw || !['verified_store_directory', 'reviewed_submission'].includes(String(raw.origin))) throw fail();
    const directory = raw.origin === 'verified_store_directory';
    if (typeof raw.sold_out !== 'boolean' || typeof raw.temporal_shape_valid !== 'boolean' || (!directory && !KINDS.has(String(raw.kind)))) throw fail();
    const currentStore = premise(raw.current_name, raw.current_address);
    const original = directory ? currentStore : premise(raw.name, raw.address);
    if (!original) { gap('public_premise_identity_incomplete'); continue; }
    if (!currentStore) gap('public_premise_identity_incomplete');
    const identityConflict = !directory && (!currentStore || normalizeAddress(original.address) !== normalizeAddress(currentStore.address)
      || normalizeName(original.name) !== normalizeName(currentStore.name));
    if (identityConflict) gap('submission_current_store_identity_conflict');
    const observedAt = date(raw.observed_at);
    if (!observedAt || Date.parse(observedAt) > now) gap('public_observation_clock_invalid');
    const kind = directory ? null : String(raw.kind);
    const availability = kind === 'bottle_drop' || kind === 'barrel_pick';
    const startsAt = clean(raw.starts_at, 80), expiresAt = clean(raw.expires_at, 80);
    const temporalValid = !directory && raw.temporal_shape_valid && !!date(expiresAt)
      && new Date(expiresAt).toISOString() === expiresAt
      && (!availability || !!date(startsAt) && Date.parse(expiresAt) > Date.parse(startsAt)
        && Date.parse(expiresAt) - Date.parse(startsAt) <= 24 * 3600000);
    if (!directory && !temporalValid) gap('submission_temporal_metadata_invalid');
    // Reuse customer lifecycle and exact expiry authority, but do not call its
    // raw repository reader or transfer its private record shape into artifacts.
    const lifecycle = directory ? null : retailerSubmissionLifecycle({ kind: kind as 'bottle_drop' | 'barrel_pick' | 'tasting' | 'lottery',
      startsAt, expiresAt, soldOutAt: raw.sold_out ? 'reported-sold-out' : '' }, new Date(now));
    const current = availability && lifecycle === 'live' && temporalValid && isCanonicalFutureRetailerExpiry(expiresAt, now)
      && !identityConflict && !!observedAt && Date.parse(observedAt) <= now;
    const retained = !directory && (identityConflict || lifecycle === 'ended' || !temporalValid || !isCanonicalFutureRetailerExpiry(expiresAt, now));
    premises.push({ sourceId: 'verified-retailer', origin: raw.origin, ...original,
      currentStoreName: currentStore?.name || null, currentStoreAddress: currentStore?.address || null,
      currentStorePhysicalPremiseId: currentStore?.physicalPremiseId || null,
      kind: directory ? 'directory' : availability ? 'inventory_report' : 'event', submissionKind: kind,
      observedAt, availabilityStartsAt: availability && date(startsAt) ? date(startsAt) : null,
      expiresAt: !directory && temporalValid ? expiresAt : null, lifecycle, current, retained,
      directoryCurrent: directory, inventoryReported: availability, staleOrUnconfirmed: availability && !current,
      soldOut: !directory && raw.sold_out, identityConflict,
      publicationObserved: false, customerEligibilityProven: false });
  }
  for (const [reason, rows] of [...gapCounts].sort(([a], [b]) => a.localeCompare(b))) gaps.push({ reason, rows });
  const unique = [...new Map(premises.map(row => [JSON.stringify(canonical(row)), row])).entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row);
  const output = { contractVersion: 'bourbon-signal/verified-retailer-premises-baseline@1', capturedAt: new Date(now).toISOString(), statementAt,
    premises: unique, gaps,
    provenance: { statementSha256: createHash('sha256').update(VERIFIED_RETAILER_PREMISES_BASELINE_SQL).digest('hex'), premisesSha256: hash(unique) },
    historyGaps: ['deleted_submissions_unavailable', 'revoked_or_unverified_history_excluded', 'rejected_or_unsupported_history_excluded',
      'overwritten_store_identities_unavailable', 'publication_audit_unavailable'],
    completeness: { currentlyVerifiedScopeComplete: gaps.length === 0, verifiedStoreDirectoryIncluded: true, reviewedSubmissionRetentionIncluded: true,
      historicalAbsenceProven: false, retainedHistoryComplete: false, publicationHistoryComplete: false, deletedOrRevokedHistoryIncluded: false },
    limits: { rawRows: MAX_ROWS, responseBytes: MAX_BYTES, sentinelRows: 1 },
    caveats: ['Only reviewed supported submissions and stores joined to both currently verified authorities are included.',
      'Deleted submissions, revoked/unverified accounts or stores, rejected/unsupported submissions and prior overwritten identities remain historical gaps.',
      'There is no publication audit: reviewed retained records do not prove earlier customer display or a previous physical inventory connection.',
      'Current means conservative live retailer reporting, not normal customer eligibility, shelf stock, a new store or source activation.',
      'A verified directory row establishes identity context only; address/name aliases still require physical-premise reconciliation.',
      'SQL/output sentinel and byte guards bound returned data after retrieval, not total database scan or streaming transfer work.'] };
  if (Buffer.byteLength(JSON.stringify(output)) > MAX_BYTES) throw fail();
  return output;
}
