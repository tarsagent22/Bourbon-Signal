import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const delivery = read('src/lib/alert-delivery.ts');
const communityCandidates = read('src/lib/community-alert-candidates.ts');
const runSafety = read('src/lib/alert-run-safety.ts');
const exportContract = read('engine/src/export-site-contract.mjs');
const route = read('src/app/api/alerts/deliver/route.ts');
const vercel = read('vercel.json');

for (const phrase of [
  'getServerEntitlements(publicMetadata)',
  'skippedFreeUsers',
  'paidUsersConsidered',
  'hasSavedAreaPreferences(areaPrefs)',
  'skippedNoAreaPreferences',
  '.sort(sortCandidatesForMember)',
  'groupCandidatesByLocation',
  'alertRarityIsSelected(candidate.tier ?? candidate.rarityTier, notificationPrefs.rarityTiers)',
  'bottleNames: candidateBottleNames(candidate)',
  'Array.isArray(source.bottleNames)',
  'CANDIDATE_POOL_PER_USER',
  '.slice(0, Math.max(1, CANDIDATE_POOL_PER_USER))',
  'location-group:',
  'recentDeliverySet',
  'underlyingStableKeys',
  'dedupeIdentityVersion',
  'reserveAlertDeliveryBatch',
  'alertWindow: "stable-v2"',
  'markBatchDelivered',
  'markBatchFailed',
  'deliveryChannel === "watch_candidate"',
  'isActionableWatch',
  'recentDeliverySet',
  'onSiteBaselineDedupeKeys',
  'baselineOnSiteOnly',
  'emailBaselineDedupeKeys',
  'smsBaselineDedupeKeys',
  'MAX_EMAILS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_EMAILS_PER_USER || 1)',
  'MAX_SMS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_SMS_PER_USER || 1)',
  'MAX_ONSITE_ALERTS_PER_USER = Number(process.env.ALERT_DELIVERY_MAX_ONSITE_ALERTS_PER_USER || 1)',
  'candidateCanUseOnSite',
  'candidatePassesFreshOnSiteGuardrails',
  'eligibleForEmail === true',
  'eligibleForSms === true',
  'freshnessPolicyHours',
  'ALERT_REALTIME_MAX_FRESHNESS_HOURS',
  'Math.min(candidateLimit, ALERT_REALTIME_MAX_FRESHNESS_HOURS)',
]) {
  if (!delivery.includes(phrase)) fail(`Alert delivery policy missing: ${phrase}`);
}

if (!/const entitlements = await getServerEntitlements\(publicMetadata\);[\s\S]*?if \(entitlements\.tier === "free"\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Free users must be skipped before alert matching or channel delivery.');
}

if (!/entitlements\.canReceiveSightingsAlerts && notificationPrefs\.sightings\.enabled/.test(delivery)) {
  fail('Community sighting alerts must recheck the current durable entitlement at delivery time.');
}

if (!/listRecentAlertSightings\(since, now\.toISOString\(\)\)[\s\S]*qualifyCommunitySighting[\s\S]*reserveAlertAuthority[\s\S]*buildCommunityAlertCandidates/.test(delivery)) {
  fail('Community standing and rolling allowance must produce one common eligible candidate set before channel delivery.');
}

if (/unconfirmed/i.test(communityCandidates)) {
  fail('Community alert copy must never apply an unconfirmed label.');
}

if (!/if \(!hasSavedAreaPreferences\(areaPrefs\)\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Users without saved area preferences must be skipped before alert matching or channel delivery.');
}

if (!/const allMatchingPreferenceCandidates = groupCandidatesByLocation\(candidates[\s\S]*?\.sort\(sortCandidatesForMember\)\);[\s\S]*?const matchingPreferenceCandidates = allMatchingPreferenceCandidates[\s\S]*?\.slice\(0, Math\.max\(1, CANDIDATE_POOL_PER_USER\)\);/.test(delivery)) {
  fail('Delivery must retain the full grouped match set for migration before slicing the ranked provider pool.');
}

if (!/function recentDeliverySet[\s\S]*?return new Set[\s\S]*?\.filter\(\(record\) => \(record\.channel \|\| "email"\) === channel\)[\s\S]*?deliveryDedupeToken/.test(delivery) || /const cutoff = Date\.now\(\) - DELIVERY_DEDUPE_WINDOW_HOURS/.test(delivery)) {
  fail('Delivery dedupe must not expire after 24 hours; duplicate sends should stay suppressed while metadata is retained.');
}

if (!/usersMatched \+= 1/.test(delivery) || /emails?\S*Matched[\s\S]*?usersMatched \+= 1/.test(delivery)) {
  fail('usersMatched should count matched paid users, not email-only channel sends.');
}

if (!route.includes('Bourbon Signal alert delivery summary')) {
  fail('Cron route should emit a visible ops summary for every run.');
}

if (!/"path"\s*:\s*"\/api\/alerts\/deliver\?cron=v3"/.test(vercel) || !/"schedule"\s*:\s*"\*\/5 \* \* \* \*"/.test(vercel)) {
  fail('Vercel cron must invoke /api/alerts/deliver?cron=v3 every 5 minutes.');
}

if (!/!dryRun\s*&&\s*!baselineOnSiteOnly\s*&&\s*!baselineEmailOnly\s*&&\s*!baselineSmsOnly/.test(delivery)) {
  fail('Disabled delivery must still allow operator baseline modes to inspect and block queued candidates.');
}

if (!route.includes('ALERT_MONITOR_ONLY') || !route.includes('monitorOnly')) {
  fail('Scheduled alert delivery must support an explicit monitor-only mode that forces dry-run execution.');
}

if (!/const alertExecutionIsReadOnly = dryRun \|\| queueMode === "shadow" \|\| monitorOnly \|\| testEmail \|\| baselineModeCount > 0;/.test(route)
  || !/const giftMaintenanceDue = scheduledRun[\s\S]*?!alertExecutionIsReadOnly[\s\S]*?resolveGiftDeliveryMode\(true\) === "live"/.test(route)) {
  fail('Dry-run, shadow, monitor, test, and baseline alert requests must not invoke gift mutation workers.');
}

if (!/const dryRun = options\.dryRun === true \|\| requestedQueueMode === "shadow"/.test(delivery)) {
  fail('Queue shadow mode must force dry-run behavior even if an environment toggle is misconfigured.');
}

if (!runSafety.includes('ALERT_FRESHNESS_HARD_CAP_HOURS = 1') || !delivery.includes('resolveAlertFreshnessCapHours')) {
  fail('Every alert delivery channel must enforce the non-configurable one-hour freshness ceiling.');
}

if (!delivery.includes('signalFreshnessHoursAt(asString(candidate.signalAt), now)')
  || !exportContract.includes('signalAt: c.signalAt || null')
  || !exportContract.includes('signalAt: dropSignalAt(drop)')) {
  fail('Final delivery must recompute age from the canonical signal timestamp rather than trusting export-time freshness.');
}

if (!delivery.includes('if (!candidatePassesFreshEmailGuardrails(candidate))')
  || !delivery.includes('if (!candidatePassesFreshSmsGuardrails(candidate))')
  || !delivery.includes('await pruneStaleOnSiteAlerts()')) {
  fail('On-site, email, and SMS must each recheck freshness at their final provider or metadata mutation boundary.');
}

if (!delivery.includes('suppressStaleQueuedIntent') || !delivery.includes('stale_at_final_delivery_boundary')) {
  fail('Queue claims that age out before send must be terminally suppressed instead of retried.');
}

if (/Promise\.all\([^)]*(?:reserveAlertDelivery|enqueue|claim)/s.test(delivery)) {
  fail('Grouped queue reservation must use one atomic batch operation, not Promise.all of child operations.');
}

if (!/idempotencyKey:[\s\S]*claimedChildCandidateIds/s.test(delivery)) {
  fail('Grouped email provider idempotency must derive from the claimed child candidate IDs.');
}

if (!runSafety.includes('future_alert_snapshot')) {
  fail('Substantially future-dated snapshots must fail closed.');
}

for (const finalBoundary of [
  '.filter((candidate) => candidatePassesFreshOnSiteGuardrails(candidate))',
  '.filter((candidate) => candidatePassesFreshEmailGuardrails(candidate))',
  '.filter((candidate) => candidatePassesFreshSmsGuardrails(candidate))',
]) {
  if (!delivery.includes(finalBoundary)) fail(`Missing final channel freshness boundary: ${finalBoundary}`);
}

if (!runSafety.includes('resolveAlertSnapshotMaxAgeMinutes') || !runSafety.includes('Math.min(Number(configured), 60)')) {
  fail('Snapshot-age configuration must not widen beyond one hour.');
}

const freshnessTable = exportContract.match(/function maxFreshnessForActionability[\s\S]*?const table = \{([\s\S]*?)\n  \};/u)?.[1] || '';
const widenedFreshness = [...freshnessTable.matchAll(/(?:onSite|email|sms):\s*(\d+(?:\.\d+)?)/gu)]
  .map((match) => Number(match[1]))
  .filter((value) => value > 1);
if (widenedFreshness.length) {
  fail(`Engine alert policy widens ${widenedFreshness.length} channel freshness window(s) past one hour.`);
}

if (process.exitCode) {
  console.error('Alert delivery policy verification failed.');
  process.exit(process.exitCode);
}

console.log('Alert delivery policy verified.');
