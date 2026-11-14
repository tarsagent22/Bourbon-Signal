import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildMinnesotaCityHiveCanaryManifest} from '../src/prepare-central-cityhive-canary-manifest.mjs';

const manifest=JSON.parse(await readFile(new URL('../data/state-integration/MN.json',import.meta.url),'utf8'));
const previewConfig={activeStates:['MN'],states:{MN:{customerLabel:'Minnesota',publicStatus:'active',coverageTier:'sparse_live_store_inventory',
  refinementLevel:'store',lifecycle:'retailer_inventory_research',promotionStage:'canary',inventoryAlertable:false,watchAlertable:false}}};
const previewPolicy={state:'MN',mode:'canary_preview',alertDeliveryEnabled:false,productionSnapshotPublicationEnabled:false,productionDeploymentEnabled:false};
const sourceProvenance={status:'verified_github_shadow_artifact',state:'MN',workflowRunId:'43586205036',workflowRunUrl:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/43586205036',
  artifactId:'14110308404',artifactDigest:'33812069d1e141b2f491f0f40ad075fca4aa0ed16253cc8d1ea4787f3a973c5f'};
const canaryRunUrl='https://github.com/tarsagent22/Bourbon-Signal/actions/runs/43599999999';

test('MN canary manifest is isolated from the dormant production source manifest',()=>{
  const before=JSON.stringify(manifest),result=buildMinnesotaCityHiveCanaryManifest({manifest,previewConfig,previewPolicy,sourceProvenance,canaryRunUrl});
  assert.equal(result.lifecycle.publicStatus,'active');
  assert.equal(manifest.lifecycle.publicStatus,'research_only');assert.equal(JSON.stringify(manifest),before);
  assert.equal(result.collector.cohortSha256,'f8966ff41632ffe3d8f9dc06136bcaa453c7e0177cd3bc991dbd96baae197c74');
  assert.equal(result.customerPaths.finder.status,'verified');assert.equal(result.customerPaths.dashboard.status,'not_applicable');
  assert.equal(result.evidence.shadow.artifactDigest,sourceProvenance.artifactDigest);
  assert.equal(result.evidence.production.status,'not_deployed');assert.equal(result.evidence.production.url,null);
});

test('MN canary manifest rejects production activation and any preview or delivery bypass',()=>{
  for(const change of [
    {previewPolicy:{...previewPolicy,productionDeploymentEnabled:true}},
    {previewPolicy:{...previewPolicy,alertDeliveryEnabled:true}},
    {previewConfig:{...previewConfig,activeStates:[]}},
    {previewConfig:{...previewConfig,states:{MN:{...previewConfig.states.MN,inventoryAlertable:true}}}},
    {manifest:{...manifest,lifecycle:{...manifest.lifecycle,publicStatus:'active'}}},
    {sourceProvenance:{...sourceProvenance,artifactDigest:'bad'}},
    {canaryRunUrl:'https://example.test/run'},
  ])assert.throws(()=>buildMinnesotaCityHiveCanaryManifest({manifest,previewConfig,previewPolicy,sourceProvenance,canaryRunUrl,...change}));
});
