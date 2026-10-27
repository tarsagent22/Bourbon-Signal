import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BourbonBible} from '../src/core/bible.mjs';
import {canonicalizeSignal,candidateFromChange} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops,buildAlerts,bindReportedInventoryAlertsToPublicDrops,buildCurrentInventoryAlertsFromDrops} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/library-search/reported-alert-binding.json',import.meta.url)));
const bible=new BourbonBible(fixture.records);
function replay(t){
 t.mock.timers.enable({apis:['Date'],now:Date.parse(fixture.capturedAt)+60_000});
 const op=fixture.signals.map(s=>canonicalizeSignal(s,bible));
 const drops=buildDrops(op,bibleLookup(bible.records),op).filter(isPublicDropFeedEligible);
 const alerts=buildAlerts({candidates:op.map(after=>candidateFromChange({type:'new_signal',after}))});
 return{op,drops,alerts};
}

test('legacy Little Book rows without current store proof stay excluded while verified Weller remains alertable',t=>{
 const{drops,alerts}=replay(t);
 assert.equal(drops.length,1);assert.equal(drops.filter(d=>d.sourceChain==='smart-final').length,1);
 assert.equal(alerts.length,1,'Old unproven Mesa and Tempe rows cannot enter either the public feed or alert candidates');
 const bound=bindReportedInventoryAlertsToPublicDrops(alerts,drops);
 assert.equal(bound.length,1);const weller=bound.find(a=>a.sourceChain==='smart-final');assert.equal(weller.bottle,'Weller Full Proof');assert.equal(weller.price,69.99);assert(bound.every(a=>!a.sourceUrl.includes('118-p')));
});

test('reported inventory binding requires the same fresh source, premise, product, observation, price and quantity',t=>{
 const{drops,alerts}=replay(t);const valid=alerts.find(a=>a.sourceChain==='smart-final');
 assert.equal(bindReportedInventoryAlertsToPublicDrops([valid],drops).length,1);
 for(const mutate of [a=>a.storeId='other',a=>a.sourceChain='other',a=>a.productId='other',a=>a.variantId='other',a=>a.rawName='Weller Special Reserve',a=>a.sourceUrl+='?other',a=>a.storeAddress='999 Wrong Rd',a=>a.quantity=1,a=>a.quantityIsExact=true,a=>a.price=70,a=>a.observedAt=new Date(Date.parse(a.observedAt)-60_000).toISOString()]){
  const c=structuredClone(valid);mutate(c);assert.deepEqual(bindReportedInventoryAlertsToPublicDrops([c],drops),[]);
 }
 assert.deepEqual(bindReportedInventoryAlertsToPublicDrops([valid],drops.map(d=>({...d,stale:true}))),[]);
 assert.deepEqual(bindReportedInventoryAlertsToPublicDrops([valid],drops.map(d=>({...d,sourceStale:true}))),[]);
 const watch={action:'watch_alert_candidate',id:'watch'};assert.deepEqual(bindReportedInventoryAlertsToPublicDrops([watch],[]),[watch]);
});

test('verified Arizona binary stock also remains eligible for current-inventory alerts without inventing a bottle count',t=>{
 const{drops:allDrops}=replay(t);const drops=allDrops.filter(d=>d.sourceChain==='smart-final');const current=buildCurrentInventoryAlertsFromDrops(drops);
 assert.equal(current.length,1);assert.equal(current[0].quantity,0);assert.equal(current[0].quantityIsExact,false);
 assert(current[0].gates.includes('verified_binary_orderability'));
 assert.equal(bindReportedInventoryAlertsToPublicDrops(current,drops).length,1);
 assert.equal(buildCurrentInventoryAlertsFromDrops(drops.map(d=>({...d,sourceProductBinding:null}))).length,0);
});
