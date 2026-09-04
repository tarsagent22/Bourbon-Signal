import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { loadWithMocks } from '../astra-test-harness';
import { preferencesFixture, profileFixture } from '../api/astra-fixtures';

const native = new Proxy({ StyleSheet: { create: (v: unknown) => v }, Platform: { OS: 'ios' }, Keyboard: { dismiss() {} }, AccessibilityInfo: { announceForAccessibility() {} } } as any, { get: (o,k) => o[k] || String(k) });
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
function renderSignIn(strategy: string | null = null) {
  let index = 0;
  const state = ['entered@example.invalid','secret','123456', strategy];
  const module = loadWithMocks('app/index.tsx', {
    '@clerk/expo': { useAuth: () => ({ isLoaded: true, isSignedIn: false }), useSignIn: () => ({ signIn: {}, fetchStatus: 'idle' }) },
    'expo-router': { Redirect: 'Redirect' }, 'react-native': native,
    '../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} },
    react: { ...React, useState: (initial: unknown) => [index < state.length ? state[index++] : (index++, initial), () => {}], useEffect() {} },
  });
  return nodes(module.default());
}
test('M13: entered sign-in and MFA fields render persistent accessible names', () => {
  const fields = renderSignIn().filter(n => n.type === 'TextInput');
  assert.deepEqual(fields.map(f => f.props.accessibilityLabel), ['Email address','Password']);
  for (const strategy of ['totp','backup_code','email_code','phone_code']) {
    const field = renderSignIn(strategy).find(n => n.type === 'TextInput');
    assert.ok(field.props.accessibilityLabel); assert.ok(field.props.accessibilityHint);
  }
  for (const button of renderSignIn().filter(n => n.type === 'Pressable')) assert.equal(button.props.accessibilityRole, 'button');
});
test('M13: mounted Radar search and SMS input render named controls', () => {
  let index = 0;
  const prefs = preferencesFixture(); prefs.notificationPreferences.sms.available = true;
  const states = ['watchlist',prefs,profileFixture()];
  const module = loadWithMocks('app/(app)/(tabs)/radar.tsx', {
    'react-native': native, 'expo-router': { useLocalSearchParams: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}), SafeAreaView: 'SafeAreaView' },
    react: { ...React, useState: (initial: unknown) => [index < states.length ? states[index++] : (index++, initial), () => {}], useEffect() {}, useRef: (v: unknown) => ({ current: v }), useMemo: (f: () => unknown) => f(), useCallback: (f: unknown) => f },
    '../../../src/components/MemberScreen': { MemberCard: 'MemberCard', SectionTitle: 'SectionTitle', memberScreenStyles: {} },
    '../../../src/hooks/useMobileApi': { useMobileApi: () => ({}) }, '../../../src/hooks/useScreenRevalidation': { useScreenRevalidation() {} }, '../../../src/push/push-registration': {},
    '../../../src/hooks/useAccessibleStatus': { useAccessibleStatus() {} },
  });
  const fields = nodes(module.default()).filter(n => n.type === 'TextInput');
  assert.ok(fields.length >= 2);
  for (const field of fields) assert.ok(field.props.accessibilityLabel, `Missing label for ${field.props.placeholder}`);
});
test('M09: privacy inventory matches SMS collection, local identifiers and actual support UI', () => {
  const text = fs.readFileSync('store/app-privacy.md','utf8');
  for (const category of ['SMS', 'installation', 'push token', 'contribution receipt', 'photo retry', 'selectable']) assert.ok(text.toLowerCase().includes(category.toLowerCase()), category);
  assert.ok(!text.includes('does not solicit a new phone number'));
  assert.ok(!text.includes('app opens a member-composed email'));
});
