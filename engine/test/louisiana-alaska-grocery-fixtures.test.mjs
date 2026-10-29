import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fixture} from './helpers/synthetic-louisiana-alaska-promotion.mjs';
import {validateStateFixtures,executeStateFixtures} from '../src/verify-state-fixtures.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import {ALL_STATE_SOURCES} from '../src/state-sources.mjs';
import {collectState} from '../src/collectors/generic-state.mjs';

test('state fixtures execute actual source identity and nonpreview export with no live requests',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'la-ak-state-fixtures-'));
 try{
  const bibleFile=path.join(directory,'bible.json');await writeFile(bibleFile,JSON.stringify({records:fixture.records}));
  for(const state of ['LA','AK']){
   const data=JSON.parse(await readFile(new URL('../data/state-fixtures/'+state+'.json',import.meta.url),'utf8'));
   assert.deepEqual(validateStateFixtures(data),{ok:true,failures:[]});
   assert.deepEqual(await executeStateFixtures(data,{bibleFile}),{ok:true,failures:[]});
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('authoritative inactive lifecycle defeats forced-live collection without touching HTTP',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('Inactive source reached HTTP');});
 const bible=new BourbonBible(fixture.records);
 for(const state of ['LA','AK']){
  const config=ALL_STATE_SOURCES.find(row=>row.id===state);
  const report=await collectState(config,bible,{grocerySourceOptions:{forceLive:true}});
  assert.equal(report.status,'not_promoted');assert.equal(report.metadata.requestCount,0);assert.deepEqual(report.signals,[]);
 }
 assert.equal(requests,0);
});
