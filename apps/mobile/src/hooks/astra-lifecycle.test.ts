import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadWithMocks } from '../astra-test-harness';

function hooks() {
  const slots: any[] = []; let cursor = 0; const effects: Array<() => unknown> = [];
  const memo = (create: () => any, deps: unknown[]) => {
    const index = cursor++; const previous = slots[index];
    if (!previous || deps.some((d,i) => d !== previous.deps[i])) slots[index] = { value: create(), deps };
    return slots[index].value;
  };
  return { reset: () => { cursor = 0; }, effects,
    react: { useRef: (initial: unknown) => memo(() => ({ current: initial }), []), useMemo: memo, useCallback: (f: unknown,deps: unknown[]) => memo(() => f,deps), useEffect: (f: () => unknown,deps: unknown[]) => memo(() => { effects.push(f); },deps) } };
}
test('M07: focus/resume hook refreshes only focused screen with latest loader, cleans listeners', async () => {
  const h = hooks(); let focus!: () => () => void; let onState!: (s: string) => void; let removed = false; const calls: string[] = [];
  const { useScreenRevalidation } = loadWithMocks('src/hooks/useScreenRevalidation.ts', {
    react: h.react, 'expo-router': { useFocusEffect: (f: typeof focus) => { focus = f; } },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_: string,f: typeof onState) => { onState = f; return { remove: () => { removed = true; } }; } } },
  });
  useScreenRevalidation(() => calls.push('old'));
  const cleanups = h.effects.map(f => f() as () => void); let blur = focus();
  h.reset(); useScreenRevalidation(() => calls.push('new'));
  onState('background'); onState('active'); onState('active');
  assert.deepEqual(calls, ['old','new']); blur(); onState('background'); onState('active'); assert.equal(calls.length, 2);
  blur = focus(); assert.equal(calls.at(-1), 'new'); blur(); cleanups.forEach(f => f?.()); assert.equal(removed, true);
});
test('M11: old API handles cannot acquire a new account token after a transition', async () => {
  const h = hooks(); let userId = 'A';
  const { useMobileApi } = loadWithMocks('src/hooks/useMobileApi.ts', {
    react: h.react, '@clerk/expo': { useAuth: () => ({ userId, sessionId: userId, getToken: async () => userId }) },
    '../api/client': { createMobileApi: ({ getToken }: any) => ({ token: getToken, clearReadCache() {} }), MobileApiError: class extends Error {} },
  });
  const old = useMobileApi(); assert.equal(await old.token(), 'A'); userId = 'B'; h.reset(); const next = useMobileApi();
  assert.notEqual(old, next); await assert.rejects(old.token()); assert.equal(await next.token(), 'B');
});

test('M13: async form outcomes announce once per changed message', () => {
  assert.ok(fs.existsSync('src/hooks/useAccessibleStatus.ts'), 'accessible status hook must exist');
  const h = hooks(); const spoken: string[] = [];
  const { useAccessibleStatus } = loadWithMocks('src/hooks/useAccessibleStatus.ts', { react: h.react, 'react-native': { AccessibilityInfo: { announceForAccessibility: (s: string) => spoken.push(s) } } });
  for (const message of ['', 'Saved.', 'Saved.', 'Please retry.']) {
    h.reset(); useAccessibleStatus(message); while (h.effects.length) h.effects.shift()!();
  }
  assert.deepEqual(spoken, ['Saved.', 'Please retry.']);
  for (const file of ['app/index.tsx','app/(app)/(tabs)/radar.tsx','app/(app)/(tabs)/post.tsx','app/(app)/(tabs)/hq.tsx']) assert.ok(fs.readFileSync(file,'utf8').includes('useAccessibleStatus('), file);
});
