import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const failures = [];
const requireText = (file, text) => {
  const source = read(file);
  if (!source.includes(text)) failures.push(`${file} must include ${text}`);
};

for (const [header, value] of [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'includeSubDomains'],
  ['Permissions-Policy', 'camera=()'],
  ['Content-Security-Policy-Report-Only', 'frame-ancestors'],
]) {
  requireText('next.config.ts', header);
  requireText('next.config.ts', value);
}

const layout = read('src/app/layout.tsx');
if (layout.includes('https://bourbonsignal.com"')) failures.push('Root metadata must canonicalize to https://www.bourbonsignal.com.');
if (!layout.includes('https://www.bourbonsignal.com')) failures.push('Root metadata is missing the canonical www host.');

const sitemap = read('src/app/sitemap.ts');
if (sitemap.includes('/bottle-check')) failures.push('Protected Bottle Check must not be listed in the public sitemap.');
if (sitemap.includes('new Date()')) failures.push('Sitemap must not claim every URL changed at request time.');
for (const match of sitemap.matchAll(/url:\s*"([^"]+)"/g)) {
  assert.ok(match[1].startsWith('https://www.bourbonsignal.com'), `sitemap URL must use www: ${match[1]}`);
}

const middleware = read('src/middleware.ts');
if (!middleware.includes('"/bottle-check(.*)"')) failures.push('Bottle Check access protection must remain intact.');
if (!middleware.includes('hostname === "bourbonsignal.com"') || !middleware.includes('www.bourbonsignal.com') || !middleware.includes('308')) {
  failures.push('Middleware must permanently redirect the apex host to canonical www without changing route access policy.');
}
const robots = read('src/app/robots.ts');
if (!robots.includes('https://www.bourbonsignal.com/sitemap.xml')) failures.push('robots.ts must publish the canonical www sitemap URL.');

if (existsSync(path.join(root, 'src/components/sections/EmailCapture.tsx'))) {
  failures.push('Homepage email capture must remain removed; account creation owns newsletter enrollment.');
}
for (const requiredNewsletterPath of [
  'src/app/api/subscribe/route.ts',
  'src/app/api/webhooks/clerk/route.ts',
  'scripts/sync-clerk-members-to-resend.mjs',
  'docs/weekly-drop-digest.md',
]) {
  if (!existsSync(path.join(root, requiredNewsletterPath))) failures.push(`Missing account newsletter pipeline file: ${requiredNewsletterPath}`);
}
const clerkNewsletterWebhook = read('src/app/api/webhooks/clerk/route.ts');
for (const invariant of ['CLERK_WEBHOOK_SECRET', 'user.created', 'createNewsletterContact', 'svix-timestamp']) {
  if (!clerkNewsletterWebhook.includes(invariant)) failures.push(`Clerk newsletter webhook is missing ${invariant}.`);
}
const digestDocs = read('docs/weekly-drop-digest.md');
if (!digestDocs.includes('does not render an email capture form')) failures.push('Newsletter docs must distinguish account enrollment from a homepage signup form.');

const srcFiles = [
  'src/lib/alert-delivery.ts',
  'src/app/alerts/page.tsx',
  'src/app/dashboard/page.tsx',
].filter((file) => existsSync(path.join(root, file)));
for (const file of srcFiles) {
  if (/daily_roundup|daily roundup/iu.test(read(file))) failures.push(`${file} still exposes the nonexistent daily roundup mode.`);
}
const notificationPreferences = read('src/lib/notification-preferences.ts');
const legacyRoundupReferences = notificationPreferences.match(/daily_roundup/gu) || [];
if (legacyRoundupReferences.length !== 1 || !notificationPreferences.includes('legacyDailyRoundup = email.mode === "daily_roundup"')) {
  failures.push('Notification preference normalization must contain exactly one safe legacy daily-roundup migration and no active mode.');
}

for (const required of [
  'src/app/api/ops/health/route.ts',
  'src/lib/ops-health.ts',
  'scripts/release-production.mjs',
  'src/components/dashboard/NotificationChannelCard.tsx',
  'src/components/dashboard/NotificationChannelCard.module.css',
]) {
  if (!existsSync(path.join(root, required))) failures.push(`Missing operational hardening file: ${required}`);
}

const releaseOrchestrator = read('scripts/release-production.mjs');
const scheduledRefresh = read('engine/bourbon-signal-engine-refresh.ps1');
const deliveryRoute = read('src/app/api/alerts/deliver/route.ts');
const opsHealth = read('src/lib/ops-health.ts');
if (releaseOrchestrator.includes("git(tempRoot, ['push', 'origin', 'HEAD:main'])")) {
  failures.push('Release orchestrator must not mutate origin/main to stage generated exports.');
}
if (!scheduledRefresh.includes("$env:BOURBON_SIGNAL_AUTO_DEPLOY = '0'") || scheduledRefresh.includes("BOURBON_SIGNAL_AUTO_DEPLOY) { $env:BOURBON_SIGNAL_AUTO_DEPLOY } else { '1'")) {
  failures.push('Scheduled engine collection must never deploy directly to Vercel production.');
}
if (deliveryRoute.indexOf('assertAlertDeliveryAuthorized(req)') > deliveryRoute.indexOf('const startedAt')) {
  failures.push('Alert delivery authorization must happen before heartbeat-eligible execution starts.');
}
if (!deliveryRoute.includes('scheduledRun && !testEmail && baselineModeCount === 0')) {
  failures.push('Only authenticated scheduler monitor executions may write the delivery heartbeat; test and baseline requests must remain excluded.');
}
if (!deliveryRoute.includes('requestedDryRun || (monitorOnly && !testEmail && baselineModeCount === 0)')) {
  failures.push('Monitor-only scheduler executions must be forced to dry-run before delivery begins.');
}
if ((deliveryRoute.match(/if \(heartbeatEligible\)/gu) || []).length !== 2) {
  failures.push('Both successful and failed heartbeat writes must use the same strict eligibility predicate.');
}
if (!opsHealth.includes('access: "public"') || !opsHealth.includes('list({ prefix: HEARTBEAT_PATH') || !opsHealth.includes('fetch(url')) {
  failures.push('The sanitized operational heartbeat must use the project public Blob store and be read back without exposing sensitive data.');
}
for (const invariant of ['quality:states', 'siteExportSha256', 'assertCleanOriginMain', 'verify:production-live']) {
  if (!releaseOrchestrator.includes(invariant)) failures.push(`Release orchestrator is missing provenance invariant ${invariant}.`);
}
const promoteIndex = releaseOrchestrator.indexOf("['promote', deploymentUrl");
const aliasIndex = releaseOrchestrator.indexOf("['alias', 'set', deploymentUrl");
if (promoteIndex < 0 || aliasIndex < 0 || promoteIndex > aliasIndex) {
  failures.push('Release orchestrator must promote the verified deployment before assigning custom-domain aliases.');
}

if (failures.length) {
  console.error('Web/release contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Web/release contract verification passed.');
