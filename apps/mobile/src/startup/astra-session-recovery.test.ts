import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadWithMocks } from '../astra-test-harness';

test('a member render failure is cleared on logout and account switch, not on ordinary renders', () => {
  const { StartupErrorBoundary: Boundary } = loadWithMocks('src/startup/StartupErrorBoundary.tsx', {
    'expo-constants': { default: {} }, 'expo-updates': {},
    'react-native': { StyleSheet: { create: (value: unknown) => value } },
  });
  const error = new Error('member screen failed');
  const failed = { error, identity: 'member:session', componentStack: 'private screen', resetKey: 0, showDetails: true, shareError: 'share failed' };
  assert.equal(Boundary.getDerivedStateFromProps({ resetOn: 'member:session' }, failed), null, 'diagnostics stay available during the same session');
  const signedOut = { ...failed, ...Boundary.getDerivedStateFromProps({ resetOn: ':' }, failed) };
  assert.equal(signedOut.error, null);
  assert.equal(signedOut.componentStack, '');
  assert.equal(signedOut.showDetails, false);
  assert.equal(signedOut.shareError, '');
  assert.equal(Boundary.getDerivedStateFromProps({ resetOn: ':' }, signedOut), null);
  assert.equal(Boundary.getDerivedStateFromProps({ resetOn: 'second:session' }, failed).error, null);
  assert.equal(Boundary.getDerivedStateFromProps({}, { ...failed, identity: undefined }), null, 'outer startup boundary keeps provider failures visible');
});

test('the root owns protected route removal while the nested navigator stays mounted through logout', () => {
  const root = readFileSync('app/_layout.tsx', 'utf8');
  const member = readFileSync('app/(app)/_layout.tsx', 'utf8');
  assert.match(root, /Stack\.Protected guard=\{Boolean\(isLoaded && isSignedIn\)\}/);
  assert.match(root, /resetOn=/);
  assert.doesNotMatch(member, /Redirect|if \(!isSignedIn\)/);
  const entry = readFileSync('app/index.tsx', 'utf8');
  assert.match(entry, /if \(!isSignedIn\) return <Redirect href="\/\(auth\)\/sign-in"/);
});

test('member navigation retains its key during logout and resets when another account signs in', () => {
  let identity: { userId: string | null; sessionId: string | null } = { userId: 'first', sessionId: 'session-one' };
  const retained = { current: '' };
  const { default: Layout } = loadWithMocks('app/(app)/_layout.tsx', {
    '@clerk/expo': { useAuth: () => identity },
    react: { useRef: () => retained },
    'expo-router': { Stack: Object.assign(() => null, { Screen: () => null }) },
    '../../src/activity/useMobileActivity': { useMobileActivity() {} },
  });
  const navigationKey = () => Layout().key;
  assert.equal(navigationKey(), 'first:session-one');
  identity = { userId: null, sessionId: null };
  assert.equal(navigationKey(), 'first:session-one');
  identity = { userId: 'second', sessionId: 'session-two' };
  assert.equal(navigationKey(), 'second:session-two');
});
