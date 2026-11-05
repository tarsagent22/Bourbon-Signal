import assert from 'node:assert/strict';
import test from 'node:test';
import {nearbyStoreIndex,addNearbySignals} from '../src/lib/nearby.ts';
import {nearbyVisible,parsePlace,placeLookupPath,storeMapUrl} from '../apps/mobile/src/signals/nearby.ts';
import type {Signal} from '../apps/mobile/src/api/types.ts';
import type {NearbyStore} from '../shared/nearby.ts';
const raw={id:'1',name:'Store',address:'123 Main St',city:'Raleigh',state:'NC',lat:35.78,lng:-78.64,locationType:'store'};
const signal={id:'signal1',location:{scope:'exact_store',store:{address:'123 Main Street',city:'Raleigh',state:'NC'}},bottle:{name:'Eagle Rare 10 Year'}} as Signal;
test('only exact reports at confirmed coordinates become nearby results',()=>{const index=nearbyStoreIndex([raw]),found=new Map<string,NearbyStore>();assert.equal(found.size,0);assert.equal(addNearbySignals([signal,signal],index,{latitude:35.78,longitude:-78.64},10,found),0);assert.equal(found.size,1);assert.equal([...found.values()][0].signals.length,1);assert.equal([...found.values()][0].distance,0);});
test('area reports and same address in another city cannot attach',()=>{const found=new Map<string,NearbyStore>();const area={...signal,location:{...signal.location,scope:'board'}} as Signal;const wrong={...signal,location:{...signal.location,store:{...signal.location.store,city:'Durham'}}} as Signal;assert.equal(addNearbySignals([area,wrong],nearbyStoreIndex([raw]),{latitude:35.78,longitude:-78.64},100,found),1);assert.equal(found.size,0);});
test('placeholder coordinates and conflicting geocodes are excluded',()=>{assert.equal(nearbyStoreIndex([{...raw,lat:0,lng:0}]).size,0);assert.equal(nearbyStoreIndex([raw,{...raw,lat:36}]).size,0);});
test('ZIP and city lookup encode user text and require state',()=>{assert.equal(placeLookupPath('27601'),'/us/27601');assert.equal(placeLookupPath('Raleigh, NC'),'/us/nc/raleigh');assert.equal(placeLookupPath('Chapel Hill','NC'),'/us/nc/chapel%20hill');assert.throws(()=>placeLookupPath('Raleigh'));});
test('ZIP and city responses produce a finite center and readable label',()=>{assert.deepEqual(parsePlace({'place name':'Raleigh','state abbreviation':'NC',places:[{latitude:'35',longitude:'-78'},{latitude:'37',longitude:'-80'}]}),{latitude:36,longitude:-79,label:'Raleigh, NC'});assert.throws(()=>parsePlace({places:[{latitude:'bad',longitude:'-78'}]}));});
test('radius and watchlist filters operate on existing results without source changes',()=>{const store={id:'1',distance:15,signals:[signal,{...signal,id:'s2',bottle:{name:'Other'}}]} as NearbyStore;assert.equal(nearbyVisible([store],10,false,[]).length,0);assert.equal(nearbyVisible([store],25,true,['eagle rare 10 year'])[0].signals.length,1);assert.equal(store.signals.length,2);assert.match(storeMapUrl({address:'1 Main & 2nd',city:'Raleigh',state:'NC'},true),/destination=1%20Main%20%26%202nd/);});

import { filterNearbyFeedDrops, withNearbyFeedScope, nearbyFeedPageLimit } from '../src/lib/nearby-feed-scope.ts';
import { writeSourceConsumptionTrace } from '../src/lib/source-consumption-trace.ts';
test('geographic selection precedes pagination even with thousands of newer national reports', async () => {
 const local={id:'local',state:'NC',store_address:'123 Main Street',store_city:'Raleigh'};
 const national=Array.from({length:5000},(_,i)=>({...local,id:String(i),state:'AZ'}));
 const rows=[...national,local];
 const result=await withNearbyFeedScope(nearbyStoreIndex([raw]),{latitude:35.78,longitude:-78.64},25,async()=>{await Promise.resolve();return filterNearbyFeedDrops(rows).slice(0,100);});
 assert.deepEqual(result,[local]);assert.equal(filterNearbyFeedDrops(rows),rows);
});
test('concurrent map origins never narrow each other or an ordinary feed',async()=>{
 const rows=[{id:'local',state:'NC',store_address:'123 Main St',store_city:'Raleigh'}];
 const index=nearbyStoreIndex([raw]);
 const results=await Promise.all([withNearbyFeedScope(index,{latitude:35.78,longitude:-78.64},25,async()=>{await new Promise(r=>setTimeout(r,10));return filterNearbyFeedDrops(rows);}),withNearbyFeedScope(index,{latitude:33,longitude:-112},25,async()=>filterNearbyFeedDrops(rows))]);
 assert.equal(results[0].length,1);assert.equal(results[1].length,0);assert.equal(filterNearbyFeedDrops(rows),rows);
});
test('reviewed Gilbert coordinates bind exact identity and premise, never a changed address',()=>{
 const premise={id:'safeway:1534',name:'Safeway #1534',address:'90 S Val Vista Dr, Gilbert, AZ 85296',city:'Gilbert',state:'AZ',lat:0,lng:0};
 const index=nearbyStoreIndex([premise]);assert.equal(index.size,1);assert.ok([...index.values()][0].lat!>33);
 assert.equal(nearbyStoreIndex([{...premise,address:'92 S Val Vista Dr'}]).size,0);
 assert.equal(nearbyStoreIndex([{...premise,id:'different'}]).size,0);
});
test('feed consumption telemetry uses one database round trip with exact provider counts',async()=>{
 const calls:Array<{query:string,params:unknown[]}>=[];
 const executor=()=>({query:async(query:string,params:unknown[])=>{calls.push({query,params});}});
 await writeSourceConsumptionTrace(executor,Array.from({length:1000},(_,i)=>({sourcePollId:'provider-'+(i%100)})),'feed_read','','2026-11-05T00:00:00Z');
 assert.equal(calls.length,1);const counts=JSON.parse(calls[0].params[0] as string);assert.equal(counts.length,100);assert.ok(counts.every((c:{row_count:number})=>c.row_count===10));
 await writeSourceConsumptionTrace(executor,[],'feed_read','','now');assert.equal(calls.length,1);
 await writeSourceConsumptionTrace(()=>({query:async()=>{throw Error('offline')}}),[{sourcePollId:'a'}],'feed_read','','now');
});

import { resolveDropLimit } from '../src/lib/drop-feed-policy.ts';
test('larger internal map reads never raise ordinary API limits or free preview limits',()=>{
 assert.equal(nearbyFeedPageLimit(100),100);
 assert.equal(resolveDropLimit('9999',false,7),500);
 withNearbyFeedScope(nearbyStoreIndex([raw]),{latitude:35.78,longitude:-78.64},25,()=>{
  assert.equal(nearbyFeedPageLimit(100),10000);
  assert.equal(resolveDropLimit('9999',false,7,nearbyFeedPageLimit(500)),9999);
  assert.equal(resolveDropLimit('9999',true,7,nearbyFeedPageLimit(500)),7);
 });
 assert.equal(nearbyFeedPageLimit(100),100);
});

import { createAsyncPreparedDropCache } from '../src/lib/prepared-drop-cache.ts';
test('longer immutable reuse skips degraded results and switches immediately with snapshot identity',async()=>{
 let now=0,calls=0;const cache=createAsyncPreparedDropCache<{ok:boolean}>(300000,()=>now,value=>value.ok);
 const build=async()=>{calls++;return {ok:true}};
 await cache.get('snapshot-a',build);now=60000;assert.equal((await cache.get('snapshot-a',build)).hit,true);assert.equal(calls,1);
 await cache.get('snapshot-b',build);assert.equal(calls,2);
 assert.equal((await cache.get('degraded',async()=>({ok:false}))).hit,false);
 assert.equal((await cache.get('degraded',build)).hit,false);assert.equal(calls,3);
 now=400000;assert.equal((await cache.get('snapshot-b',build)).hit,false);
});
import reviewedCoordinates from '../src/data/reviewed-store-coordinates.json';
import { unlocatedNearbySignals } from '../src/lib/nearby.ts';
import { nearbySearchCities } from '../src/lib/nearby-feed-scope.ts';

test('reviewed nationwide coordinates bind each original premise and mark interpolated pins',()=>{
 const states=new Set<string>();
 for(const proof of reviewedCoordinates.stores){
  const row={...proof,lat:0,lng:0,locationType:'store'};
  const index=nearbyStoreIndex([row]);assert.equal(index.size,1,proof.id);
  assert.equal(nearbyStoreIndex([{...row,address:'999999 Different Road'}]).size,0,proof.id);
  assert.match(proof.sourceSha256,/^[a-f0-9]{64}$/);states.add(proof.state);
  const found=new Map<string,NearbyStore>();const report={...signal,location:{scope:'exact_store',store:proof}} as Signal;
  addNearbySignals([report],index,{latitude:proof.lat,longitude:proof.lng},10,found);
  assert.equal(found.size,1);assert.equal([...found.values()][0].approximateLocation,'coordinateMethod' in proof && proof.coordinateMethod==='address_interpolation');
 }
 assert.ok(states.size>=15);
});

test('legacy exact-premise classifications are mapped without promoting broad boards',()=>{
 assert.equal(nearbyStoreIndex([{...raw,locationType:'county_board',precision:'store_equivalent_shipment'}]).size,1);
 assert.equal(nearbyStoreIndex([{...raw,locationType:'county_board',precision:'distillery',name:'Distillery Gift Shop'}]).size,1);
 assert.equal(nearbyStoreIndex([{...raw,locationType:'county_board',precision:'board_county'}]).size,0);
 assert.equal(nearbyStoreIndex([{...raw,locationType:'county_board',precision:'distillery',name:'Statewide distillery releases'}]).size,0);
});

test('same-city unlocated reports stay separate and never become out-of-radius pins',()=>{
 const far={...raw,id:'far',address:'99 Far Road',lat:36.5};
 const index=nearbyStoreIndex([raw,far]);const origin={latitude:35.78,longitude:-78.64};
 const drops=[
  {id:'mapped',state:'NC',store_address:raw.address,store_city:'Raleigh'},
  {id:'unlocated',state:'NC',store_address:'555 Unknown Road',store_city:'Raleigh'},
  {id:'far',state:'NC',store_address:far.address,store_city:'Raleigh'},
  {id:'other-city',state:'NC',store_address:'555 Unknown Road',store_city:'Durham'},
  {id:'other-state',state:'AZ',store_address:'555 Unknown Road',store_city:'Raleigh'},
 ];
 withNearbyFeedScope(index,origin,10,()=>assert.deepEqual(filterNearbyFeedDrops(drops).map(d=>d.id),['mapped','unlocated']));
 const reports=drops.map(d=>({...signal,id:d.id,location:{scope:'exact_store',store:{state:d.state,city:d.store_city,address:d.store_address}}})) as Signal[];
 const cities=nearbySearchCities(index,origin,10);
 const unknown=unlocatedNearbySignals(reports,index,cities);assert.deepEqual(unknown.map(s=>s.id),['unlocated']);
 const found=new Map<string,NearbyStore>();addNearbySignals(unknown,index,origin,10,found);assert.equal(found.size,0);
});

test('manual cities surface unlocated local reports when no store has a coordinate yet',()=>{
 const rows=[{id:'local',state:'MO',store_city:'Saint Louis',store_address:'111 Test Road'},{id:'elsewhere',state:'IL',store_city:'Saint Louis',store_address:'111 Test Road'}];
 const index=nearbyStoreIndex([]);const place={state:'MO',city:'St. Louis'};
 withNearbyFeedScope(index,{latitude:38.6,longitude:-90.2},25,()=>assert.deepEqual(filterNearbyFeedDrops(rows).map(r=>r.id),['local']),place);
 withNearbyFeedScope(index,{latitude:38.6,longitude:-90.2},25,()=>assert.deepEqual(filterNearbyFeedDrops(rows),[]));
});

import { createHash } from 'node:crypto';
import coordinateEvidence from './fixtures/nearby-coordinate-evidence-20261105.json';
test('every added address pin retains its matching geocoder evidence and approximate precision',()=>{
 for(const proof of reviewedCoordinates.stores){
  if(!('coordinateMethod' in proof))continue;
  assert.equal(proof.coordinateMethod,'address_interpolation');
  const row=(coordinateEvidence.records as Record<string,string[]>)[proof.sourceSha256];assert.ok(row,proof.id);
  assert.equal(createHash('sha256').update(JSON.stringify(row)).digest('hex'),proof.sourceSha256);
  const [lng,lat]=row[5].split(',').map(Number);assert.equal(proof.lat,lat);assert.equal(proof.lng,lng);
  assert.equal(row[2],'Match');assert.equal(row[4],proof.matchedAddress);
  assert.equal(row[4].split(',').at(-2)?.trim(),proof.state);
 }
});
