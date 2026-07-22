import assert from 'node:assert/strict';
import {
  applyTrackedRecommendation,
  createSerialFeedbackMutationQueue,
  shouldApplyFeedbackLoad,
  shouldRunFeedbackMutation,
} from '../src/lib/recommendation-feedback-client.ts';

let resolvePersistence!: () => void;
const order: string[] = [];
const persistence = new Promise<void>((resolve) => { resolvePersistence = resolve; });
const tracking = applyTrackedRecommendation({
  optimisticallyTrack: () => order.push('track'),
  persistTracking: () => { order.push('persist'); return persistence; },
  rollbackTracking: () => order.push('rollback'),
  writePositiveFeedback: async () => { order.push('feedback'); },
});
await Promise.resolve();
assert.deepEqual(order, ['track', 'persist'], 'positive feedback waits while tracking persistence is pending');
resolvePersistence();
await tracking;
assert.deepEqual(order, ['track', 'persist', 'feedback'], 'positive feedback is written only after tracking succeeds');

const failedOrder: string[] = [];
await assert.rejects(() => applyTrackedRecommendation({
  optimisticallyTrack: () => failedOrder.push('track'),
  persistTracking: async () => { failedOrder.push('persist'); throw new Error('save failed'); },
  rollbackTracking: () => failedOrder.push('rollback'),
  writePositiveFeedback: async () => { failedOrder.push('feedback'); },
}), /save failed/);
assert.deepEqual(failedOrder, ['track', 'persist', 'rollback'], 'failed persistence rolls back the optimistic watchlist entry without positive feedback');

const currentLoad = {
  requestedUserId: 'user-a',
  activeUserId: 'user-a',
  requestVersion: 3,
  currentRequestVersion: 3,
  mutationVersionAtStart: 4,
  currentMutationVersion: 4,
};
assert.equal(shouldApplyFeedbackLoad(currentLoad), true);
assert.equal(shouldApplyFeedbackLoad({ ...currentLoad, activeUserId: 'user-b' }), false, 'account changes invalidate in-flight loads');
assert.equal(shouldApplyFeedbackLoad({ ...currentLoad, currentMutationVersion: 5 }), false, 'a newer POST invalidates an older GET');
assert.equal(shouldApplyFeedbackLoad({ ...currentLoad, currentRequestVersion: 4 }), false, 'a newer GET invalidates an older GET');
assert.equal(shouldRunFeedbackMutation('user-a', 'user-a'), true);
assert.equal(shouldRunFeedbackMutation('user-a', 'user-b'), false, 'queued feedback cannot run after an account switch');
assert.equal(shouldRunFeedbackMutation('user-a', null), false, 'queued feedback cannot run after sign-out');

const enqueueMutation = createSerialFeedbackMutationQueue();
const mutationOrder: string[] = [];
let releaseFirst!: () => void;
const firstMutation = enqueueMutation(async () => {
  mutationOrder.push('first:start');
  await new Promise<void>((resolve) => { releaseFirst = resolve; });
  mutationOrder.push('first:end');
  return 'first';
});
const secondMutation = enqueueMutation(async () => {
  mutationOrder.push('second:start');
  return 'second';
});
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(mutationOrder, ['first:start'], 'a second feedback write waits for the first write to finish');
releaseFirst();
assert.equal(await firstMutation, 'first');
assert.equal(await secondMutation, 'second');
assert.deepEqual(mutationOrder, ['first:start', 'first:end', 'second:start'], 'feedback writes preserve user action order');

console.log('recommendation feedback client tests passed');
