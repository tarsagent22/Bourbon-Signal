import assert from 'node:assert/strict';
import test from 'node:test';
import * as navigation from '../push/push-navigation';
import fs from 'node:fs';

test('M07: pending cold-start push waits for auth/navigation and is consumed once', () => {
  assert.equal(typeof navigation.createPendingPushNavigation, 'function');
  const queue = navigation.createPendingPushNavigation();
  queue.receive('os-1', { screen: 'radar', alertId: 'alert-1' });
  assert.equal(queue.take(false, true), null); assert.equal(queue.take(true, false), null);
  assert.equal(queue.take(true, true)?.params.request, 'os-1');
  assert.equal(queue.take(true, true), null);
  queue.receive('os-1', { screen: 'radar', alertId: 'alert-1' }); assert.equal(queue.take(true, true), null);
  queue.receive('os-2', { screen: 'radar', alertId: 'alert-1' }); assert.equal(queue.take(true, true)?.params.request, 'os-2');
  queue.receive('os-3', { screen: 'evil', alertId: 'alert-3' }); assert.equal(queue.take(true, true), null);
});
test('M07: mounted Radar, Account and Feed wire focus/resume fresh revalidation', () => {
  for (const screen of ['radar', 'hq', 'index']) {
    const source = fs.readFileSync(`app/(app)/(tabs)/${screen}.tsx`, 'utf8');
    assert.match(source, /useScreenRevalidation\(/);
  }
  const radar = fs.readFileSync('app/(app)/(tabs)/radar.tsx','utf8');
  assert.match(radar, /request[^\n]*load\(true\)|load\(true\)[^\n]*request/);
});
