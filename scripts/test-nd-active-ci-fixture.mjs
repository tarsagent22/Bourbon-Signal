import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site=path.join(root,'engine/data/canary-site/nd-active-candidate');
const json=async file=>JSON.parse(await readFile(path.join(site,file),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('ND CI-only customer fixture preserves its exact reviewed hosted partition',async()=>{
  const [proof,manifest,partitionBytes,locations,stats,alerts]=await Promise.all([
    json('source-proof.json'),json('manifest.json'),readFile(path.join(site,'states/ND/drops.json')),
    json('locations.json'),json('stats.json'),json('alerts.json'),
  ]);
  const partition=JSON.parse(partitionBytes.toString('utf8'));
  assert.equal(proof.mode,'reviewed_ci_only_canary_extract');
  assert.equal(proof.originalPartitionBytesPreserved,true);
  assert.equal(proof.productionSnapshotTouched,false);
  assert.equal(proof.runs.length,1);
  assert.equal(proof.runs[0].state,'ND');
  assert.equal(proof.runs[0].canaryRunId,'43663736227');
  assert.equal(proof.runs[0].sourceShadowRunId,'43663226351');
  assert.equal(proof.runs[0].partitionSha256,sha(partitionBytes));
  assert.equal(partition.state,'ND');
  assert.equal(partition.count,3);
  assert.equal(partition.drops.length,3);
  assert.equal(new Set(partition.drops.map(row=>row.storeId)).size,2);
  assert.equal(locations.locations.filter(row=>row.state==='ND').length,2);
  assert.equal(stats.stateCoverage.states.find(row=>row.state==='ND')?.signalCount,3);
  assert.equal(alerts.alerts.some(row=>row.state==='ND'),false);
  assert.equal(manifest.sourceArtifact,'state-expansion-canary-ND-43663736227');
  assert.equal(alerts.previewAlertDeliveryDisabled,true);
});
