import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8');
}

function expectFile(relPath) {
  if (!existsSync(path.join(root, relPath))) {
    fail(`Missing required file: ${relPath}`);
    return '';
  }
  return read(relPath);
}

function expectNoModuleScopeStripe(relPath) {
  const source = read(relPath);
  const postIndex = source.indexOf('export async function POST');
  const stripeIndex = source.indexOf('new Stripe(');
  if (stripeIndex !== -1 && (postIndex === -1 || stripeIndex < postIndex)) {
    fail(`${relPath}: Stripe client must not be initialized at module scope; pre-launch/local builds should not require STRIPE_SECRET_KEY.`);
  }
  return source;
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.name !== 'bourbon-signal') {
  fail(`package.json name should be bourbon-signal, got ${packageJson.name}`);
}
if (!packageJson.scripts?.['test:ops']) {
  fail('package.json should expose test:ops for workflow guardrails.');
}

const enginePackageJson = JSON.parse(read('engine/package.json'));
if (!enginePackageJson.scripts?.['verify:site']) {
  fail('engine/package.json should expose verify:site for lightweight CI checks against checked-in site exports.');
}

const stateLifecycleConfig = JSON.parse(read('src/config/state-lifecycle.json'));
const customerStates = new Set(stateLifecycleConfig.activeStates || []);
const stateSources = read('engine/src/state-sources.mjs');
if (!/state-lifecycle\.mjs/.test(stateSources)) {
  fail('engine/src/state-sources.mjs should source CUSTOMER_ACTIVE_STATE_IDS from the shared state lifecycle config.');
}
if (customerStates.has('TX')) {
  fail('TX must not be in activeStates until Texas has stronger customer-facing data.');
}
for (const state of ['AL', 'IL', 'IN', 'NC', 'OH', 'PA', 'SC', 'TN', 'VA', 'IA', 'ID', 'UT', 'MD-MONTGOMERY', 'KY']) {
  if (!customerStates.has(state)) {
    fail(`Expected active customer state ${state} missing from shared state lifecycle config.`);
  }
}
for (const state of ['FL', 'GA', 'NH', 'OR']) {
  if (customerStates.has(state)) fail(`${state} should remain research-only until hardened enough for customer-facing coverage.`);
  if (stateLifecycleConfig.states?.[state]?.publicStatus !== 'research_only') {
    fail(`${state} should have explicit research_only lifecycle status.`);
  }
}
if (stateLifecycleConfig.states?.SC?.publicStatus !== 'active'
  || stateLifecycleConfig.states?.SC?.coverageTier !== 'live_store_inventory'
  || stateLifecycleConfig.states?.SC?.lifecycle !== 'retailer_store_inventory') {
  fail('SC should be active live_store_inventory only after verified 90+ public retailer store-inventory hardening.');
}
if (stateLifecycleConfig.states?.KY?.publicStatus !== 'active'
  || stateLifecycleConfig.states?.KY?.coverageTier !== 'distillery_release_watch'
  || stateLifecycleConfig.states?.KY?.lifecycle !== 'distillery_drop_release_watch') {
  fail('KY should be active only as a distillery drop/release-watch lane, distinct from retailer store inventory.');
}
if (stateLifecycleConfig.states?.['MD-MONTGOMERY']?.customerLabel !== 'Maryland') {
  fail('MD-MONTGOMERY should display to users as Maryland.');
}
if (stateLifecycleConfig.states?.['MD-MONTGOMERY']?.customerAreaLabel !== 'Montgomery County') {
  fail('Maryland coverage should expose Montgomery County as the current area label.');
}
if (stateLifecycleConfig.states?.IA?.coverageTier === 'live_store_inventory') {
  fail('Iowa delivery/allocation data must not be classified as live_store_inventory.');
}
const stateLifecycleTs = read('src/config/stateLifecycle.ts');
for (const state of Object.keys(stateLifecycleConfig.states || {})) {
  if (!stateLifecycleTs.includes(`"${state}"`)) {
    fail(`src/config/stateLifecycle.ts is missing shared lifecycle state ${state}.`);
  }
}
if (!stateLifecycleTs.includes('"customerLabel": "Maryland"') || !stateLifecycleTs.includes('"customerAreaLabel": "Montgomery County"')) {
  fail('src/config/stateLifecycle.ts should mirror Maryland customer label/area from the JSON lifecycle config.');
}

const activeStates = read('src/lib/activeStates.ts');
if (!/STATE_LIFECYCLE_CONFIG/.test(activeStates)) {
  fail('src/lib/activeStates.ts should derive UI active states from the shared state lifecycle config.');
}
if (/"TX"|'TX'/.test(activeStates)) {
  fail('TX must not appear in src/lib/activeStates.ts active UI states.');
}

const statePreferences = read('src/lib/statePreferences.ts');
if (/proof-state-preferences/.test(statePreferences) && !/LEGACY_STATE_PREFERENCES_STORAGE_KEY/.test(statePreferences)) {
  fail('Legacy proof-state-preferences key may only remain as an explicit migration constant.');
}
if (!/bourbon-signal-state-preferences/.test(statePreferences)) {
  fail('Expected bourbon-signal-state-preferences storage key.');
}
if (!/migrateLegacyStatePreferences/.test(statePreferences)) {
  fail('State preference storage rename should include a legacy-key migration helper.');
}

const checkoutRoute = expectNoModuleScopeStripe('src/app/api/checkout/route.ts');
if (!/CHECKOUT_ENABLED|site-mode/.test(checkoutRoute)) {
  fail('Checkout route should respect site-mode CHECKOUT_ENABLED while pricing is hidden pre-launch.');
}
expectNoModuleScopeStripe('src/app/api/webhooks/stripe/route.ts');

const alertDelivery = read('src/lib/alert-delivery.ts');
for (const phrase of ['ALERT_DELIVERY_ENABLED', 'ALERT_ONSITE_DELIVERY_ENABLED', 'ALERT_EMAIL_DELIVERY_ENABLED', 'ALERT_EMAIL_ALLOWED_RECIPIENTS', 'emailBaselineDedupeKeys', 'baselineEmail', 'ALERT_EMAIL_MAX_FRESHNESS_HOURS', 'fresh signal detected', 'manual_refresh_quarantine', 'bootstrap', 'unknown_freshness', 'emailsWouldSend']) {
  if (!alertDelivery.includes(phrase)) {
    fail(`Alert delivery guardrails should include: ${phrase}`);
  }
}
if (!/expectedSecrets\s*=\s*\[process\.env\.ALERT_DELIVERY_SECRET, process\.env\.CRON_SECRET\]/.test(alertDelivery)) {
  fail('Alert delivery authorization should accept either ALERT_DELIVERY_SECRET or CRON_SECRET so Vercel cron and manual dry-runs can both work.');
}
const notificationPreferences = read('src/lib/notification-preferences.ts');
if (!/email:\s*\{\s*enabled:\s*false,\s*mode:\s*"major_only"\s*\}/.test(notificationPreferences)) {
  fail('Email alert preferences must default to opt-out until a user explicitly enables email alerts.');
}
if (/subject:\s*`\$\{bottleName\} just hit/.test(alertDelivery)) {
  fail('Alert email subject must avoid overpromising with "just hit" wording.');
}
const middleware = read('src/middleware.ts');
if (!/\/api\/alerts\/deliver/.test(middleware) || !/NextResponse\.next\(\)/.test(middleware)) {
  fail('Middleware must allow /api/alerts/deliver through to its own secret-based route authorization so Vercel cron and dry-run checks work.');
}
const operationalReport = read('engine/src/operational-report.mjs');
if (!/sourceEventAt:\s*signal\.sourceEventAt/.test(operationalReport)) {
  fail('Operational snapshots should preserve sourceEventAt so site export and alert delivery can distinguish source event time from crawler time.');
}

const refreshScript = read('engine/bourbon-signal-engine-refresh.ps1');
if (/BOURBON_SIGNAL_AUTO_DEPLOY\) \{ \$env:BOURBON_SIGNAL_AUTO_DEPLOY \} else \{ '1' \}/.test(refreshScript)) {
  fail('Scheduled engine refresh should not default to auto-deploying production.');
}
if (!/BOURBON_SIGNAL_AUTO_DEPLOY/.test(refreshScript)) {
  fail('Scheduled engine refresh should keep an explicit opt-in auto-deploy gate.');
}

const refreshSite = read('engine/src/refresh-site.mjs');
const ncCollector = read('engine/src/collectors/north-carolina-intelligence.mjs');
const ncExtractParser = ncCollector.match(/function isoFromNcExtract\(value\) \{[\s\S]*?\n\}/)?.[0] || '';
if (/new Date\(\)\.toISOString\(\)/.test(ncExtractParser) || !/return null/.test(ncExtractParser)) {
  fail('NC source extract timestamps must not fall back to crawler time; missing/invalid source timestamps should block shipment freshness.');
}

const buildBibleIndex = refreshSite.indexOf("runNode('src/build-bible.mjs')");
const runIndex = refreshSite.indexOf("runNode('src/run.mjs')");
if (buildBibleIndex === -1 || runIndex === -1 || buildBibleIndex > runIndex) {
  fail('engine/src/refresh-site.mjs should build the bourbon bible before state collection so clean clones can refresh.');
}

const opsDoc = expectFile('docs/OPERATIONS.md');
for (const phrase of ['GitHub is the source of truth', 'Do not deploy from a dirty working tree', 'Engine refresh', 'Production deploy', 'Rollback']) {
  if (opsDoc && !opsDoc.includes(phrase)) {
    fail(`docs/OPERATIONS.md should document: ${phrase}`);
  }
}

const workflow = expectFile('.github/workflows/ci.yml');
for (const phrase of ['npm ci', 'npm run build', 'npm run test:ops', 'npm --prefix engine run verify:site']) {
  if (workflow && !workflow.includes(phrase)) {
    fail(`CI workflow should include: ${phrase}`);
  }
}

if (failures.length) {
  console.error('Ops workflow verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Ops workflow verification passed.');
