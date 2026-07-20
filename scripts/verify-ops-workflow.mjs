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
for (const scriptName of ['watchdog:alerts', 'test:alert-copy-contract', 'verify:production-engine', 'ops:source-roi', 'ops:signal-calendar', 'ops:bottle-queue', 'generate:state-lifecycle-types', 'verify:state-lifecycle-drift', 'test:state-user-path', 'ops:radar-leads', 'ops:source-expansion', 'ops:automation-cost', 'ops:operator-outcomes', 'verify:automation', 'test:agent-cost-automation']) {
  if (!packageJson.scripts?.[scriptName]) fail(`package.json should expose ${scriptName} for Bourbon Signal self-improvement loops.`);
}

const enginePackageJson = JSON.parse(read('engine/package.json'));
if (!enginePackageJson.scripts?.['verify:site']) {
  fail('engine/package.json should expose verify:site for lightweight CI checks against checked-in site exports.');
}
if (!enginePackageJson.scripts?.['store:identity']) {
  fail('engine/package.json should expose store:identity so refresh/deploy loops can build the store identity graph.');
}
for (const scriptName of ['verify:state-integration', 'verify:state-fixtures', 'shadow:expansion', 'canary:state', 'promote:state']) {
  if (!enginePackageJson.scripts?.[scriptName]) fail(`engine/package.json should expose ${scriptName} for guarded state expansion.`);
}

const vercelConfig = JSON.parse(read('vercel.json'));
if (vercelConfig.git?.deploymentEnabled?.main !== true || vercelConfig.git?.deploymentEnabled?.['*'] !== false) {
  fail('Vercel must auto-deploy main only; branch previews are manual to prevent failed integration provisioning from generating notification storms.');
}

const engineWatchdogWorkflow = read('.github/workflows/engine-watchdog.yml');
if (!/BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED:\s*\$\{\{\s*vars\.BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED\s*\|\|\s*'1'\s*\}\}/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog must normalize an unset auto-recovery variable to 1 before any equality checks.');
}
if (/vars\.BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED == '0'/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog must not compare an unset GitHub variable directly with 0 because loose expression coercion treats an empty value as zero.');
}
if (!/env\.BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED != '0'/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog recovery must use the normalized auto-recovery value.');
}
if (/guarded refresh dispatched/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog must not claim recovery was dispatched when the kill switch may have skipped that step.');
}
if (!/id:\s*recovery/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog recovery step must expose an outcome so notification escalation can distinguish recovery from failure.');
}
if (/Fail loudly after stale production snapshot/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog must not mark a self-healing stale snapshot as a failed workflow run.');
}
if (!/steps\.recovery\.outcome == 'failure'/.test(engineWatchdogWorkflow)
  || !/env\.BOURBON_SIGNAL_AUTO_RECOVERY_ENABLED == '0'/.test(engineWatchdogWorkflow)) {
  fail('Engine watchdog should fail only when automatic recovery fails or is explicitly disabled.');
}

const stateLifecycleConfig = JSON.parse(read('src/config/state-lifecycle.json'));
if (stateLifecycleConfig.reliabilityPolicy?.promotionPolicy?.minShadowRuns < 3
  || stateLifecycleConfig.reliabilityPolicy?.promotionPolicy?.minCanaryRuns < 2
  || stateLifecycleConfig.reliabilityPolicy?.promotionPolicy?.requireVerticalSliceManifest !== true
  || stateLifecycleConfig.reliabilityPolicy?.promotionPolicy?.requireFixtureContract !== true
  || stateLifecycleConfig.reliabilityPolicy?.promotionPolicy?.requireCanaryPreviewUrl !== true) {
  fail('State lifecycle reliability policy must preserve shadow, canary, vertical-slice, fixture, and preview promotion gates.');
}
const customerStates = new Set(stateLifecycleConfig.activeStates || []);
const stateSources = read('engine/src/state-sources.mjs');
if (!/state-lifecycle\.mjs/.test(stateSources)) {
  fail('engine/src/state-sources.mjs should source CUSTOMER_ACTIVE_STATE_IDS from the shared state lifecycle config.');
}
const txLifecycle = stateLifecycleConfig.states?.TX;
if (!customerStates.has('TX')
  || txLifecycle?.publicStatus !== 'active'
  || txLifecycle?.lifecycle !== 'retailer_store_inventory'
  || txLifecycle?.coverageTier !== 'live_store_inventory'
  || !enginePackageJson.scripts?.['verify:tx']
  || !/TEXAS_RETAILER_IDENTITIES/.test(read('engine/src/texas-retailer-policy.mjs'))
  || !/isTexasRetailerInventory/.test(read('engine/src/confidence-policy.mjs'))) {
  fail('TX should remain active only with its hardened exact-store retailer inventory policy and verification gate.');
}
for (const state of ['AL', 'IL', 'IN', 'NC', 'PA', 'SC', 'TN', 'VA', 'IA', 'ID', 'MD-MONTGOMERY', 'KY']) {
  if (!customerStates.has(state)) {
    fail(`Expected active customer state ${state} missing from shared state lifecycle config.`);
  }
}
for (const state of ['FL', 'GA', 'NH', 'OH', 'OR', 'UT']) {
  const lifecycle = stateLifecycleConfig.states?.[state];
  const isCostcoOnlyExpansion = customerStates.has(state)
    && lifecycle?.lifecycle === 'costco_warehouse_inventory_watch'
    && lifecycle?.coverageTier === 'retailer_warehouse_inventory';
  const isHardenedOhioLiveInventory = state === 'OH'
    && customerStates.has('OH')
    && lifecycle?.publicStatus === 'active'
    && lifecycle?.coverageTier === 'live_store_inventory'
    && enginePackageJson.scripts?.['verify:oh']
    && enginePackageJson.scripts?.['refresh:oh']
    && /dropHasPositiveAlertInventory/.test(read('engine/src/export-site-contract.mjs'));
  const isHardenedFloridaLiveInventory = state === 'FL'
    && customerStates.has('FL')
    && lifecycle?.publicStatus === 'active'
    && lifecycle?.lifecycle === 'retailer_store_inventory'
    && lifecycle?.coverageTier === 'live_store_inventory'
    && enginePackageJson.scripts?.['verify:fl']
    && /FLORIDA_RETAILER_IDENTITIES/.test(read('engine/src/florida-retailer-policy.mjs'))
    && /isFloridaRetailerInventory/.test(read('engine/src/export-site-contract.mjs'));
  const isHardenedUtahAggregateWatch = state === 'UT'
    && customerStates.has('UT')
    && lifecycle?.publicStatus === 'active'
    && lifecycle?.lifecycle === 'aggregate_inventory_watch'
    && lifecycle?.coverageTier === 'aggregate_inventory_watch'
    && lifecycle?.inventoryAlertable === false
    && lifecycle?.watchAlertable === false
    && enginePackageJson.scripts?.['verify:ut']
    && existsSync(path.join(root, 'engine/data/state-integration/UT.json'))
    && existsSync(path.join(root, 'engine/data/state-fixtures/UT.json'));
  if (isCostcoOnlyExpansion || isHardenedOhioLiveInventory || isHardenedFloridaLiveInventory || isHardenedUtahAggregateWatch) continue;
  if (customerStates.has(state)) fail(`${state} should remain research-only until hardened enough for its explicitly verified customer-facing coverage contract.`);
  if (lifecycle?.publicStatus !== 'research_only') {
    fail(`${state} should have explicit research_only lifecycle status unless it has an explicitly verified customer-facing coverage contract.`);
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
for (const requiredFile of ['scripts/bourbon-signal-alert-watchdog.mjs', 'scripts/verify-alert-copy-contract.mjs', 'scripts/verify-production-engine-regression.mjs', 'scripts/verify-automation-registry.mjs', 'automation/bourbon-signal/automation-registry.json', 'automation/bourbon-signal/automation-registry.schema.json', 'automation/bourbon-signal/automation-cost-report.mjs', 'automation/bourbon-signal/operator-outcomes.mjs', 'automation/bourbon-signal/operator-run.schema.json', 'automation/bourbon-signal/autonomous-operator-prompt.md', 'automation/bourbon-signal/autonomy-threshold-contract.json', 'automation/bourbon-signal/source-expansion-collector.mjs', 'automation/bourbon-signal/release-radar-lead-collector.mjs', 'engine/src/build-store-identity.mjs', 'automation/bourbon-signal/source-roi-ranker.mjs', 'automation/bourbon-signal/bottle-queue-autoprocess.mjs', 'automation/bourbon-signal/signal-calendar-prototype.mjs']) {
  expectFile(requiredFile);
}
const automationRegistry = JSON.parse(read('automation/bourbon-signal/automation-registry.json'));
const hermesSnapshot = JSON.parse(read('automation/bourbon-signal/hermes-jobs.json'));
const normalizeNewlines = (value) => value.replaceAll(String.fromCharCode(13), '');
const localAppData = process.env.LOCALAPPDATA;
const runtimeSource = expectFile(path.join('automation', 'bourbon-signal', 'hermes-scripts', 'bourbon_signal_runtime.py'));
const installedRuntimePath = localAppData ? path.join(localAppData, 'hermes', 'scripts', 'bourbon_signal_runtime.py') : '';
if (runtimeSource && installedRuntimePath && !existsSync(installedRuntimePath)) {
  fail('Installed Bourbon Signal Hermes runtime helper is missing.');
} else if (runtimeSource && installedRuntimePath
  && normalizeNewlines(runtimeSource) !== normalizeNewlines(readFileSync(installedRuntimePath, 'utf8'))) {
  fail('Installed Bourbon Signal Hermes runtime helper drifted from source control.');
}
for (const job of hermesSnapshot.jobs || []) {
  if (!job.noAgent || !job.script) continue;
  const sourcePath = path.join('automation', 'bourbon-signal', 'hermes-scripts', job.script);
  const source = expectFile(sourcePath);
  if (source && /C:\\\\Users\\\\/i.test(source)) fail(`Hermes script must derive its repository and profile paths at runtime: ${job.script}`);
  if (source && source.includes('subprocess.run') && !source.includes('raise SystemExit')) fail(`Hermes script must return a nonzero job status when its subprocess fails: ${job.script}`);
  const installedPath = localAppData ? path.join(localAppData, 'hermes', 'scripts', job.script) : '';
  if (source && installedPath && !existsSync(installedPath)) {
    fail(`Installed Hermes script is missing: ${job.script}`);
  } else if (source && installedPath) {
    const installed = normalizeNewlines(readFileSync(installedPath, 'utf8'));
    if (normalizeNewlines(source) !== installed) fail(`Installed Hermes script drifted from source control: ${job.script}`);
  }
}
if (!automationRegistry.automations?.some((entry) => entry.id === 'github-engine-watchdog' && entry.executionClass === 'script_only')) {
  fail('Automation registry must keep the deterministic production watchdog script-only.');
}
if (!automationRegistry.automations?.some((entry) => entry.id === 'hermes-bottle-queue' && entry.executionClass === 'script_only')) {
  fail('Automation registry must classify the bottle queue routine path as script-only.');
}
const bottleQueue = read('automation/bourbon-signal/bottle-queue-autoprocess.mjs');
if (!/compactAmbiguity/.test(bottleQueue) || !/payload\.ambiguity/.test(bottleQueue)) {
  fail('Bottle queue automation must keep success silent and print only a compact ambiguity artifact.');
}
const automationCost = read('automation/bourbon-signal/automation-cost-report.mjs');
for (const phrase of ['aggregateOnly: true', 'containsPrompts: false', 'containsPii: false', 'directHttpProbes', 'averageTokensPerUsefulFinding']) {
  if (!automationCost.includes(phrase)) fail(`Automation cost report must keep aggregate-only telemetry: ${phrase}`);
}
const sourceExpansionCollector = read('automation/bourbon-signal/source-expansion-collector.mjs');
for (const phrase of ['MAX_STATES_PER_RUN', 'state-source-discovery.mjs', 'state-source-probe.mjs', 'canPromote: false', 'canPublish: false']) {
  if (!sourceExpansionCollector.includes(phrase)) fail(`Source expansion collector is missing bounded deterministic contract: ${phrase}`);
}
const radarLeadCollector = read('automation/bourbon-signal/release-radar-lead-collector.mjs');
for (const phrase of ['MAX_QUERIES', 'canPublish: false', 'canCreatePullRequest: false', 'canCreateAlerts: false', 'announcement_only']) {
  if (!radarLeadCollector.includes(phrase)) fail(`Release Radar lead collector must remain non-publishing: ${phrase}`);
}
const alertCopyContract = read('scripts/verify-alert-copy-contract.mjs');
for (const phrase of ['address unavailable; check source before driving', 'Board-level signal; check source before driving', 'Reply STOP to unsubscribe']) {
  if (!alertCopyContract.includes(phrase)) fail(`Alert copy contract should enforce: ${phrase}`);
}
const alertWatchdog = read('scripts/bourbon-signal-alert-watchdog.mjs');
for (const phrase of ['/api/alerts/deliver?dryRun=1', 'No alert delivery secret provided', 'On-site alert delivery is disabled', 'Email client is not configured']) {
  if (!alertWatchdog.includes(phrase)) fail(`Alert watchdog should check: ${phrase}`);
}
const regressionGuard = read('scripts/verify-production-engine-regression.mjs');
for (const phrase of ['activeStates', '/api/drops?state=', 'live drops collapsed to 0']) {
  if (!regressionGuard.includes(phrase)) fail(`Production regression guard should check: ${phrase}`);
}
const storeIdentity = read('engine/src/build-store-identity.mjs');
for (const phrase of ['store-identity.json', 'addressResolvedCount', 'store-level alert candidate(s) still lack resolvable addresses']) {
  if (!storeIdentity.includes(phrase)) fail(`Store identity graph should include: ${phrase}`);
}
for (const phrase of ['ALERT_DELIVERY_ENABLED', 'ALERT_ONSITE_DELIVERY_ENABLED', 'ALERT_EMAIL_DELIVERY_ENABLED', 'ALERT_EMAIL_ALLOWED_RECIPIENTS', 'onSiteBaselineDedupeKeys', 'emailBaselineDedupeKeys', 'baselineEmail', 'baselineOnSiteOnly', 'ALERT_EMAIL_MAX_FRESHNESS_HOURS', 'ALERT_REALTIME_MAX_FRESHNESS_HOURS', 'groupCandidatesByLocation', 'location-group:', 'fresh signal detected', 'manual_refresh_quarantine', 'bootstrap', 'unknown_freshness', 'emailsWouldSend', 'isPaidTier(publicMetadata)', 'hasSavedAreaPreferences(areaPrefs)', 'skippedFreeUsers', 'skippedNoAreaPreferences', 'sortCandidatesForMember']) {
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
if (!/sightings:\s*\{\s*enabled:\s*false\s*\}/.test(notificationPreferences) || !/source\.sightings/.test(notificationPreferences)) {
  fail('Notification preferences should include explicit Member Sightings alert settings for Barrel/BiB gating.');
}
if (/subject:\s*`\$\{bottleName\} just hit/.test(alertDelivery)) {
  fail('Alert email subject must avoid overpromising with "just hit" wording.');
}
const entitlements = read('src/lib/entitlements.ts');
for (const phrase of ['canAccessDashboard', 'canUseBottleSearch', 'canUseCollection', 'canUseRecommendations']) {
  if (!entitlements.includes(phrase)) fail(`Entitlement model should include ${phrase} so access matches pricing copy.`);
}
const dropFeed = read('src/components/sections/DropFeed.tsx');
for (const phrase of ['canUseDropFeedFilters', 'canUseStateFilter', 'canUseBottleSearch', 'canReadSightings']) {
  if (!dropFeed.includes(phrase)) fail(`Drop Feed should gate filter/search/sighting affordances with ${phrase}.`);
}
const dashboardPage = read('src/app/dashboard/page.tsx');
for (const phrase of ['canAccessDashboard', 'canUseCollection', 'canUseRecommendations', 'canReceiveSightingsAlerts', 'canUseAdvancedFilters']) {
  if (!dashboardPage.includes(phrase)) fail(`Dashboard should gate tier-specific access with ${phrase}.`);
}
const bottleCheckPage = read('src/app/bottle-check/page.tsx');
for (const phrase of ['bottleCheckLimit', 'BOTTLE_CHECK_USAGE_STORAGE_KEY', 'remainingFreeChecks']) {
  if (!bottleCheckPage.includes(phrase)) fail(`Bottle Check should enforce/communicate the Free 3-check preview limit (${phrase}).`);
}
const sightingsClient = read('src/app/sightings/SightingsClient.tsx');
if (!/isLimitedFeedPreview/.test(sightingsClient) || !/Free members can post sightings/.test(sightingsClient) || !/Upgrade to see more/.test(sightingsClient)) {
  fail('Member Sightings page should let Free members submit sightings while showing a two-post feed preview with an upgrade CTA.');
}
const userPreferencesRoute = read('src/app/api/user/preferences/route.ts');
if (!/canReceiveSightingsAlerts/.test(userPreferencesRoute) || !/sightings:\s*\{\s*enabled:\s*false\s*\}/.test(userPreferencesRoute)) {
  fail('Preferences API should strip Member Sightings alerts for tiers below Barrel/BiB.');
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
if (!/\$ProjectRoot\s*=\s*Split-Path -Parent \$EngineDir/.test(refreshScript) || /Proof-worktrees|Proof\\engine/.test(refreshScript)) {
  fail('Scheduled engine refresh should derive the canonical Bourbon Signal worktree from its own script path, never a legacy Proof worktree.');
}
if (!/\$env:BOURBON_SIGNAL_AUTO_DEPLOY\s*=\s*'0'/.test(refreshScript)) {
  fail('Scheduled engine refresh must remain collection-only and leave production releases to the guarded GitHub/Vercel workflow.');
}
if (!/\$env:BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES\s*=\s*'0'/.test(refreshScript)) {
  fail('Scheduled engine refresh must not retain a direct-production deployment interval.');
}
if (!/BOURBON_SIGNAL_REFRESH_CADENCE_MINUTES/.test(refreshScript) || !/else \{ '30' \}/.test(refreshScript)) {
  fail('Scheduled engine refresh should advertise the real 30-minute cadence rather than the old 5-minute loop.');
}
if (!/BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES/.test(refreshScript) || !/else \{ '240' \}/.test(refreshScript)) {
  fail('Scheduled engine refresh should keep heavyweight browser collectors off the every-30-minute base path.');
}
if (!/BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS/.test(refreshScript) || !/2100000/.test(refreshScript)) {
  fail('Scheduled engine refresh should give the full state run enough watchdog budget to finish instead of failing at 15 minutes.');
}
if (!/BOURBON_SIGNAL_BROWSER_PREFLIGHT\) \{ \$env:BOURBON_SIGNAL_BROWSER_PREFLIGHT \} else \{ '0' \}/.test(refreshScript)) {
  fail('Scheduled engine refresh should disable duplicate run.mjs browser preflight; refresh-site owns browser collector cadence.');
}

const refreshSite = read('engine/src/refresh-site.mjs');
if (!/scripts', 'release-production\.mjs/.test(refreshSite) || !/--publish-site-exports/.test(refreshSite)) {
  fail('engine/src/refresh-site.mjs should hand changed exports to the single release orchestrator.');
}
if (/runCommand\(vercel, \['--prod'/.test(refreshSite) || /alias', 'set'/.test(refreshSite)) {
  fail('engine/src/refresh-site.mjs must not deploy or move aliases outside the release orchestrator.');
}
const releaseOrchestrator = read('scripts/release-production.mjs');
for (const contract of [
  "worktree', 'add', '--detach'",
  'assertCleanOriginMain',
  'writeBuildManifest',
  "'deploy', '--prod'",
  "'alias', 'set'",
  "'crons', 'ls', '--format', 'json'",
  'release-manifest.json',
  '/api/ops/health',
]) {
  if (!releaseOrchestrator.includes(contract)) fail(`Release orchestrator is missing contract: ${contract}`);
}
if (!/readdir\(siteDir\)/.test(refreshSite) || !/siteExportFileCount/.test(refreshSite)) {
  fail('engine/src/refresh-site.mjs should hash the whole checked-in site export, not only alert rows, so production freshness is deployed even when inventory rows are unchanged.');
}
if (!/pidAlive\) \{[\s\S]*?return false;/.test(refreshSite)) {
  fail('engine/src/refresh-site.mjs should never ignore a live refresh lock just because the run is older than the stale-lock threshold.');
}
if (!/lastSuccessMs/.test(refreshSite) || /candidates\s*=\s*\[[^\]]*lastBrowserAttemptAt/s.test(refreshSite)) {
  fail('engine/src/refresh-site.mjs should throttle successful FWGS refreshes while allowing a failed latest attempt to retry on the next scheduled run.');
}
const fwgsFull = read('engine/src/fwgs-browser-full.mjs');
if (!/ALLOW_PARTIAL/.test(fwgsFull) || !/leaving previous full artifact untouched/.test(fwgsFull) || !/readUsableChunk/.test(fwgsFull)) {
  fail('FWGS full browser refresh should be all-or-nothing by default, with valid recent chunk fallback, so partial chunk failures do not degrade production coverage.');
}
const ncCollector = read('engine/src/collectors/north-carolina-intelligence.mjs');
const ncExtractParser = ncCollector.match(/function isoFromNcExtract\(value\) \{[\s\S]*?\n\}/)?.[0] || '';
if (/new Date\(\)\.toISOString\(\)/.test(ncExtractParser) || !/return null/.test(ncExtractParser)) {
  fail('NC source extract timestamps must not fall back to crawler time; missing/invalid source timestamps should block shipment freshness.');
}

const buildBibleIndex = refreshSite.indexOf("runNode('src/build-bible.mjs')");
const runIndex = refreshSite.indexOf("runNode('src/run.mjs'");
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
const rootPackageJson = JSON.parse(read('package.json'));
const verifyCi = String(rootPackageJson.scripts?.['verify:ci'] || '');
if (workflow && !workflow.includes('npm ci')) fail('CI workflow should install dependencies with npm ci.');
if (workflow && !workflow.includes('npm run verify:ci')) fail('CI workflow should run the shared verify:ci script.');
if (workflow && !workflow.includes('npm run verify:state-lifecycle-drift')) fail('CI workflow should fail on generated lifecycle drift.');
for (const phrase of ['npm run build', 'npm run test:ops', 'npm --prefix engine run verify:site']) {
  if (!verifyCi.includes(phrase)) {
    fail(`verify:ci script should include: ${phrase}`);
  }
}
for (const phrase of ['npm run verify:state-lifecycle-drift', 'npm run test:state-user-path', 'npm --prefix engine run verify:state-integration -- --all-active']) {
  if (!verifyCi.includes(phrase)) fail(`verify:ci script should include ${phrase} for lifecycle/customer-path gates.`);
}

const shadowWorkflow = expectFile('.github/workflows/state-expansion-shadow.yml');
if (shadowWorkflow && !shadowWorkflow.includes('cron: "15 1,5,9,13,17,21 * * *"')) fail('Shadow collection must run every four hours.');
for (const phrase of ['BOURBON_SIGNAL_AUTO_DEPLOY: "0"', 'ALERT_DELIVERY_ENABLED: "0"', 'npm run shadow:expansion', 'engine/out/shadow']) {
  if (shadowWorkflow && !shadowWorkflow.includes(phrase)) fail(`Shadow workflow must include ${phrase}.`);
}
if (shadowWorkflow && /BLOB_READ_WRITE_TOKEN|publish-site-snapshot|--prod/.test(shadowWorkflow)) {
  fail('Shadow workflow must never publish a production snapshot or deploy production.');
}
const browserProbeWorkflow = expectFile('.github/workflows/state-source-browser-probe.yml');
if (browserProbeWorkflow && !browserProbeWorkflow.includes('cron: "50 5,17 * * *"')) fail('Browser probing must run twice daily after direct-probe triage.');
const canaryWorkflow = expectFile('.github/workflows/state-expansion-canary.yml');
for (const phrase of ['ALERT_DELIVERY_ENABLED: "0"', 'npm run canary:state', 'npm run verify:state-integration', 'vercel deploy', 'BOURBON_SIGNAL_ALERT_QUEUE_MODE=shadow']) {
  if (canaryWorkflow && !canaryWorkflow.includes(phrase)) fail(`Canary workflow must include ${phrase}.`);
}
if (canaryWorkflow && /vercel deploy[^\n]*--prod/.test(canaryWorkflow)) fail('Canary workflow must deploy only an isolated preview, never --prod.');
const refreshFeedWorkflow = expectFile('.github/workflows/refresh-feed.yml');
if (refreshFeedWorkflow && !refreshFeedWorkflow.includes('Verify no unproven state promotion entered the customer path')) {
  fail('Production refresh must verify the state integration gate before snapshot publication.');
}

if (failures.length) {
  console.error('Ops workflow verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Ops workflow verification passed.');
