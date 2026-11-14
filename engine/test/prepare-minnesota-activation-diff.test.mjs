import test from 'node:test';
import assert from 'node:assert/strict';
import lifecycle from '../../src/config/state-lifecycle.json' with {type:'json'};
import manifest from '../data/state-integration/MN.json' with {type:'json'};
import {buildMinnesotaActivationDiff} from '../src/prepare-minnesota-activation-diff.mjs';

test('MN activation diff remains fail-closed until distinct fresh evidence and all customer paths are supplied',()=>{
  const dormantLifecycle={...lifecycle,activeStates:lifecycle.activeStates.filter(state=>state!=='MN'),
    states:{...lifecycle.states,MN:{...lifecycle.states.MN,publicStatus:'research_only'}}};
  const dormantManifest={...manifest,lifecycle:{...manifest.lifecycle,publicStatus:'research_only'}};
  const result=buildMinnesotaActivationDiff({lifecycle:dormantLifecycle,manifest:dormantManifest,
    evidence:{promotionEvidence:{immutableEvidence:{shadowRuns:[{runId:'43594853292',status:'success'}],canaryRuns:[{runId:'43594988302',status:'success'}]}}}});
  assert.equal(result.ready,false);assert.equal(result.diff,null);assert.equal(result.authoritativeFilesWritten,false);
  assert.match(result.blockers.join('\n'),/3 distinct evidence links/);assert.match(result.blockers.join('\n'),/2 distinct evidence links/);
  assert.match(result.blockers.join('\n'),/source history reconciliation/);assert.match(result.blockers.join('\n'),/customer path proofs/);
  assert.equal(dormantLifecycle.activeStates.includes('MN'),false);assert.equal(dormantManifest.lifecycle.publicStatus,'research_only');
});
