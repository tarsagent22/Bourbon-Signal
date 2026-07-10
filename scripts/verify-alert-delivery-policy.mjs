import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const delivery = read('src/lib/alert-delivery.ts');
const route = read('src/app/api/alerts/deliver/route.ts');
const vercel = read('vercel.json');

for (const phrase of [
  'isPaidTier(publicMetadata)',
  'skippedFreeUsers',
  'paidUsersConsidered',
  'hasSavedAreaPreferences(areaPrefs)',
  'skippedNoAreaPreferences',
  '.sort(sortCandidatesForMember)',
  'groupCandidatesByLocation',
  'CANDIDATE_POOL_PER_USER',
  '.slice(0, Math.max(1, CANDIDATE_POOL_PER_USER))',
  'location-group:',
  'recentDeliverySet',
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

if (!/if \(!isPaidTier\(publicMetadata\)\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Free users must be skipped before alert matching or channel delivery.');
}

if (!/if \(!hasSavedAreaPreferences\(areaPrefs\)\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Users without saved area preferences must be skipped before alert matching or channel delivery.');
}

if (!/const matchingPreferenceCandidates = groupCandidatesByLocation\(candidates[\s\S]*?\.sort\(sortCandidatesForMember\)\)[\s\S]*?\.slice\(0, Math\.max\(1, CANDIDATE_POOL_PER_USER\)\);/.test(delivery)) {
  fail('Delivery must group a ranked candidate pool by location so members get one alert per store/board/location burst.');
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

if (!/const dryRun = options\.dryRun === true \|\| requestedQueueMode === "shadow"/.test(delivery)) {
  fail('Queue shadow mode must force dry-run behavior even if an environment toggle is misconfigured.');
}

if (process.exitCode) {
  console.error('Alert delivery policy verification failed.');
  process.exit(process.exitCode);
}

console.log('Alert delivery policy verified.');
