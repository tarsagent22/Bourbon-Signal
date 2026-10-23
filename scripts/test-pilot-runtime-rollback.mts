import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { transform } from 'esbuild';
import * as policy from '../engine/src/sources/poll-policy.mjs';
import * as shopifyPolicy from '../engine/src/sources/shopify-pickup-policy.mjs';
import { JENSENS_RUNTIME_SOURCE } from '../engine/src/collectors/florida-jensens-runtime-source.mjs';
import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from '../engine/src/collectors/california-san-diego-surfaces.mjs';

type Row = Record<string, any>;

// Execute both saved runtime modules in memory, using their actual policy and
// registry code. Infrastructure stubs count forbidden accesses even if a caller
// catches the thrown exception, so a false fail-closed result cannot pass.
async function runtime() {
  let infrastructureTouches = 0;
  const forbidden = (name: string) => () => { infrastructureTouches++; throw new Error(`Unexpected infrastructure access: ${name}`); };
  const unavailable = new Proxy({}, { get(_target, name) { return forbidden(String(name)); } });
  const load = async (file: string, dependencies: (name: string) => unknown) => {
    const code = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const result = await transform(code, { loader: 'ts', format: 'cjs', target: 'node22' });
    const module = { exports: {} as Row };
    new Function('require', 'module', 'exports', result.code)(dependencies, module, module.exports);
    return module.exports;
  };
  const scheduler = await load('src/lib/source-scheduler.ts', name => {
    if (name === 'node:crypto') return crypto;
    if (name.endsWith('/sources/poll-policy.mjs')) return policy;
    if (name.endsWith('/sources/shopify-pickup-policy.mjs')) return shopifyPolicy;
    if (name.endsWith('/florida-jensens-runtime-source.mjs')) return { JENSENS_RUNTIME_SOURCE, collectJensensSource: forbidden('collector') };
    if (name.endsWith('/california-san-diego-surfaces.mjs')) return { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES };
    if (name === './alert-queue/runtime') return { createProductionAlertQueueSqlExecutor: forbidden('database') };
    return unavailable;
  });
  const wrapper = await load('src/lib/source-lane-runtime.ts', name => {
    if (name.endsWith('/sources/poll-policy.mjs')) return policy;
    if (name === './source-scheduler') return scheduler;
    if (name === 'next/cache') return { unstable_cache: (fn: unknown) => fn };
    if (name === './source-lane') return { SOURCE_LANES: [], SourceLaneRepository: class { constructor() { forbidden('repository')(); } } };
    if (name === './alert-queue/runtime') return { createProductionAlertQueueSqlExecutor: forbidden('database'), alertQueueDatabaseConfigured: forbidden('database configuration') };
    return unavailable;
  });
  return { scheduler, wrapper, touches: () => infrastructureTouches };
}

const seed = JENSENS_RUNTIME_SOURCE.products[0];
const owned: Row = { id: 'snapshot-pilot', state: 'FL', sourceChain: JENSENS_RUNTIME_SOURCE.chain, storeId: JENSENS_RUNTIME_SOURCE.store.id,
  productId: seed.productId, variantId: seed.variantId, canAlertAsInventory: true, canAlertAsWatch: true };
const siblings: Row[] = [
  { ...owned, id: 'other-jensen-product', productId: '7793267081290', variantId: '41616729079882' },
  { ...owned, id: 'other-jensen-store', storeId: 'jensens-liquors:other' },
  { ...owned, id: 'fl-abc', sourceChain: 'abc-fine-wine-spirits' },
  { ...owned, id: 'ca-mission-trails', state: 'CA', sourceChain: 'mission-trails-wine-spirits' },
];

test('actual runtime wrappers retain narrow pilot disable after the global scheduler is switched off', async () => {
  const variables = { SOURCE_SCHEDULER_ENABLED: '0', JENSENS_SOURCE_POLL_ENABLED: '0', SOURCE_LANE_STORAGE_ENABLED: '0', SOURCE_LANE_POLL_ENABLED: '0' };
  const previous = Object.fromEntries(Object.keys(variables).map(name => [name, process.env[name]]));
  Object.assign(process.env, variables);
  try {
    const { scheduler, wrapper, touches } = await runtime();
    for(const id of ['fl:jensens-miami','ca:mission-trails-wine-spirits']) assert.equal(scheduler.POLL_SOURCES.find((source:Row)=>source.id===id).noImmediateRetry,true);
    assert.equal(scheduler.schedulerEnabled(), false);
    const rows = [owned, ...siblings];
    const result = await wrapper.readRuntimeSourceDropOverlay(rows, 'snapshot-test');
    const suppressed = result.drops.find((row: Row) => row.id === owned.id);
    assert.equal(suppressed.stale, true);
    assert.equal(suppressed.canAlertAsInventory, false);
    assert.equal(suppressed.canAlertAsWatch, false);
    for (const sibling of siblings) assert.deepEqual(result.drops.find((row: Row) => row.id === sibling.id), sibling);
    assert.equal(owned.stale, undefined, 'consumer must not mutate the snapshot input');

    const merged = await wrapper.mergeRuntimeSourceCandidates(rows, { snapshotId: 'snapshot-test' });
    assert.deepEqual(merged, siblings);
    assert.equal(await wrapper.runtimeSourceCandidatesStillValid([owned]), false, 'final check vetoes an untagged snapshot candidate');
    assert.equal(await wrapper.runtimeSourceCandidatesStillValid([{ ...owned, sourcePollId: JENSENS_RUNTIME_SOURCE.runtimeId }]), false, 'final check also vetoes an earlier runtime candidate');
    assert.equal(await wrapper.runtimeSourceCandidatesStillValid(siblings), true);
    assert.equal(touches(), 0, 'rollback reads and final validation require no database, export, collector, or repository access');
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
