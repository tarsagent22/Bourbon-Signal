import test from 'node:test';

// The rehearsal uses retained public refresh timings and blocks every fetch.
test('fleet collection can overlap FWGS and still require each independent prerequisite', async () => {
  await import('./rehearse-fwgs-state-overlap.mjs');
});
