import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {executeStateFixtures, validateStateFixtures} from '../src/verify-state-fixtures.mjs';
import {sources, origin} from '../src/south-dakota-pickup-policy.mjs';
import {southDakotaProductionAllowed} from '../src/collectors/south-dakota-production.mjs';

const names=sources.flatMap(source=>source.products.map(product=>product[3]));
const records=names.map((canonical,index)=>({id:`sd-fixture-${index}`,canonical,
  libraryIdentities:[{id:`sd-fixture-${index}`,canonicalName:canonical,aliases:[],isAlertEligible:true,nationalTier:'limited'}]}));
const bible={records,match(name){const record=records.find(item=>item.canonical===name);return record?{record,confidence:1}:null;}};

test('South Dakota fixture executes exact registered merchandise, premise, clock and silent pickup assertions',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../data/state-fixtures/SD.json',import.meta.url),'utf8'));
  assert.equal(validateStateFixtures(fixture).ok,true);
  assert.deepEqual(await executeStateFixtures(fixture,{bible}),{ok:true,failures:[]});
  const wrongHost=structuredClone(fixture);
  wrongHost.cases.at(-1).input.sourceUrl='https://example.invalid/';
  wrongHost.cases.at(-1).expected.officialHost=false;
  assert.deepEqual(await executeStateFixtures(wrongHost,{bible}),{ok:true,failures:[]});
  assert.equal(new URL(origin).hostname,'www.mrliquor.com');
});

test('South Dakota protected preview receipt binds exact stores while candidate fails closed without immutable proof',async()=>{
  const [manifestBytes,receiptBytes,lifecycleBytes]=await Promise.all([
    readFile(new URL('../data/state-integration/SD.json',import.meta.url)),
    readFile(new URL('../data/canary-site/sd-protected-preview-20261114.json',import.meta.url)),
    readFile(new URL('../../src/config/state-lifecycle.json',import.meta.url)),
  ]);
  const manifest=JSON.parse(manifestBytes),receipt=JSON.parse(receiptBytes),lifecycle=JSON.parse(lifecycleBytes);
  assert.equal(createHash('sha256').update(receiptBytes).digest('hex'),manifest.evidence.protectedCanaryPreview.receiptSha256);
  assert.equal(receipt.provenanceArtifactSha256,'7b34e1d5c7ae4568eb7012e2f5653c986b0664ab5e510dc570fdbf022f0638cd');
  assert.equal(receipt.canaryInputSha256,'b3b01d1eab961012d6649482fdfc24c7bf03a0b2f303f9a8802cfc6d60238aaa');
  assert.equal(receipt.partitionSha256,'217e2d9de6198d66e712d7140b1cbe6099b1f89cad80d403c068b8f299b2e298');
  assert.equal(receipt.rows,3);assert.equal(receipt.currentStores,2);assert.equal(receipt.alertEligibleStores,0);
  assert.deepEqual(receipt.finder.map(row=>row.storeId),sources.map(source=>`sante:sd:mr-liquor:${source.id}`));
  assert.equal(receipt.productionFirstPublicationVerified,false);
  assert.equal(lifecycle.states.SD.publicStatus,'active');assert.equal(lifecycle.activeStates.includes('SD'),true);
  assert.equal(southDakotaProductionAllowed({lifecycleConfig:lifecycle,manifest}),false);
});
