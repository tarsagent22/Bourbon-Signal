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
  'CANDIDATE_POOL_PER_USER',
  '.slice(0, Math.max(1, CANDIDATE_POOL_PER_USER))',
  'candidateAlertRank',
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
]) {
  if (!delivery.includes(phrase)) fail(`Alert delivery policy missing: ${phrase}`);
}

if (!/if \(!isPaidTier\(publicMetadata\)\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Free users must be skipped before alert matching or channel delivery.');
}

if (!/if \(!hasSavedAreaPreferences\(areaPrefs\)\) \{[\s\S]*?continue;/.test(delivery)) {
  fail('Users without saved area preferences must be skipped before alert matching or channel delivery.');
}

if (!/const matchingPreferenceCandidates = candidates[\s\S]*?\.sort\(sortCandidatesForMember\)[\s\S]*?\.slice\(0, Math\.max\(1, CANDIDATE_POOL_PER_USER\)\);/.test(delivery)) {
  fail('Delivery must keep a ranked candidate pool per user so deduped top candidates do not block lower matching alerts.');
}

if (!/usersMatched \+= 1/.test(delivery) || /emails?\S*Matched[\s\S]*?usersMatched \+= 1/.test(delivery)) {
  fail('usersMatched should count matched paid users, not email-only channel sends.');
}

if (!route.includes('Bourbon Signal alert delivery summary')) {
  fail('Cron route should emit a visible ops summary for every run.');
}

if (!/"path"\s*:\s*"\/api\/alerts\/deliver"/.test(vercel) || !/"schedule"\s*:\s*"\*\/30 \* \* \* \*"/.test(vercel)) {
  fail('Vercel cron must invoke /api/alerts/deliver every 30 minutes.');
}

if (process.exitCode) {
  console.error('Alert delivery policy verification failed.');
  process.exit(process.exitCode);
}

console.log('Alert delivery policy verified.');
