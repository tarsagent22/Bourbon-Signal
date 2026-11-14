import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STATE_SOURCES, STATE_SOURCES } from '../src/state-sources.mjs';
import { collectState } from '../src/collectors/generic-state.mjs';
import { louisianaAlaskaLifecycleAdmitted } from '../src/louisiana-alaska-grocery-production-config.mjs';
import { syntheticLaakAdmission } from './helpers/synthetic-laak-admission.mjs';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('AK and LA production source registrations stay dormant until canonical lifecycle admission', async () => {
  const configs = ALL_STATE_SOURCES.filter((source) => ['AK', 'LA'].includes(source.id));
  assert.deepEqual(configs.map((source) => source.id).sort(), ['AK', 'LA']);
  assert.equal(STATE_SOURCES.some((source) => ['AK', 'LA'].includes(source.id)), false);
  for (const config of configs) {
    assert.equal(config.strategy, 'retailer_store_inventory');
    assert.equal(config.sources.some((source) => source.kind === 'costco' || source.signalType === 'costco_warehouse_inventory'), false);
    assert.equal(louisianaAlaskaLifecycleAdmitted(config.id), false);
    const result = await collectState(config, {});
    assert.equal(result.status, 'not_promoted');
    assert.deepEqual(result.signals, []);
    assert.deepEqual(result.sources, []);
  }
});

test('admitted collector failures remain full state reports and publish no partial rows',async()=>{
  const config=ALL_STATE_SOURCES.find(source=>source.id==='AK'),{lifecycle,manifest}=syntheticLaakAdmission('AK');
  const directory=await mkdtemp(path.join(os.tmpdir(),'laak-state-shape-'));
  try{
    const report=await collectState(config,{}, {lifecycleConfig:lifecycle,promotionManifest:manifest,env:{},incidentDirectory:directory,
      fetchText:async()=>{throw new Error('Synthetic transport failure');}});
    assert.equal(report.state,'AK');assert.equal(report.status,'blocked');
    assert.ok(Date.parse(report.startedAt));assert.ok(Date.parse(report.finishedAt));
    assert.equal(report.signals.length,0);assert.equal(report.sources.length,1);
    assert.equal(report.sources[0].sourceRuntimeId,'ak:grocery-xapi');
    assert.equal(report.sourceResults.length,1);assert.equal(report.roadblocks.length,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
