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

const stateSources = read('engine/src/state-sources.mjs');
const customerLine = stateSources.match(/CUSTOMER_ACTIVE_STATE_IDS\s*=\s*new Set\(\[([^\]]+)\]\)/s)?.[1] || '';
if (/['"]TX['"]/.test(customerLine)) {
  fail('TX must not be in CUSTOMER_ACTIVE_STATE_IDS until Texas has stronger customer-facing data.');
}
for (const state of ['AL', 'IL', 'IN', 'NC', 'OH', 'PA', 'TN', 'VA']) {
  if (!new RegExp(`["']${state}["']`).test(customerLine)) {
    fail(`Expected active customer state ${state} missing from CUSTOMER_ACTIVE_STATE_IDS.`);
  }
}

const activeStates = read('src/lib/activeStates.ts');
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

const refreshScript = read('engine/bourbon-signal-engine-refresh.ps1');
if (/BOURBON_SIGNAL_AUTO_DEPLOY\) \{ \$env:BOURBON_SIGNAL_AUTO_DEPLOY \} else \{ '1' \}/.test(refreshScript)) {
  fail('Scheduled engine refresh should not default to auto-deploying production.');
}
if (!/BOURBON_SIGNAL_AUTO_DEPLOY/.test(refreshScript)) {
  fail('Scheduled engine refresh should keep an explicit opt-in auto-deploy gate.');
}

const refreshSite = read('engine/src/refresh-site.mjs');
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
