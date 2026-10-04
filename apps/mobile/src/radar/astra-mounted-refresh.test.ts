import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { loadWithMocks } from '../astra-test-harness';
import { preferencesFixture, profileFixture } from '../api/astra-fixtures';

test('Radar retains preferences and refreshes push status when alerts fail independently', async () => {
  const writes: any[] = [];
  let focus!: () => Promise<void>;
  let pushReads = 0;
  const preferences = preferencesFixture();
  const api = {
    getMemberPreferences: async () => preferences,
    getMemberProfile: async () => profileFixture(),
    getMemberAlerts: async () => { throw new Error('alerts offline'); },
    getPushDeviceStatus: async () => { pushReads++; return { supported: true, enabled: false, registeredDeviceCount: 0 }; },
  };
  const module = loadWithMocks('app/(app)/(tabs)/radar.tsx', {
    react: { ...React, useState: (value: unknown) => [value, (next: unknown) => writes.push(next)], useEffect() {}, useRef: (value: unknown) => ({ current: value }), useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn },
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} }) },
    'react-native': { StyleSheet: { create: (value: unknown) => value }, View: 'View' },
    'react-native-safe-area-context': {},
    '../../../src/hooks/useMobileApi': { useMobileApi: () => api },
    '../../../src/hooks/useBottleCatalog': { useBottleCatalog: () => ({ search: () => [], error: 'Catalog offline', retry() {} }) },
    '../../../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} },
    '../../../src/hooks/useScreenRevalidation': { useScreenRevalidation: (fn: typeof focus) => { focus = fn; } },
    '../../../src/components/MemberScreen': { memberScreenStyles: {}, LoadingState: 'LoadingState' },
    '../../../src/push/push-registration': { radarPushDeviceId: async () => 'device', radarPushPermission: async () => 'granted', refreshRadarPushIfEnabled: async () => null },
  });
  module.default();
  await focus();
  assert.ok(writes.includes(preferences), 'working preferences remain usable');
  assert.ok(writes.some(value => typeof value === 'string' && value.includes('Alerts couldn’t refresh')));
  assert.equal(pushReads, 1, 'an unrelated alert failure does not skip device-status recovery');
  assert.ok(!writes.includes('Radar is temporarily unavailable. Pull to retry.'));
});

test('M07: a second push refreshes mounted Radar and an older reply cannot overwrite it', async () => {
  const effects: Array<() => unknown> = []; const alertWrites: number[] = []; const completions: Array<(value: unknown) => void> = [];
  const refs: any[] = []; let refIndex = 0; let params: any = {}; let focus!: () => Promise<void>;
  const api = { getMemberPreferences: async () => preferencesFixture(), getMemberProfile: async () => profileFixture(), listRadarBottles: async () => [],
    getMemberAlerts: ({ fresh }: any) => { assert.equal(fresh, completions.length > 0); return new Promise(resolve => completions.push(resolve)); }, getPushDeviceStatus: async () => ({ enabled: false }) };
  const module = loadWithMocks('app/(app)/(tabs)/radar.tsx', {
    react: { ...React, useState: (initial: unknown) => [initial, (v: any) => { if (v?.unreadCount !== undefined) alertWrites.push(v.unreadCount); }],
      useEffect: (f: () => unknown) => effects.push(f), useCallback: (f: unknown) => f, useMemo: (f: () => unknown) => f(), useRef: (v: unknown) => refs[refIndex++] ||= { current: v } },
    'expo-router': { useLocalSearchParams: () => params, useRouter: () => ({ push() {} }) }, 'react-native': { StyleSheet: { create: (v: unknown) => v }, View: 'View' },
    'react-native-safe-area-context': {}, '../../../src/hooks/useMobileApi': { useMobileApi: () => api },
    '../../../src/hooks/useBottleCatalog': { useBottleCatalog: () => ({ catalog: [], search: () => [], error: '', retry() {} }) },
    '../../../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} }, '../../../src/hooks/useScreenRevalidation': { useScreenRevalidation: (f: typeof focus) => { focus = f; } },
    '../../../src/components/MemberScreen': { memberScreenStyles: {}, LoadingState: 'LoadingState' },
    '../../../src/push/push-registration': { radarPushDeviceId: async () => 'device', radarPushPermission: async () => 'granted', rememberRadarPushEnabled: async () => {}, watchRadarPushToken: () => ({ remove() {} }) },
  });
  module.default(); const first = focus();
  effects.length = 0; params = { section: 'matches', request: 'os-2' }; refIndex = 0; module.default(); effects.forEach(f => f());
  assert.equal(completions.length,2);
  completions[1]({ alerts: [], unreadCount: 2 }); await new Promise(r => setTimeout(r,1));
  completions[0]({ alerts: [], unreadCount: 1 }); await first;
  assert.equal(alertWrites.at(-1), 2);
});
