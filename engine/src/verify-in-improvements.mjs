import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INDIANA_PAYLESS_SOURCE } from './collectors/indiana-retailer-matching.mjs';
import { INDIANA_CAPTURED_SOURCE_DENIALS } from './collectors/indiana-source-denial-policy.mjs';
import { CITYHIVE_RARE_BRAND_PROBE_POLICY } from './collectors/cityhive-rare-probes.mjs';
import { stableId } from './core/text.mjs';

export const LEGACY_INDIANA_VERIFIER_SHA256 = 'e3afce1dd06d4036a237654e7b75802983ab32bfbc66d6d0b963b7174c1402f5';
const POLICY = 'in-captured-direct-403-routes-disabled-20261022';
const DENIAL_CLOCK = '2026-10-22T19:34:58.190Z';
const DENIAL_CLOCK_KIND = 'aggregate_precision_finish_upper_bound';
const DENIAL_REPORT_SHA256 = '9e2de7c706414f4081bcc388e296594fa4bb0716e0d31fff6dc18b45ccdff74d';
const text = (value) => String(value || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const words = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const sourceLabel = (row) => row?.sourceLabel || row?.source || '';
const inIndiana = (row) => row?.state === 'IN' || row?.stateCode === 'IN';
const alertable = (row) => row?.canAlertAsInventory === true || row?.canAlertAsWatch === true || row?.alertable === true;
const canonicalId = (row) => row?.canonicalBottleId || row?.canonicalId || row?.bottleId || null;
const canonicalNames = (row) => [row?.canonicalName, row?.bottleName, row?.bottle, row?.canonical].filter((value) => typeof value === 'string' && value.trim());
const isPayless = (row) => sourceLabel(row) === INDIANA_PAYLESS_SOURCE.label || String(row?.storeId || '').startsWith('payless-liquors:');
const isSentinel = (row) => [row?.reportedQuantity, row?.raw?.reportedQuantity, row?.raw?.option?.quantity]
  .some((value) => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 100)
  || row?.binaryAvailability === true || row?.raw?.binaryAvailability === true
  || row?.quantitySemantics === 'binary_cityhive_availability_no_exact_count';
const validIso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function sameCanonicalIdentity(row, source) {
  if (canonicalId(row) === canonicalId(source)) return true;
  // Indiana's existing exporter deliberately uses retailer-title identities.
  // Accept only that exact deterministic projection, not arbitrary new IDs.
  const expected = stableId(['IN', source.sourceLabel || source.sourceUrl, source.rawName || source.canonicalName || 'unknown']);
  return canonicalId(row) === expected && canonicalNames(row).length > 0
    && canonicalNames(row).every((name) => text(name) === text(source.rawName));
}

function mismatch(row, source) {
  const rawNames = [source?.rawName, row?.rawName, row?.raw?.product?.name].filter(Boolean).map(words);
  if (!rawNames.length) rawNames.push('');
  for (const raw of rawNames) for (const value of canonicalNames(row)) {
    const canonical = words(value);
    if (/\bwoodford\b/.test(raw) && /\brye\b/.test(raw) && !/\brye\b/.test(canonical)) return 'woodford_rye_matched_non_rye';
    if (/\bwild turkey\b/.test(canonical) && /\bmaster(?:s)?\b/.test(canonical) && !/\bmaster(?:s)?\b/.test(raw)) return 'wild_turkey_master_expression_missing';
  }
  return null;
}

function validPayless(row) {
  const proof = row?.sourceProductBinding || row?.raw?.productBinding;
  const expected = {
    contractVersion: INDIANA_PAYLESS_SOURCE.contractVersion,
    sourceTitle: text(row?.rawName), sourceProductUrl: INDIANA_PAYLESS_SOURCE.url,
    storeId: INDIANA_PAYLESS_SOURCE.storeId, storeAddress: INDIANA_PAYLESS_SOURCE.storeAddress,
    observedAt: row?.observedAt,
    pickupLocationEvidence: 'Available at our East Street location',
    pickupAvailabilityEvidence: 'Stop by and pick your bottle up today!',
  };
  const proofs = [proof, row?.sourceProductBinding, row?.raw?.productBinding].filter(Boolean);
  return sourceLabel(row) === INDIANA_PAYLESS_SOURCE.label && row.sourceUrl === INDIANA_PAYLESS_SOURCE.url
    && row.storeId === INDIANA_PAYLESS_SOURCE.storeId && row.storeAddress === INDIANA_PAYLESS_SOURCE.storeAddress
    && Boolean(expected.sourceTitle) && validIso(row.observedAt) && row.locationPrecision === 'store_level'
    && row.quantity === 0 && (row.storeQty == null || row.storeQty === 0) && row.quantityIsExact === false
    && row.quantitySemantics === 'binary_retailer_pickup_no_exact_count'
    && row.sourceAvailabilityVerified === true && row.availabilityStatus === 'in_stock'
    && proofs.length > 0 && proofs.every((entry) => Object.entries(expected).every(([key, value]) => entry[key] === value));
}

function validSentinel(row) {
  return row.quantity === 0 && (row.storeQty == null || row.storeQty === 0)
    && row.quantityIsExact === false && row.sourceAvailabilityVerified === true
    && row.availabilityStatus === 'binary_retailer_in_stock'
    && row.quantitySemantics === 'binary_cityhive_availability_no_exact_count';
}

function validDenialEvidence(evidence, route) {
  return evidence?.runId === 39854435934 && evidence.reportPath === 'states/IN.json'
    && evidence.reportSha256 === DENIAL_REPORT_SHA256 && evidence.reportFinishedAt === '2026-10-22T20:27:28.250Z'
    && evidence.sourceRuntimeId === 'precision:in' && evidence.sourceResultStatus === 'not_due'
    && evidence.sourceAttemptCount === 0 && evidence.aggregatePrecisionCheckedAt === DENIAL_CLOCK
    && evidence.clockSemantics === DENIAL_CLOCK_KIND && evidence.individualRequestFinishedAt === null
    && evidence.source === route.source && evidence.url === route.url && evidence.httpStatus === 403;
}

export function diagnoseIndianaImprovementsArtifact({ state, drops, alerts } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(state?.state === 'IN' && Array.isArray(state.signals) && Array.isArray(state.roadblocks), 'An actual Indiana state report with signals and roadblocks is required.');
  check(Array.isArray(drops?.drops), 'The actual public drops export is required.');
  check(Array.isArray(alerts?.candidates) || Array.isArray(alerts?.alerts), 'The actual reported alerts export is required.');
  check(typeof drops?.runId === 'string' && Boolean(drops.runId) && drops.runId === alerts?.runId, 'Indiana public drops and alerts must name the same nonempty export run.');
  const sources = (Array.isArray(state?.signals) ? state.signals : []).filter(inIndiana);
  const publicRows = (Array.isArray(drops?.drops) ? drops.drops : []).filter(inIndiana);
  const alertSurfaces = ['candidates', 'alerts'].flatMap((key) => (Array.isArray(alerts?.[key]) ? alerts[key] : [])
    .filter(inIndiana).map((row, index) => ({ row, surface: `${key}[${index}]` })));
  const findSource = (row) => {
    const candidates = sources.filter((source) => source.storeId === row.storeId && source.sourceUrl === row.sourceUrl);
    const matches = candidates.filter((source) =>
      row.rawName ? text(source.rawName) === text(row.rawName) : canonicalId(source) === canonicalId(row));
    return matches.length === 1 ? matches[0] : candidates.length === 1 ? candidates[0] : null;
  };
  const counters = { checkedPaylessRows: 0, checkedSentinelRows: 0, retainedNonalertableLegacyRows: 0 };
  function inspect(row, surface, source, requiresProof) {
    const unsafe = mismatch(row, source);
    check(!unsafe, `${surface}: prohibited Indiana bottle identity (${unsafe}).`);
    if (!requiresProof) {
      if (isPayless(row) || isSentinel(row)) counters.retainedNonalertableLegacyRows++;
      return;
    }
    const payless = isPayless(row), sentinel = isSentinel(row) || isSentinel(source);
    if (payless) { counters.checkedPaylessRows++; check(validPayless(row), `${surface}: Payless pickup must retain zero quantity, nonexact semantics and its exact premises/title/original-time proof.`); }
    if (sentinel) { counters.checkedSentinelRows++; check(validSentinel(row), `${surface}: CityHive sentinel availability cannot invent an exact quantity.`); }
    if (surface !== 'state' && (payless || sentinel)) {
      check(Boolean(source) && source.observedAt === row.observedAt && sameCanonicalIdentity(row, source)
        && source.quantity === row.quantity && source.quantityIsExact === row.quantityIsExact
        && source.quantitySemantics === row.quantitySemantics && source.storeAddress === row.storeAddress
        && source.sourceAvailabilityVerified === row.sourceAvailabilityVerified
        && source.availabilityStatus === row.availabilityStatus && !mismatch(source),
      `${surface}: published binary availability lacks the same accepted state source, original observation, canonical identity or quantity semantics.`);
      if (source) check(payless ? validPayless(source) : validSentinel(source), `${surface}: its state source lacks accepted binary availability proof.`);
    }
  }
  for (const row of sources) {
    // Legacy retained rows may remain nonalertable diagnostics. Public rows and
    // actual reported alerts never get this exception for the two bad identities.
    if (alertable(row)) inspect(row, 'state', row, true);
    else if (isPayless(row) || isSentinel(row)) counters.retainedNonalertableLegacyRows++;
  }
  publicRows.forEach((row, index) => inspect(row, `drops[${index}]`, findSource(row), alertable(row)));
  alertSurfaces.forEach(({ row, surface }) => inspect(row, `alerts.${surface}`, findSource(row), true));

  const roadblocks = Array.isArray(state?.roadblocks) ? state.roadblocks : [];
  const policy = state?.precisionMetadata?.indianaSourcePolicy
    || state?.sourceResults?.find((row) => row.sourceId === 'precision:in')?.metadata?.indianaSourcePolicy;
  const keys = Object.keys(INDIANA_CAPTURED_SOURCE_DENIALS).sort();
  check(policy?.policyId === POLICY && policy.disabledRouteAttempts === 0, 'Indiana must retain its four disabled direct-route policy decisions with zero current HTTP attempts.');
  check(JSON.stringify([...(policy?.skippedSourceKeys || [])].sort()) === JSON.stringify(keys), 'Indiana disabled source keys must exactly cover the four captured denied routes.');
  for (const key of keys) {
    const route = INDIANA_CAPTURED_SOURCE_DENIALS[key];
    const rows = roadblocks.filter((row) => row.sourceKey === key || (row.source === route.source && row.url === route.url));
    check(rows.length === 1 && rows[0].state === 'IN' && rows[0].source === route.source && rows[0].url === route.url
      && rows[0].sourceKey === key && rows[0].sourceRuntimeId === 'precision:in' && rows[0].policyId === POLICY
      && rows[0].status === 'source_policy_disabled' && rows[0].attemptCount === 0 && rows[0].historicalHttpStatus === 403
      && rows[0].evidenceRuntimeFinishedAt === DENIAL_CLOCK && rows[0].evidenceClockSemantics === DENIAL_CLOCK_KIND
      && validDenialEvidence(rows[0].denialEvidence, route), `${key}: disabled-route roadblock must preserve zero attempts and the original bounded denial clock/provenance.`);
    const decisions = (policy?.decisions || []).filter((row) => row.sourceKey === key);
    check(decisions.length === 1 && decisions[0].attemptCount === 0 && validDenialEvidence(decisions[0].denialEvidence, route), `${key}: disabled-route metadata must preserve the original denial evidence with zero current attempts.`);
  }
  const canaryQueriesEnabled = Object.values(CITYHIVE_RARE_BRAND_PROBE_POLICY.IN || {}).some((brands) => brands.length > 0);
  check(!canaryQueriesEnabled, 'Indiana canary brand queries must remain disabled: the bounded canary did not establish additional public inventory.');
  return {
    status: errors.length ? 'failed' : 'ok', errors,
    sourceSignalCount: sources.length, publicRowCount: publicRows.length, reportedAlertRowCount: alertSurfaces.length,
    disabledRouteCount: keys.length, ...counters,
    metadata: { scope: 'identity_quantity_and_denial_safety', newPublicGainClaimed: 0, measuredProductionGain: null,
      coverageNote: 'No new public coverage is claimed. The bounded canary proved zero additional public rows; this verifier does not measure production coverage gains.',
      canaryQueriesEnabled, legacyVerifierRequired: 'src/verify-in.mjs' },
  };
}

export function verifyIndianaImprovementsArtifact(input) {
  const diagnostics = diagnoseIndianaImprovementsArtifact(input);
  if (diagnostics.status !== 'ok') {
    const error = new Error(`Indiana improvements verification failed:\n${diagnostics.errors.join('\n')}`);
    error.diagnostics = diagnostics;
    throw error;
  }
  return diagnostics;
}

async function main() {
  const out = path.resolve(process.env.BOURBON_SIGNAL_OUT_DIR || 'out');
  const diagnosticPath = path.join(out, 'verification', 'in-improvements.json');
  let input, diagnostics;
  try {
    const [state, drops, alerts] = await Promise.all(['states/IN.json', 'site/drops.json', 'site/alerts.json']
      .map(async (file) => JSON.parse(await readFile(path.join(out, file), 'utf8'))));
    input = { state, drops, alerts };
    diagnostics = diagnoseIndianaImprovementsArtifact(input);
  } catch (error) {
    diagnostics = { status: 'failed', errors: [`Unable to read or evaluate Indiana artifacts: ${error.message}`],
      metadata: { newPublicGainClaimed: 0, measuredProductionGain: null, canaryQueriesEnabled: Object.values(CITYHIVE_RARE_BRAND_PROBE_POLICY.IN || {}).some((brands) => brands.length > 0) } };
  }
  // Run the full, unchanged historical Indiana verifier. A diagnostic must be
  // saved even if its statewide coverage/freshness/coherence gates reject data.
  const legacyFile = fileURLToPath(new URL('./verify-in.mjs', import.meta.url));
  let legacy;
  try {
    const legacySource = (await readFile(legacyFile, 'utf8')).replace(/\r\n/g, '\n');
    const sha256 = createHash('sha256').update(legacySource).digest('hex');
    if (sha256 !== LEGACY_INDIANA_VERIFIER_SHA256) throw new Error('The full legacy Indiana verifier changed; its unchanged gate must be preserved.');
    if (path.basename(out) !== 'out') throw new Error('The legacy Indiana verifier requires an output directory named out.');
    const child = spawnSync(process.execPath, [legacyFile], { cwd: path.dirname(out), encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
    legacy = { status: child.status === 0 ? 'ok' : 'failed', exitCode: child.status, signal: child.signal, sha256,
      stdout: child.stdout?.trim().slice(0, 8000) || null, stderr: child.stderr?.trim().slice(0, 4000) || null, error: child.error?.message || null };
  } catch (error) { legacy = { status: 'failed', error: error.message }; }
  if (legacy.status !== 'ok') {
    diagnostics.status = 'failed';
    diagnostics.errors.push('The unchanged full legacy Indiana verifier did not pass.');
  }
  const report = { checkedAt: new Date().toISOString(), runId: input?.drops?.runId || null, ...diagnostics, legacyVerification: legacy };
  await mkdir(path.dirname(diagnosticPath), { recursive: true });
  await writeFile(diagnosticPath, JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'ok') throw new Error(`Indiana improvements verification failed:\n${report.errors.join('\n')}`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
