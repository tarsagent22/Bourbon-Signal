import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeDirectoryPremise, reconcilePremisesDirectory} from '../src/discovery/premises-directory-reconciliation.mjs';

const candidate={sourceId:'ca:public-shop',storeId:'shop:100',name:'Public Shop',address:'120 South Mollison Avenue 100 El Cajon CA 92020',city:'El Cajon',state:'CA',zip:'92020'};
const directoryRow={id:'license:1',name:'Public Shop',address:'120 S Mollison Ave, # 100',city:'EL CAJON',state:'CA',zip:'92020-4895',source:'Public license directory',sourceUrl:'https://official.example/list?token=SECRET'};
const compare=(row=directoryRow,c=candidate)=>reconcilePremisesDirectory([c],[row]).results[0];

test('full physical identities preserve units and normalize abbreviations/ZIP+4',()=>{
  const result=compare(); assert.equal(result.counts.exactPhysicalMatches,1);
  assert.equal(result.matches[0].normalized.unit,'100'); assert.equal(result.matches[0].normalized.zip,'92020');
  assert.ok(result.matches[0].reviewReasons.includes('implicit_unit_number_requires_review'));
  assert.equal(result.matches[0].sourceUrl,'https://official.example/list');
  const b=normalizeDirectoryPremise({address:'1700 W GLENOAKS BLVD, UNIT #B',city:'Glendale',state:'CA',zip:'91201'});
  assert.equal(b.unit,'b');assert.equal(b.street,'1700 w glenoaks blvd');assert.equal(b.usable,true);
});

test('conflicting/missing units, ZIP, city and declared address state stay ambiguous',()=>{
  for(const changed of [{address:'120 S Mollison Ave Unit 200'},{address:'120 S Mollison Ave'},{zip:'92101'},{city:'Other City'},
    {address:'120 S Mollison Ave Unit 100 El Cajon TX 92020'},{zip:'bad'}]){
    const result=compare({...directoryRow,...changed});assert.equal(result.counts.exactPhysicalMatches,0);assert.equal(result.counts.ambiguousPhysicalMatches,1);
  }
  assert.equal(compare({...directoryRow,state:'TX',address:'120 S Mollison Ave #100'}).counts.totalMatches,0);
  assert.notEqual(normalizeDirectoryPremise({...candidate,address:'120 S Mollison Ave Unit A-1'}).key,
    normalizeDirectoryPremise({...candidate,address:'120 S Mollison Ave Unit A1'}).key);
});

test('apartment/suite designator difference stays physically ambiguous and licensed names are preserved',()=>{
  const c={name:'Merchant Name',address:'411 Brazos Street Suite 100 Austin TX 78701',city:'Austin',state:'TX',zip:'78701'};
  const r={id:'permit:100',name:'Different Legal LLC',address:'411 BRAZOS ST APT 100',city:'Austin',state:'TX',zip:'78701'};
  const result=compare(r,c),m=result.matches[0];assert.equal(m.category,'ambiguous_physical_address');
  assert.equal(result.counts.exactPhysicalMatches,0);assert.equal(result.counts.ambiguousPhysicalMatches,1);
  assert.deepEqual(m.reviewReasons,['licensed_name_differs_from_merchant_name']);
  assert.ok(m.reasons.includes('apartment_vs_other_unit_designator_requires_review'));
  assert.equal(m.merchantIdentity,'not_established_by_directory_match');
});

test('meaningful house-number hyphens survive keys and differing numeric punctuation stays ambiguous',()=>{
  for(const [hyphenated,spaced] of [['138-44 101st Avenue','138 44 101st Avenue'],['12-14 Main Street','12 14 Main Street']]){
    const c={name:'Public Shop',address:hyphenated,city:'Jamaica',state:'NY',zip:'11435'};
    const r={id:'license:ny',name:'Public Shop',address:spaced,city:'Jamaica',state:'NY',zip:'11435'};
    assert.notEqual(normalizeDirectoryPremise(c).key,normalizeDirectoryPremise(r).key);
    for(const [target,row] of [[c,r],[{...c,address:spaced},{...r,address:hyphenated}]]){
      const result=compare(row,target);assert.equal(result.counts.exactPhysicalMatches,0);assert.equal(result.counts.ambiguousPhysicalMatches,1);
      assert.ok(result.matches[0].reasons.includes('street_numeric_punctuation_differs'));
    }
    assert.equal(compare({...r,address:hyphenated},c).counts.exactPhysicalMatches,1);
  }
});

test('duplicate candidates reject and duplicate directory identities stay ambiguous',()=>{
  assert.throws(()=>reconcilePremisesDirectory([candidate,{...candidate,storeId:'different'}],[directoryRow]),/Duplicate candidate/);
  const dup=reconcilePremisesDirectory([candidate],[directoryRow,{...directoryRow,id:'license:2'}]).results[0];
  assert.equal(dup.counts.exactPhysicalMatches,0);assert.equal(dup.counts.ambiguousPhysicalMatches,2);
  assert.ok(dup.matches.every(m=>m.reasons.includes('duplicate_directory_physical_premise')));
  assert.ok(reconcilePremisesDirectory([candidate],[directoryRow,{...directoryRow,address:'999 Other Street'}]).results[0].matches[0].reasons.includes('duplicate_directory_id'));
});

test('input and output bounds fail closed or disclose limited matches',()=>{
  assert.throws(()=>reconcilePremisesDirectory(Array(26).fill(candidate),[]),/bounds/);
  assert.throws(()=>reconcilePremisesDirectory([],Array(100001).fill(directoryRow)),/bounds/);
  assert.throws(()=>reconcilePremisesDirectory([{...candidate,zip:'',address:'120 S Mollison Ave'}],[]),/Complete candidate/);
  assert.throws(()=>reconcilePremisesDirectory([{...candidate,state:'ZZ'}],[]),/Complete candidate/);
  const result=reconcilePremisesDirectory([candidate],Array.from({length:101},(_,i)=>({...directoryRow,id:`license:${i}`}))).results[0];
  assert.equal(result.matches.length,100);assert.equal(result.matchesTruncated,true);assert.equal(result.counts.totalMatches,101);
  assert.equal(reconcilePremisesDirectory([candidate],[null,{}]).inputCounts.incompleteDirectoryRows,2);
});

test('unmatched directory is context only and untrusted copied stock/customer fields are never projected',()=>{
  const r={...directoryRow,email:'SECRET',user_id:'SECRET',payload:{private:'SECRET'},current:true,inventoryObserved:true,newPhysicalStoreProven:true};
  const result=reconcilePremisesDirectory([candidate],[r]),serialized=JSON.stringify(result);
  for(const forbidden of ['SECRET','inventoryObserved','newPhysicalStoreProven','"current"','"payload"','"email"','user_id'])assert.equal(serialized.includes(forbidden),false);
  assert.equal(reconcilePremisesDirectory([candidate],[]).results[0].result,'no_match_in_supplied_directory');
  assert.equal(compare({...directoryRow,sourceUrl:'https://user:password@official.example/'}).matches[0].sourceUrl,null);
});

test('real five V2 premises reconcile offline against all 38,095 saved directory rows',async()=>{
  const registry=JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-cohort-v2.json',import.meta.url),'utf8'));
  const raw=await readFile(new URL('../../src/data/sighting-store-directory.generated.json',import.meta.url));
  const directory=JSON.parse(raw),reviewRaw=await readFile(new URL('../../docs/operations/remedy-glendale-premise-alias-review-20261023.json',import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),'ef594f72535e3a42f968d7d1649f0bbad78938c55e06389a54eb00779a26f1c9');
  assert.equal(createHash('sha256').update(reviewRaw).digest('hex'),'6655129bd2e98be11124ca6e2587e1ad3bf915154ae0e55c6b762102cf0a652a');
  const review=JSON.parse(reviewRaw);assert.equal(directory.stores.length,38095);
  const candidates=registry.sources.map(s=>{const store=s.stores[0];return {...store,sourceId:s.runtimeId,storeId:store.id,state:s.state,
    literalAddress:store.address,address:s.runtimeId===review.sourceId&&store.id===review.storeId?review.canonicalPremise.address:store.address};});
  const result=reconcilePremisesDirectory(candidates,directory.stores);assert.equal(result.results.length,5);
  assert.equal(result.results.reduce((n,r)=>n+r.counts.exactPhysicalMatches,0),4);
  assert.equal(result.results.reduce((n,r)=>n+r.counts.ambiguousPhysicalMatches,0),1);
  assert.deepEqual(result.results.map(r=>r.matches[0].directoryId),['ca-abc-00512898','ny-sla-0100-22-115836','ca-abc-00635911','tx-tabc-104949013','ca-abc-00488625']);
  const main=result.results.find(r=>r.candidate.sourceId==='ca:main-street-el-cajon');
  assert.equal(main.matches[0].licensedName,'MURPHY CANYON GAS & WASH INC');assert.ok(main.matches[0].reviewReasons.includes('licensed_name_differs_from_merchant_name'));
  const hotSpot=result.results.find(r=>r.candidate.sourceId==='tx:hot-spot-austin');
  assert.equal(hotSpot.counts.exactPhysicalMatches,0);assert.equal(hotSpot.counts.ambiguousPhysicalMatches,1);
  assert.ok(hotSpot.matches[0].reasons.includes('apartment_vs_other_unit_designator_requires_review'));
  const noAlias=reconcilePremisesDirectory([{...candidates[0],address:candidates[0].literalAddress}],directory.stores).results[0];
  assert.equal(noAlias.counts.exactPhysicalMatches,0);assert.equal(noAlias.counts.ambiguousPhysicalMatches,1);
});
