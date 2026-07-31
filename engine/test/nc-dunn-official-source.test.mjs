import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NC_STATIC_BOARD_TARGETS,
  ncBoardPageSourceIdentity,
  ncBoardWebsiteSignalEligible,
  ncGenericBoardWebsiteWatchEligibility,
} from '../src/collectors/north-carolina-intelligence.mjs';

const dunn = NC_STATIC_BOARD_TARGETS.find((target) => target.boardName === 'Dunn ABC Board');
const newHanover = NC_STATIC_BOARD_TARGETS.find((target) => target.boardName === 'New Hanover County ABC Board');

test('Dunn official source rotation includes the first-party allocation policy and exact store directory', () => {
  assert.ok(dunn);
  assert.deepEqual(dunn.urls, [
    'https://dunnabc.com/',
    'https://dunnabc.com/allocation-policy/',
    'https://dunnabc.com/store-locations-hours/',
  ]);
  assert.deepEqual(dunn.signalUrls, ['https://dunnabc.com/allocation-policy/']);
  assert.equal(dunn.capability, 'allocation_policy_and_store_directory');
});

test('Dunn board-page identity accepts only reviewed HTTPS first-party origins', () => {
  assert.deepEqual(
    ncBoardPageSourceIdentity(dunn.urls[1], 'https://dunnabc.com/allocation-policy/', dunn.urls),
    { verified: true, reason: null },
  );
  assert.equal(
    ncBoardPageSourceIdentity(dunn.urls[1], 'https://www.dunnabc.com/allocation-policy/', dunn.urls).verified,
    true,
  );
  assert.match(
    ncBoardPageSourceIdentity(dunn.urls[1], 'https://attacker.example/allocation-policy/', dunn.urls).reason,
    /redirected outside/i,
  );
  assert.match(
    ncBoardPageSourceIdentity(newHanover.urls[0], 'https://nh.abcgo.app/', newHanover.urls).reason,
    /redirected outside/i,
  );
  assert.equal(
    ncBoardPageSourceIdentity('https://attacker.example/', 'https://dunnabc.com/allocation-policy/', dunn.urls).verified,
    false,
  );
  assert.equal(
    ncBoardPageSourceIdentity('http://dunnabc.com/allocation-policy/', 'https://dunnabc.com/allocation-policy/', dunn.urls).verified,
    true,
  );
  assert.match(
    ncBoardPageSourceIdentity('http://dunnabc.com/allocation-policy/', 'http://dunnabc.com/allocation-policy/', dunn.urls).reason,
    /finish on HTTPS/i,
  );
});

test('Dunn official policy source remains noninventory by contract', () => {
  assert.doesNotMatch(dunn.capability, /store_inventory_search|store_level/i);
  assert.equal(ncGenericBoardWebsiteWatchEligibility(), false);
  assert.equal(ncBoardWebsiteSignalEligible(dunn.boardName, 'https://dunnabc.com/allocation-policy/'), true);
  assert.equal(ncBoardWebsiteSignalEligible(dunn.boardName, 'https://dunnabc.com/store-locations-hours/'), false);
});