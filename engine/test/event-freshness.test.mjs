import test from 'node:test';
import assert from 'node:assert/strict';

import { authoritativeSignalTimestamp, enforceArchivedSourceAlertPolicy } from '../src/event-freshness.mjs';

test('source event time outranks crawler observation time for alert freshness', () => {
  assert.equal(authoritativeSignalTimestamp({
    eventType: 'nc_board_barrel_pick_item',
    sourceEventAt: '2024-07-28T20:15:00.000Z',
    observedAt: '2026-07-29T05:04:52.500Z',
  }), '2024-07-28T20:15:00.000Z');
});

test('crawler observation time is used only when no valid source event time exists', () => {
  assert.equal(authoritativeSignalTimestamp({ sourceEventAt: null, observedAt: '2026-07-29T05:04:52.500Z' }), '2026-07-29T05:04:52.500Z');
  assert.equal(authoritativeSignalTimestamp({ sourceEventAt: 'not-a-date', observedAt: '2026-07-29T05:04:52.500Z' }), '2026-07-29T05:04:52.500Z');
});

test('fresh inventory observation outranks an older display or first-seen timestamp', () => {
  assert.equal(authoritativeSignalTimestamp({
    displayAt: '2026-07-01T05:04:52.500Z',
    firstSeenAt: '2026-07-01T05:04:52.500Z',
    observedAt: '2026-07-29T05:04:52.500Z',
  }), '2026-07-29T05:04:52.500Z');
});

test('historical New Hanover WordPress product cards are forcibly non-alertable', () => {
  const sanitized = enforceArchivedSourceAlertPolicy({
    state: 'NC',
    eventType: 'nc_board_barrel_pick_item',
    sourceLabel: 'New Hanover County ABC barrel-pick item cards',
    canAlertAsInventory: false,
    canAlertAsWatch: true,
    alertable: true,
  });
  assert.equal(sanitized.canAlertAsInventory, false);
  assert.equal(sanitized.canAlertAsWatch, false);
  assert.equal(sanitized.alertable, false);
  assert.equal(sanitized.raw.archivedSourceAlertBlocked, true);
  assert.equal(enforceArchivedSourceAlertPolicy({ state: 'VA', canAlertAsWatch: true }).canAlertAsWatch, true);
});
