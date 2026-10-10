import assert from 'node:assert/strict';
import test from 'node:test';
import type { MemberAlert } from '../api/types';
import { preferencesFixture } from '../api/astra-fixtures';
import { partitionRadarAlerts, radarSetupNeeded, radarBottleSummary,radarSetupStatus } from './radar-presentation';

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
  prefs.notificationPreferences.rarityTiers=['allocated'];
  assert.equal(radarSetupNeeded(prefs), false);
  prefs.entitlements = { alertAreaLimit: 0 };
  assert.equal(radarSetupNeeded(prefs), true);
});

test('Radar explains silent filters, disabled channels and phone registration separately',()=>{
  const prefs=preferencesFixture();
  assert.equal(radarSetupStatus(prefs,'Off').title,'Choose an area');
  prefs.monitoringScopes=[{id:'NC',type:'state',state:'NC',label:'North Carolina'}];
  assert.equal(radarSetupStatus(prefs,'Off').title,'Choose bottle tiers');
  prefs.notificationPreferences.rarityTiers=['allocated'];
  assert.equal(radarSetupStatus(prefs,'Off').title,'Watch your first bottle');
  prefs.alertMode='anything_notable';
  assert.match(radarSetupStatus(prefs,'Off').detail,/Phone alerts are off/);
  prefs.notificationPreferences.onSite.enabled=false;
  assert.equal(radarSetupStatus(prefs,'Off').title,'Enable an alert channel');
  assert.equal(radarSetupStatus(prefs,'On').title,'Watch preferences ready');
  prefs.notificationPreferences.onSite.enabled=true;
  assert.equal(radarSetupStatus(prefs,'Setup needed').title,'Phone alerts need attention');
});

test('bottle summary includes tier restrictions even for a specific bottle list', () => {
  const prefs = preferencesFixture();
  prefs.bottleAlertPreferences = { bottleNames: ['Stagg'], bottleKeys: ['stagg'] };
  prefs.notificationPreferences.rarityTiers = ['unicorn', 'allocated'];
  assert.equal(radarBottleSummary(prefs), '1 watched bottle \u00b7 Unicorn + Allocated');
});

import { groupRadarReports, radarAlertLocation } from './alert-location';
test('Radar summarizes a retailer once and groups only the same bottle at the same source and store',()=>{
 const alert={id:'one',bottleName:'Elijah Craig Barrel Proof',storeLabel:'Wake County ABC - 7200 Sandy Fork Rd., Raleigh, NC 27609',matchedArea:'Wake County ABC',state:'NC',sourceType:'engine',eventType:'restock',rarityTier:'allocated',quantity:1,score:0,priorityClass:'standard',createdAt:'2026-10-10T12:00:00Z',readAt:null,archivedAt:null} as MemberAlert;
 assert.equal(radarAlertLocation(alert),'Wake County ABC \u00b7 Raleigh, NC');
 assert.equal(radarAlertLocation({...alert,storeLabel:'Wake County ABC'}),'Wake County ABC \u00b7 NC');
 const groups=groupRadarReports([alert,{...alert,id:'two'},{...alert,id:'other-bottle',bottleName:'Stagg'},{...alert,id:'other-store',storeLabel:'Another ABC'},{...alert,id:'community',sourceType:'community'}]);
 assert.deepEqual(groups.map(group=>group.map(item=>item.id)),[['one','two'],['other-bottle'],['other-store'],['community']]);
});
