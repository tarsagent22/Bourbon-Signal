import assert from 'node:assert/strict';
import test from 'node:test';
import type { MemberAlert } from '../api/types';
import { preferencesFixture } from '../api/astra-fixtures';
import { partitionRadarAlerts, radarSetupNeeded, radarBottleSummary } from './radar-presentation';

test('history unread counts cannot inflate current results, and archived items stay hidden', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const alert = { id: 'old', createdAt: '2026-09-01T12:00:00Z', readAt: null, archivedAt: null } as MemberAlert;
  const recent = { ...alert, id: 'recent', signalAt: '2026-10-03T11:00:00Z', freshnessLimitHours: 2 };
  const result = partitionRadarAlerts([alert, recent, { ...recent, id: 'archived', archivedAt: now.toISOString() }], now);
  assert.deepEqual(result.current.map(item => item.id), ['recent']);
  assert.deepEqual(result.history.map(item => item.id), ['old']);
  assert.equal(partitionRadarAlerts([recent], new Date('2026-10-03T13:00:00Z')).current.length, 0);
});

test('setup requires locations and only requires a bottle list in specific mode', () => {
  const prefs = preferencesFixture();
  assert.equal(radarSetupNeeded(prefs), true);
  prefs.monitoringScopes = [{ id: 'NC', type: 'state', state: 'NC', label: 'North Carolina' }];
  assert.equal(radarSetupNeeded(prefs), true);
  prefs.alertMode = 'anything_notable';
  assert.equal(radarSetupNeeded(prefs), false);
  prefs.entitlements = { alertAreaLimit: 0 };
  assert.equal(radarSetupNeeded(prefs), true);
});

test('bottle summary includes tier restrictions even for a specific bottle list', () => {
  const prefs = preferencesFixture();
  prefs.bottleAlertPreferences = { bottleNames: ['Stagg'], bottleKeys: ['stagg'] };
  prefs.notificationPreferences.rarityTiers = ['unicorn', 'allocated'];
  assert.equal(radarBottleSummary(prefs), '1 watched bottle · Unicorn + Allocated');
});
