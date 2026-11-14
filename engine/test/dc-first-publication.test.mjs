import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDcFirstPublication} from '../src/verify-dc-first-publication.mjs';

test('DC first publication verifier fails closed without fresh immutable source and partition evidence',()=>{
  const result=evaluateDcFirstPublication({workflowRunId:'43628703889',reportSha256:'a'.repeat(64),partitionSha256:'b'.repeat(64),
    report:{state:'DC',status:'useful',stale:false,metadata:{complete:true,allDeliveryDisabled:true,cityhive:{complete:true},pearsons:{complete:true}}},
    partition:{drops:[]},nowMs:Date.parse('2026-11-14T19:00:00.000Z')});
  assert.equal(result.ok,false);
  assert.ok(result.failures.some(message=>message.includes('four successful requests')));
  assert.ok(result.failures.some(message=>message.includes('exact product-page pickup receipt')));
  assert.ok(result.failures.some(message=>message.includes('both CityHive premises')));
});

test('DC first publication verifier refuses any alert or delivery eligibility',()=>{
  const result=evaluateDcFirstPublication({workflowRunId:'43628703889',reportSha256:'a'.repeat(64),partitionSha256:'b'.repeat(64),
    report:{state:'DC',status:'blocked',stale:false,metadata:{complete:false,allDeliveryDisabled:true}},partition:{drops:[{
      state:'DC',canAlertAsInventory:true,canAlertAsWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false,
    }]},nowMs:Date.parse('2026-11-14T19:00:00.000Z')});
  assert.ok(result.failures.some(message=>message.includes('alerts and delivery disabled')));
});
