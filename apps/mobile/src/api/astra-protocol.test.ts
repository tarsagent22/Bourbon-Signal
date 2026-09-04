import assert from 'node:assert/strict';
import test from 'node:test';
import { createMobileApi, MobileApiError } from './client';
const protocol = (e: unknown) => e instanceof MobileApiError && e.code === 'INVALID_RESPONSE';
test('M06: malformed successful preferences never reach business logic', async () => {
  for (const body of ['<html>proxy</html>', 'null', '{}', '{"collectionPreferences":{"bottles":[]}}']) {
    const api = createMobileApi({ getToken: async () => 'A', fetcher: async () => new Response(body) });
    await assert.rejects(api.getMemberPreferences(), protocol);
    await assert.rejects(api.updateMemberPreferences({ alertMode: 'anything_notable' }), protocol);
  }
});
test('M06: every typed API family rejects incomplete success and wrong contract versions', async () => {
  for (const payload of [{}, { contractVersion: 'future@99' }]) {
    const api = createMobileApi({ baseUrl: 'https://protocol.invalid', getToken: async () => 'A', fetcher: async () => Response.json(payload) });
    for (const call of [() => api.listSignals(), () => api.getSignal('s'), () => api.getMemberProfile(), () => api.getMemberAlerts(),
      () => api.getMembershipTrialEligibility(), () => api.getSignalPoints(), () => api.getPushDeviceStatus(), () => api.listRadarBottles(),
      () => api.searchMonitoringGeography(), () => api.getHuntOutcome('s'), () => api.submitSighting({} as never, 'key'),
      () => api.attachSightingPhoto('sighting_a', { pathname: 'sighting-proofs/sighting_a/1.jpg' }),
      () => api.submitBottleContribution({ rawName: 'Test', source: 'collection' })]) await assert.rejects(call(), protocol);
  }
});
test('M06: malformed error bodies remain controlled and bounded', async () => {
  for (const body of ['null', '<html>oops</html>', JSON.stringify({ error: 'x'.repeat(10000) })]) {
    const api = createMobileApi({ getToken: async () => 'A', fetcher: async () => new Response(body, { status: 503 }) });
    await assert.rejects(api.getMemberAlerts(), (e: unknown) => e instanceof MobileApiError && e.status === 503 && e.message.length <= 240);
  }
});
