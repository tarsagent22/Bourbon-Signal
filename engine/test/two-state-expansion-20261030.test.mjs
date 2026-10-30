import test from 'node:test';
import assert from 'node:assert/strict';
import {ARIZONA_XAPI_DEFAULT_STORES,ARIZONA_XAPI_SEARCH_LIMIT,ARIZONA_XAPI_PRIORITY_TERMS,addArizonaPriorityQueries,arizonaXapiLibraryQueryAssignments,isArizonaXapiStore} from '../src/collectors/arizona-xapi.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {GROCERY_EXPANSION_REQUEST_LIMITS,CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT} from '../src/collectors/grocery-xapi-expansion.mjs';
import {WESTERN_GROCERY_RESOLVER_ZIPS} from '../src/collectors/western-grocery-premises.mjs';

test('each Arizona premise receives all eight priority searches in four passes without losing any library query',()=>{
  const pairs=new Set();
  const plan=Array.from({length:ARIZONA_XAPI_DEFAULT_STORES},(_,i)=>({store:{locationId:String(i)},terms:['bourbon','whiskey',...(i<48?[`library-${i}`]:[])]}));
  for(let invocation=0;invocation<4;invocation++){
    const expanded=addArizonaPriorityQueries(plan,invocation);
    assert.ok(expanded.flatMap(row=>row.terms).length<=ARIZONA_XAPI_SEARCH_LIMIT);
    for(const row of expanded){if(Number(row.store.locationId)<48)assert.ok(row.terms.includes(`library-${row.store.locationId}`));assert.equal(row.priorityTerms.length,2);for(const term of row.priorityTerms)pairs.add(`${row.store.locationId}|${term}`);}
  }
  assert.equal(pairs.size,ARIZONA_XAPI_DEFAULT_STORES*ARIZONA_XAPI_PRIORITY_TERMS.length);
  for(const invocation of [-1,NaN,1.5])assert.throws(()=>addArizonaPriorityQueries(plan,invocation));
});

test('California request ceiling contains every resolver, two searches per premise, eight library searches and eight transient retries',()=>{
  assert.equal(CALIFORNIA_GROCERY_SOURCES.length,433);
  assert.equal(CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT,8);
  assert.equal(GROCERY_EXPANSION_REQUEST_LIMITS.CA,WESTERN_GROCERY_RESOLVER_ZIPS.CA.length+CALIFORNIA_GROCERY_SOURCES.length*2+8+CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT);
  assert.equal(GROCERY_EXPANSION_REQUEST_LIMITS.WA,127);
  assert.equal(GROCERY_EXPANSION_REQUEST_LIMITS.NM,43);
  assert.ok(CALIFORNIA_GROCERY_SOURCES.every(s=>s.lat>32&&s.lat<43&&s.lng> -125&&s.lng< -114&&new URL(s.premiseUrl).protocol==='https:'));
});

test('library assignment stays exhaustive for the larger California cohort and rejects an unbounded caller',()=>{
  const storeCount=433,poolSize=350,batchSize=8,pairs=new Set();
  for(let invocation=0;invocation<Math.ceil(storeCount*poolSize/batchSize);invocation++){
    const terms=Array.from({length:batchSize},(_,i)=>`term-${(invocation*batchSize+i)%poolSize}`);
    for(const assignment of arizonaXapiLibraryQueryAssignments(storeCount,{maximumStores:433,terms,poolSize,invocation}))pairs.add(`${assignment.storeIndex}|${assignment.term}`);
  }
  assert.equal(pairs.size,storeCount*poolSize);
  assert.throws(()=>arizonaXapiLibraryQueryAssignments(storeCount,{maximumStores:501,terms:['x'],poolSize,invocation:0}));
});

test('the reviewed one-digit Arizona merchant still requires exact banner and current physical premise',()=>{
  const store={locationId:'4',polarisBannerName:'albertsons',domainName:'Albertsons',address:{line1:'3130 W Carefree Hwy',city:'Phoenix',state:'AZ',country:'US',zipcode:'85086'}};
  assert.equal(isArizonaXapiStore(store),true);
  for(const patch of [{locationId:''},{locationId:'wrong'},{polarisBannerName:'vons'},{address:{...store.address,state:'CA'}}])assert.equal(isArizonaXapiStore({...store,...patch}),false);
});
