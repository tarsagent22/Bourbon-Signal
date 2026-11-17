import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { DROP_TIERS, engineLibraryRecords, isLibraryDetectionTarget, libraryIdentityKey } from './core/library-catalog.mjs';
import { cityHiveSafeBottleMatch } from './collectors/safe-bottle-match.mjs';
import { STATE_LIFECYCLE, CUSTOMER_ACTIVE_STATE_IDS } from './state-lifecycle.mjs';
import { libraryDetectionQueries, LIBRARY_SEARCH_LANES } from './library-query-plan.mjs';
import { precisionRetrievalAuditInputs } from './collectors/precision-probes.mjs';
import { WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST } from './collectors/west-virginia-official.mjs';
import { isPublicDropFeedEligible } from '../../src/lib/public-drop-evidence.ts';

export const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const json = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const ADDITIONAL_JURISDICTIONS = ['DC', 'MD-MONTGOMERY'];
const AUDITED_JURISDICTIONS = [...US_STATES, ...ADDITIONAL_JURISDICTIONS];
const rowsOf = (value, key) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const timestamp = row => Date.parse(row.observedAt || row.lastSeenAt || row.timestamp || '');
const sourceIdentity = row => JSON.stringify([row.storeId || '', row.sourceUrl || '', row.rawName || '']);

export function isLibraryObservation(row, record, sourceRows = new Map()) {
  if (!record) return false;
  if (row.canonicalId === record.id || row.canonicalBottleId === record.id) return true;
  // Retailer exports intentionally retain source display names and hashed IDs.
  // Bind them back to the same premise/product/title, rather than fuzzily
  // identifying display text or counting every store in a chain as a match.
  const source = row.storeId && row.sourceUrl && row.rawName ? sourceRows.get(sourceIdentity(row)) : null;
  if (source && (source.canonicalBottleId === record.id || source.canonicalId === record.id)) return true;
  return !row.canonicalId && !row.canonicalBottleId
    && libraryIdentityKey(row.canonicalName || row.bottleName || row.rawName) === libraryIdentityKey(record.canonical);
}

function verifiedStateQueries(report, state, nowMs, maxAgeMs) {
  const { startedAt, finishedAt, metadata, precisionMetadata } = report || {};
  if (report?.stale || report?.sourceStale) return [];
  const current = at => {
    const time = Date.parse(at || '');
    return Number.isFinite(time) && time >= Date.parse(startedAt || '')
      && time <= Date.parse(finishedAt || '') && time <= nowMs && nowMs - time <= maxAgeMs;
  };
  const precision = [precisionMetadata?.xapi?.requests, precisionMetadata?.librarySearch?.requests,
    precisionMetadata?.smartFinal?.searches].flatMap(requests => requests || [])
    .filter(request => request.ok && (!request.kind || request.kind === 'inventory') && current(request.requestedAt));
  const cityHive = metadata?.cityhive;
  const cityHiveQueries = cityHive?.complete === true && cityHive.cacheReused !== true && current(cityHive.sourceObservedAt)
    ? rowsOf(cityHive.requests).flatMap(request => {
      const url = URL.parse(request.url);
      const term = url?.searchParams.get('ch-query');
      return request.status === 200 && request.ok && url?.protocol === 'https:'
        && url.pathname === '/shop/' && term?.trim() ? [{ term }] : [];
    }) : [];
  const grocery = ['AK', 'LA'].includes(state) && ['closed_profile_verified', 'positive_evidence_only'].includes(metadata?.productionAdmission?.status)
    ? rowsOf(metadata.requests).filter(request => request.kind === 'inventory'
      && request.ok && current(request.observedAt)) : [];
  const wyoming = state === 'WY' && metadata?.grocery?.complete === true
    ? rowsOf(metadata.grocery.receipts).filter(request => request.status === 200 && request.term && current(request.observedAt)
      && !rowsOf(metadata.grocery.unconfirmedQueries).some(item => item.storeId === request.storeId && item.term === request.term))
    : [];
  return [...precision, ...cityHiveQueries, ...grocery, ...wyoming];
}

export function buildLibraryCoverageAudit({ bible, catalog, reports = {}, drops = [], alerts = [], stats = {}, nowMs = Date.now(), maxAgeMs = 2 * 3_600_000 }) {
  if (catalog.digest !== bible.libraryCatalog?.digest) throw new Error('Audit catalog differs from the engine build');
  const matcher = new BourbonBible(bible.records);
  const targets = engineLibraryRecords(catalog.records).filter(isLibraryDetectionTarget);
  const fresh = row => { const age = nowMs - timestamp(row); return Number.isFinite(age) && age >= -60_000 && age <= maxAgeMs && !row.stale && !row.sourceStale && !row.raw?.staleFallback; };
  const inventoryRows = drops.filter(row => fresh(row) && isPublicDropFeedEligible(row));
  const queryPool = new Set(libraryDetectionQueries(matcher).map(libraryIdentityKey));
  const cells = [];
  for (const state of AUDITED_JURISDICTIONS) {
    const active = CUSTOMER_ACTIVE_STATE_IDS.has(state);
    const lifecycle = STATE_LIFECYCLE[state];
    const report = reports[state];
    const signals = report?.signals || [];
    const sourceRows = new Map(signals.map(row => [sourceIdentity(row), row]));
    const currentQueries = verifiedStateQueries(report, state, nowMs, maxAgeMs);
    const searchPlans = report?.precisionMetadata?.librarySearch?.plans || [];
    const plan = precisionRetrievalAuditInputs(state);
    if (state === 'WV') plan.pinnedProducts = WEST_VIRGINIA_RECENT_PURCHASE_WATCHLIST.map(row => ({ name: row.query, code: row.expectedProductId }));
    for (const bottle of targets) {
      const result = cityHiveSafeBottleMatch(bottle.canonicalName, matcher);
      const record = result.record;
      const sameBottle = row => isLibraryObservation(row, record, sourceRows);
      const observed = signals.filter(sameBottle);
      const published = inventoryRows.filter(row => row.state === state && sameBottle(row));
      const alertRows = alerts.filter(row => row.state === state && fresh(row) && sameBottle(row)
        && row.action === 'inventory_alert_candidate' && row.eligibleForOnSite === true && !(row.blockers?.length) && row.alertSuppressed !== true);
      const tier = bottle.stateOverrides.find(o => o.jurisdiction === state)?.tier || bottle.nationalTier;
      const directQuery = currentQueries.some(q => libraryIdentityKey(q.term) === libraryIdentityKey(bottle.canonicalName));
      cells.push({ state, bottleId: bottle.id, canonicalName: bottle.canonicalName, tier, targetInState: DROP_TIERS.has(tier),
        engineId: record?.id || null, exactMatch: Boolean(record), matchIssue: result.unsafeReason,
        retrieval: !active ? 'no_active_state_collector' : state === 'AZ' && queryPool.has(libraryIdentityKey(bottle.canonicalName)) ? 'bounded_broad_search_and_targeted_rotation' : 'bounded_sources_completeness_unverified',
        searchedExactExpressionThisRun: active ? directQuery : null,
        libraryRotationPlanned: searchPlans.some(plan => plan.targetCount >= targets.length),
        familySearchSucceededThisRun: currentQueries.some(q => libraryIdentityKey(q.term).length >= 4 && libraryIdentityKey(bottle.canonicalName).includes(libraryIdentityKey(q.term))),
        knownLaneQueryTermHits: plan.knownQueryTerms.filter(term => libraryIdentityKey(bottle.canonicalName).includes(libraryIdentityKey(term))),
        knownLaneProductIds: plan.pinnedProducts.filter(product => {
          const hit = cityHiveSafeBottleMatch(product.name, matcher).record;
          return hit && hit.id === record?.id;
        }).map(product => product.code),
        evidenceClass: active ? lifecycle?.coverageTier || 'unverified' : state === 'MD' ? 'montgomery_county_only_separate_row' : 'unsupported',
        sourceObservedRows: observed.length, freshSourceRows: report?.stale || report?.sourceStale ? 0 : observed.filter(fresh).length,
        freshPublicRows: published.length, freshPublicStores: new Set(published.map(row => row.storeId).filter(Boolean)).size,
        inventoryAlertCandidateRows: alertRows.length,
        libraryAlertEligible: bottle.isAlertEligible ?? null,
        stateInventoryAlertsPermitted: active && lifecycle?.inventoryAlertable !== false,
        reportFinishedAt: report?.finishedAt || null,
        status: !active ? 'unsupported' : !record ? 'matching_gap' : published.length ? 'fresh_public_evidence' : 'no_fresh_public_evidence',
      });
    }
  }
  const states = AUDITED_JURISDICTIONS.map(state => {
    const rows = cells.filter(row => row.state === state);
    return { state, active: CUSTOMER_ACTIVE_STATE_IDS.has(state), evidenceClass: rows[0]?.evidenceClass,
      targetCount: rows.filter(row => row.targetInState).length, exactMatchCount: rows.filter(row => row.exactMatch).length,
      freshPublicBottleCount: rows.filter(row => row.freshPublicRows > 0).length,
      inventoryAlertBottleCount: rows.filter(row => row.inventoryAlertCandidateRows > 0).length,
      sourceRoadblockCount: reports[state]?.roadblocks?.length ?? null,
      librarySearchLanes: LIBRARY_SEARCH_LANES[state] || [],
      librarySearchPlans: reports[state]?.precisionMetadata?.librarySearch?.plans || [],
      librarySearchRequests: reports[state]?.precisionMetadata?.librarySearch?.requests || [],
      retrievalGap: !CUSTOMER_ACTIVE_STATE_IDS.has(state) ? 'needs_verified_active_source' : ['VA','WV'].includes(state) ? 'reviewed_product_codes_only_needs_catalog_discovery' : LIBRARY_SEARCH_LANES[state] ? 'library_rotation_and_bounded_retrieval_need_store_expression_sweep' : 'bounded_catalog_pages_and_source_coverage_need_expansion',
      knownLane: precisionRetrievalAuditInputs(state), exhaustiveDetectionVerified: false };
  });
  return { schemaVersion: 1, generatedAt: new Date(nowMs).toISOString(), runId: stats.runId || null,
    library: { count: catalog.records.length, targetCount: targets.length, digest: catalog.digest, mode: bible.libraryCatalog.mode, fetchedAt: catalog.fetchedAt },
    auditFreshnessWindowMs: maxAgeMs, stateCount: US_STATES.length, additionalJurisdictions: ADDITIONAL_JURISDICTIONS,
    matchingGapCount: targets.filter(bottle => !cityHiveSafeBottleMatch(bottle.canonicalName, matcher).record).length,
    caveat: 'Matching is capability, not inventory. Bounded retrieval is not exhaustive. No fresh public evidence means unknown availability, never out of stock. Maryland county coverage is not statewide. Alert candidate counts do not prove delivery.',
    arizona: { queryPoolSize: queryPool.size, selectedStores: reports.AZ?.precisionMetadata?.xapi?.selectedStores?.length ?? null,
      maxTargetedQueriesPerRun: 16, fullStoreExpressionSweepVerified: false,
      smartAndFinal: 'Library-wide selected-store search with independent product-page stock verification; bounded pages and detail slots.' },
    states, cells };
}

export function libraryCoverageMarkdown(audit) {
  return `# Library detection coverage\n\nGenerated ${audit.generatedAt}; snapshot ${audit.runId || 'not supplied'}.\n\n${audit.library.count} library entries; ${audit.library.targetCount} scarce-bottle targets (national or state limited/allocated/unicorn); ${audit.matchingGapCount} exact-name matching gaps.\n\n${audit.caveat}\n\n| State / jurisdiction | Active | Target bottles | Fresh public bottles | Inventory alert candidate bottles | Exhaustive retrieval verified |\n|---|---|---:|---:|---:|---|\n${audit.states.map(row => `| ${row.state} | ${row.active ? 'Yes' : 'No'} | ${row.targetCount} | ${row.freshPublicBottleCount} | ${row.inventoryAlertBottleCount} | No |`).join('\n')}\n\nThe JSON contains every bottle/jurisdiction pair, exact matching, retrieval limits, source freshness, public observations and alert eligibility. Arizona targets rotate within 16 supplemental searches per run. Every store/expression is not checked on each refresh. Smart & Final discovers library targets through selected-store searches and independently verifies product-page stock. Other searchable lanes persist library rotation; unsupported states and pinned-product lanes remain explicit retrieval gaps.\n`;
}

async function main() {
  const out = path.resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || 'out');
  const bible = await json(path.join(out, 'bourbon-bible.json'));
  const catalog = await json(path.join(out, 'library-catalog.json'));
  const stats = await json(path.join(out, 'site/stats.json'));
  const reports = Object.fromEntries(await Promise.all(AUDITED_JURISDICTIONS.map(async state => [state, await json(path.join(out, `states/${state}.json`), {})])));
  const dropPayload = await json(path.join(out, 'site/drops.json'));
  const alertPayload = await json(path.join(out, 'site/alerts.json'));
  if (!stats.runId || stats.runId !== dropPayload.runId || stats.runId !== alertPayload.runId) throw new Error('Audit requires one coherent exported snapshot');
  const drops = rowsOf(dropPayload, 'drops');
  const alerts = rowsOf(alertPayload, 'alerts');
  const audit = buildLibraryCoverageAudit({ bible, catalog, reports, stats, drops, alerts });
  await mkdir(path.join(out, 'verification'), { recursive: true });
  await writeFile(path.join(out, 'verification/library-coverage.json'), JSON.stringify(audit, null, 2));
  await writeFile(path.join(out, 'verification/library-coverage.md'), libraryCoverageMarkdown(audit));
  if (audit.matchingGapCount) throw new Error(`Library has ${audit.matchingGapCount} canonical matching gaps; see audit`);
  console.log(`Audited ${audit.library.targetCount} target bottles across all 50 states plus DC and Montgomery County; no exhaustive-coverage claim.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
