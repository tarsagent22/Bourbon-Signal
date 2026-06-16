import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel) { return readFileSync(path.join(root, rel), 'utf8'); }
function fail(msg) { failures.push(msg); }
function expectFile(rel) { if (!existsSync(path.join(root, rel))) fail(`Missing ${rel}`); else return read(rel); return ''; }

const sightingsClient = read('src/app/sightings/SightingsClient.tsx');
for (const phrase of ['activeTab', 'Submit', 'Feed', 'sightingType', 'Seen in store', 'Online/Social Media', 'Member Sightings', 'stateFilter', 'All states']) {
  if (!sightingsClient.includes(phrase)) fail(`Sightings page should include ${phrase}`);
}
if (!/voteSighting/.test(sightingsClient) || !/ThumbsUp/.test(sightingsClient) || !/ThumbsDown/.test(sightingsClient)) {
  fail('Sightings feed should include one-click thumbs up/down controls.');
}
if (!/isSignedIn/.test(sightingsClient) || !/members only/i.test(sightingsClient)) {
  fail('Sightings page should keep feed/submission member-only.');
}

const lib = read('src/lib/sightings.ts');
for (const phrase of ['SightingType', 'seen_in_store', 'online_social', 'SightingVote', 'upCount', 'downCount']) {
  if (!lib.includes(phrase)) fail(`Sightings model should include ${phrase}`);
}

const api = expectFile('src/app/api/sightings/route.ts');
for (const phrase of ['getUserList', 'reporterUserId', 'poster cannot vote', 'sightingVotes', 'up', 'down']) {
  if (api && !api.includes(phrase)) fail(`Sightings API should include ${phrase}`);
}

const hook = read('src/hooks/useSightings.ts');
for (const phrase of ['/api/sightings', 'voteSighting', 'addSignalReport']) {
  if (!hook.includes(phrase)) fail(`useSightings should include ${phrase}`);
}

const dropFeed = read('src/components/sections/DropFeed.tsx');
for (const phrase of ['Member sighting', 'sighting.rarityTier', 'lastUpdated', 'Refreshed']) {
  if (!dropFeed.includes(phrase)) fail(`Drop feed should include ${phrase}`);
}
if (/User submitted/.test(dropFeed)) fail('Drop feed should label member sightings as Member sighting, not User submitted.');

const dashboard = read('src/app/dashboard/page.tsx');
for (const phrase of ['Personal signal brief', 'Saved markets', 'Tracked bottles', 'Recent matching drops']) {
  if (!dashboard.includes(phrase)) fail(`Dashboard should include personalized brief item: ${phrase}`);
}

const signUp = read('src/app/sign-up/[[...sign-up]]/page.tsx');
for (const phrase of ['forceRedirectUrl="/alerts?welcome=1"', 'signInForceRedirectUrl="/alerts?welcome=1"']) {
  if (!signUp.includes(phrase)) fail(`Sign-up should redirect to alerts onboarding: ${phrase}`);
}
const alerts = read('src/app/alerts/page.tsx');
for (const phrase of ['welcome', 'Setting your alert preferences before doing anything else is highly recommended', 'localStorage']) {
  if (!alerts.includes(phrase)) fail(`Alerts page should include one-time onboarding popup behavior: ${phrase}`);
}

if (failures.length) {
  console.error('Member sightings verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Member sightings verification passed.');
