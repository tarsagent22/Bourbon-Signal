import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNationwidePilotAcceptance, NATIONWIDE_PILOT_EVIDENCE_VERSION } from './lib/nationwide-pilot-acceptance.mjs';

const now = '2026-10-23T02:32:00.000Z';
const options = { now, allowedBottleIds: ['elijah-craig-18', 'eagle-rare-10'] };
const proof = () => ({ url: 'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/123/artifacts/456', sha256: 'a'.repeat(64) });
function evidence() {
  const definitions = [
    ['ca:mission-trails-wine-spirits', 'CA', 'mission-trails-wine-spirits:8181-mission-gorge', '8181 Mission Gorge Rd, Ste A, San Diego, CA 92120', 'https://missiontrailswineandspirits.com/products/eagle-rare-10', 'eagle-rare-10', '123', '456'],
    ['fl:jensens-miami', 'FL', 'jensens-liquors:1646-sw-27th', '1646 SW 27th Ave, Miami, FL 33145', 'https://jensensliquors.com/products/elijah-craig-single-barrel-18-years-bourbon-whiskey', 'elijah-craig-18', '15414448390218', '67703590977610'],
  ];
  return {
    contractVersion: NATIONWIDE_PILOT_EVIDENCE_VERSION,
    sources: definitions.map(([sourceId, state, storeId, storeAddress, sourceUrl, canonicalBottleId, productId, variantId]) => ({
      sourceId, state, cadenceSeconds: 1800,
      runs: [0, 1].map(index => {
        const start = Date.parse('2026-10-23T02:00:00.000Z') + index * 1800_000;
        const observation = { state, storeId, storeAddress, sourceUrl, canonicalBottleId, productId, variantId,
          observedAt: new Date(start + 1000).toISOString(), availability: 'in_stock', locationPrecision: 'store_level', quantitySemantics: 'binary_orderability', quantityIsExact: false, quantity: 0,
          fulfillmentEvidenceType: state === 'CA' ? 'retailer_pickup_policy' : 'variant_pickup_offer', fulfillmentPolicyVerified: state === 'CA', pickupVerified: state === 'FL', sizeMl: 750, sizeEvidenceType: 'source_metadata' };
        const run = { runId: `${sourceId}-${index}`, generation: index + 10, trigger: 'scheduled', manualDueReset: false, status: 'accepted',
          dueAt: new Date(start).toISOString(), startedAt: new Date(start).toISOString(), finishedAt: new Date(start + 2000).toISOString(),
          bootstrap: index === 0, requests: 2, bytes: 1000, durationMs: 2000, provenance: proof(), candidateCount: 0, candidateKeys: [], observations: [observation] };
        run.customerReceipts = ['feed', 'coverage'].map(surface => ({ ...observation, surface, sourceId, runId: run.runId, generation: run.generation, receivedAt: new Date(start + 3000).toISOString(), provenance: proof() }));
        return run;
      }),
    })),
    maintenance: { boundedBackoff: true, fencedLeases: true, sourceIsolationVerified: true, staleSuppressionVerified: true, rollbackVerified: true,
      receipts: Object.fromEntries(['boundedBackoff', 'fencedLeases', 'sourceIsolationVerified', 'staleSuppressionVerified', 'rollbackVerified'].map(key => [key, proof()])), monitorReceiptAt: '2026-10-23T02:31:00.000Z', monitorProvenance: proof() },
  };
}
test('two independently scheduled cross-state runs with source-specific receipts pass', () => {
  assert.deepEqual(evaluateNationwidePilotAcceptance(evidence(), options).failures, []);
  assert.deepEqual(evaluateNationwidePilotAcceptance(evidence(), options).counts, { sources: 2, states: 2, physicalPremises: 2, runs: 4, emittedCandidateKeys: 0 });
});
test('new non-bootstrap candidate needs its own matching canonical receipt', () => {
  const input = evidence(), run = input.sources[1].runs[1];
  run.candidateKeys = ['new-opportunity']; run.candidateCount = 1;
  assert.equal(evaluateNationwidePilotAcceptance(input, options).ok, false);
  run.customerReceipts.push({ ...run.customerReceipts[0], surface: 'candidate', candidateKey: 'new-opportunity' });
  assert.equal(evaluateNationwidePilotAcceptance(input, options).ok, true);
  run.customerReceipts.at(-1).canonicalBottleId = 'other';
  assert.equal(evaluateNationwidePilotAcceptance(input, options).ok, false);
});
test('existing CA projection need not pretend its first pilot measurement is bootstrap', () => {
  const input = evidence(); input.sources[0].runs[0].bootstrap = false;
  assert.equal(evaluateNationwidePilotAcceptance(input, options).ok, true);
});
test('CA volume may remain unpublished instead of fabricating size from generic product metadata', () => {
  const input = evidence();
  for (const run of input.sources[0].runs) { run.observations[0].sizeMl = null; run.observations[0].sizeEvidenceType = 'not_published'; }
  assert.equal(evaluateNationwidePilotAcceptance(input, options).ok, true);
});

const mutations = {
  'missing source': e => e.sources.pop(),
  'duplicate source masquerades as cross-state coverage': e => e.sources[1] = structuredClone(e.sources[0]),
  'single observation is not repeatability': e => e.sources[1].runs.pop(),
  'manual collection is not unattended': e => e.sources[1].runs[1].trigger = 'manual',
  'manual due reset is not a due run': e => e.sources[1].runs[1].manualDueReset = true,
  'missing due reset provenance fails closed': e => delete e.sources[1].runs[1].manualDueReset,
  'short cadence cannot weaken acceptance': e => e.sources[1].cadenceSeconds = 1,
  'future due time is not genuinely due': e => e.sources[1].runs[1].dueAt = '2026-10-23T02:31:00Z',
  'repeated due clock is not a second scheduled period': e => e.sources[1].runs[1].dueAt = e.sources[1].runs[0].dueAt,
  'generation reuse': e => e.sources[1].runs[1].generation = e.sources[1].runs[0].generation,
  'run id reuse': e => e.sources[1].runs[1].runId = e.sources[1].runs[0].runId,
  'stale observation': e => e.sources[1].runs[1].observations[0].observedAt = '2026-10-22T00:00:00Z',
  'old source observation under new run': e => e.sources[1].runs[1].observations[0].observedAt = e.sources[1].runs[0].observations[0].observedAt,
  'premises identity mismatch': e => e.sources[1].runs[1].observations[0].storeAddress = '999 Other Rd, Miami, FL',
  'catalog is not inventory': e => e.sources[1].runs[1].observations[0].locationPrecision = 'online',
  'foreign product host': e => e.sources[1].runs[1].observations[0].sourceUrl = 'https://attacker.example/products/elijah',
  'unreviewed Jensen variant': e => e.sources[1].runs[1].observations[0].variantId = '41616729079882',
  'unsupported bottle': e => e.sources[1].runs[1].observations[0].canonicalBottleId = 'bourbon-generic',
  '375ML is outside pilot': e => e.sources[1].runs[1].observations[0].sizeMl = 375,
  'infinite volume is not measured size': e => e.sources[1].runs[1].observations[0].sizeMl = Infinity,
  'string volume is not measured size': e => e.sources[1].runs[1].observations[0].sizeMl = '750',
  'oversize is outside reviewed bottle formats': e => e.sources[1].runs[1].observations[0].sizeMl = 3000,
  'missing pickup proof': e => e.sources[1].runs[1].observations[0].pickupVerified = false,
  'CA policy does not prove per-variant pickup': e => e.sources[0].runs[1].observations[0].pickupVerified = true,
  'CA cannot claim the FL evidence type': e => e.sources[0].runs[1].observations[0].fulfillmentEvidenceType = 'variant_pickup_offer',
  'CA needs verified retailer pickup policy': e => e.sources[0].runs[1].observations[0].fulfillmentPolicyVerified = false,
  'FL cannot substitute general pickup policy for exact variant': e => e.sources[1].runs[1].observations[0].fulfillmentEvidenceType = 'retailer_pickup_policy',
  'FL volume is mandatory': e => e.sources[1].runs[1].observations[0].sizeMl = null,
  'claimed volume needs source metadata': e => e.sources[0].runs[1].observations[0].sizeEvidenceType = 'inferred',
  'binary stock cannot claim exact quantity': e => e.sources[1].runs[1].observations[0].quantityIsExact = true,
  'binary stock cannot invent count': e => e.sources[1].runs[1].observations[0].quantity = 7,
  'missing source-specific customer receipt': e => e.sources[1].runs[1].customerReceipts = [{ state: 'FL', total: 100 }],
  'old customer generation': e => e.sources[1].runs[1].customerReceipts[0].generation--,
  'wrong canonical receipt': e => e.sources[1].runs[1].customerReceipts[0].canonicalBottleId = 'other',
  'future receipt': e => e.sources[1].runs[1].customerReceipts[0].receivedAt = '2026-10-24T00:00:00Z',
  'mutable-only receipt': e => delete e.sources[1].runs[1].customerReceipts[0].provenance.sha256,
  'bootstrap candidates': e => { e.sources[1].runs[0].candidateCount = 1; e.sources[1].runs[0].candidateKeys = ['emit-1']; },
  'duplicate emitted opportunity': e => { for (const s of e.sources) { s.runs[1].candidateCount = 1; s.runs[1].candidateKeys = ['same']; } },
  'duplicate observations': e => e.sources[1].runs[1].observations.push(structuredClone(e.sources[1].runs[1].observations[0])),
  'unbounded request count': e => e.sources[1].runs[1].requests = 7,
  'unbounded transfer': e => e.sources[1].runs[1].bytes = 4 * 1024 * 1024 + 1,
  'unbounded duration': e => e.sources[1].runs[1].durationMs = 50_001,
  'invented duration conflicts with run clock': e => e.sources[1].runs[1].durationMs = 0,
  'missing rollback exercise': e => e.maintenance.rollbackVerified = false,
  'asserted maintenance without receipt': e => delete e.maintenance.receipts.sourceIsolationVerified,
  'old monitor receipt': e => e.maintenance.monitorReceiptAt = '2026-10-23T00:00:00Z',
  'malformed nested arrays fail closed': e => { e.sources[1].runs[1].candidateKeys = {}; e.sources[1].runs[1].observations = [null]; },
};
for (const [name, mutate] of Object.entries(mutations)) test(name, () => {
  const input = evidence(); mutate(input);
  const result = evaluateNationwidePilotAcceptance(input, options);
  assert.equal(result.ok, false, name);
  assert.ok(result.failures.length > 0);
});
test('missing evidence and missing trusted catalog never pass', () => {
  assert.equal(evaluateNationwidePilotAcceptance(null, options).ok, false);
  assert.equal(evaluateNationwidePilotAcceptance(evidence(), { now }).ok, false);
});
