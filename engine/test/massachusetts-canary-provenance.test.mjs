import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMassachusettsEsplandaOrigin } from '../../scripts/download-ma-esplanda-shadow.mjs';
import { validateCityHiveShadowWorkflowOrigin } from '../../scripts/download-cityhive-shadow.mjs';
import { reconcileMassachusettsCityHiveBible } from '../src/prepare-massachusetts-canary.mjs';

const repository = 'tarsagent22/Bourbon-Signal';
const head = '1cd5ad32baaed83c2c2f9de4ee2c8993d629b49f';
const digest = `sha256:${'a'.repeat(64)}`;
function source(runId) {
  return {
    run: { id: runId, conclusion: 'success', status: 'completed', repository: { full_name: repository },
      path: '.github/workflows/state-expansion-shadow.yml', head_sha: head, html_url: `https://github.com/${repository}/actions/runs/${runId}` },
    artifact: { name: `state-expansion-shadow-${runId}`, expired: false, id: 14126138352, digest, size_in_bytes: 1000 },
  };
}

test('MA canary accepts only the two reviewed hosted shadow artifacts', () => {
  const city = source('43627853806');
  const cityProvenance = validateCityHiveShadowWorkflowOrigin({ state: 'MA', repository, ...city, currentHead: head, comparison: null });
  assert.equal(cityProvenance.workflowRunId, '43627853806');
  const esplanda = source('43624193800');
  const esplandaProvenance = validateMassachusettsEsplandaOrigin({ repository, ...esplanda, currentHead: head, comparison: null });
  assert.equal(esplandaProvenance.workflowRunId, '43624193800');
  assert.throws(() => validateMassachusettsEsplandaOrigin({ repository, ...source('43627853806'), currentHead: head, comparison: null }), /reviewed hosted artifact/);
});

test('MA canary fails closed on expired or mismatched source lineage', () => {
  const expired = source('43624193800'); expired.artifact.expired = true;
  assert.throws(() => validateMassachusettsEsplandaOrigin({ repository, ...expired, currentHead: head, comparison: null }), /reviewed hosted artifact/);
  const changedSource = source('43624193800'); changedSource.run.head_sha = 'f'.repeat(40);
  assert.throws(() => validateMassachusettsEsplandaOrigin({ repository, ...changedSource, currentHead: head, comparison: { status: 'ahead', files: [{ filename: 'engine/src/collectors/massachusetts-esplanda.mjs' }] } }), /collector source changed/);
});

test('MA reconciles only the reviewed full source/current Bible digest pair', () => {
  const oldSha = 'a222d6990e2d248780c116eff1fafb142db9c7434644201f8443683e879f5f1d';
  const currentSha = 'd175443d4945c401e636e64fa9738ca09c2966b5e9e4b79038eec18a8b754460';
  const report = { metadata: { bibleRecordsSha256: oldSha } };
  const proof = reconcileMassachusettsCityHiveBible(report, currentSha);
  assert.equal(proof.sourceBibleSha, oldSha);
  assert.equal(proof.currentBibleSha, currentSha);
  assert.equal(proof.replayReport.metadata.bibleRecordsSha256, currentSha);
  assert.equal(report.metadata.bibleRecordsSha256, oldSha, 'the retained source report must remain unchanged');
  assert.throws(() => reconcileMassachusettsCityHiveBible(report, 'f'.repeat(64)), /reviewed source\/current Bible pair/);
});
