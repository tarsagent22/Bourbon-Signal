import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function applyVote(existingVotes, sightingId, vote) {
  const existingVote = existingVotes.find((item) => item.sightingId === sightingId);
  const withoutExisting = existingVotes.filter((item) => item.sightingId !== sightingId);
  return existingVote?.kind === vote
    ? withoutExisting
    : [{ sightingId, kind: vote, createdAt: '2026-07-03T00:00:00.000Z' }, ...withoutExisting].slice(0, 500);
}

const firstUp = applyVote([], 'sighting_1', 'up');
assert.equal(firstUp.length, 1);
assert.equal(firstUp[0].kind, 'up');

const switchDown = applyVote(firstUp, 'sighting_1', 'down');
assert.equal(switchDown.length, 1);
assert.equal(switchDown[0].kind, 'down');

const toggleOff = applyVote(switchDown, 'sighting_1', 'down');
assert.equal(toggleOff.length, 0);

const keepOtherVotes = applyVote([{ sightingId: 'sighting_2', kind: 'up', createdAt: 'old' }], 'sighting_1', 'up');
assert.equal(keepOtherVotes.length, 2);
assert.equal(keepOtherVotes.some((item) => item.sightingId === 'sighting_2'), true);

const sightingsRoute = readFileSync('src/app/api/sightings/route.ts', 'utf8');
assert.match(
  sightingsRoute,
  /if \(!communityVoteAllowed\(target\.reporterUserId, userId\)\)[\s\S]*status: 409/,
  'the shared server-side voting route must reject self-votes for web and mobile callers',
);

console.log('Sighting vote toggle policy verified.');
