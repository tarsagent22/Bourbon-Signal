import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../src/core/bible.mjs';
import {CALIFORNIA_GROCERY_SOURCES} from '../src/collectors/california-grocery-premises.mjs';
import {collectGroceryExpansion,isGroceryExpansionEmptyResolver,CALIFORNIA_CONFIRMED_EMPTY_RESOLVER_ZIPS} from '../src/collectors/grocery-xapi-expansion.mjs';
const bytes=await readFile(new URL('./fixtures/california-resolver-empty/96101-20261106.json',import.meta.url));
const captured=JSON.parse(bytes);
test('hash-verified first-party CA96101 no-store channel is healthy zero without proving inventory',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'2edf6ee5a9ba886ef52f743b43f409561e1c04e06cdd6b2d0cd1d1e590720ae6');
 assert.deepEqual(CALIFORNIA_CONFIRMED_EMPTY_RESOLVER_ZIPS,['96101']);
 assert.equal(isGroceryExpansionEmptyResolver(captured,'CA','96101'),true);
 assert.equal(captured.instore.count,0);assert.equal(Object.hasOwn(captured.instore,'stores'),false);
 assert.equal(isGroceryExpansionEmptyResolver(captured,'IL'),true); // Existing exact IL behavior is unchanged.
});
test('unreviewed states, ZIPs and missing scope cannot classify a malformed resolver as healthy',()=>{
 for(const [state,zip]of [['CA','91006'],['CA','90001'],['CA',undefined],['CA',96101],['CA','96101 '],['WA','96101'],['NV','96101'],['NM','96101'],['ca','96101']])assert.equal(isGroceryExpansionEmptyResolver(captured,state,zip),false);
});
test('changed counts, errors, statuses, messages, stores or extra schema fields remain failures',()=>{
 for(const mutate of [
  p=>p.instore.count=1,p=>p.instore.count='0',p=>p.instore.ack='0',p=>p.instore.ack=1,
  p=>p.instore.errors[0].code='SR-9999',p=>p.instore.errors[0].statusCode=503,p=>p.instore.errors[0].message='Rate limited',
  p=>p.instore.errors.push({...p.instore.errors[0]}),p=>p.instore.errors=[],p=>p.instore.errors[0].retry=true,
  p=>p.instore.stores=[],p=>p.instore.stores=[{locationId:'invented'}],p=>p.instore.unknown=true,p=>delete p.instore.ack,
 ]){const changed=structuredClone(captured);mutate(changed);assert.equal(isGroceryExpansionEmptyResolver(changed,'CA','96101'),false);}
});
test('healthy-zero ZIP never supplies a store binding and cannot mask a missing selected premise',async()=>{
 const cursorDir=await mkdtemp(path.join(tmpdir(),'ca-empty-resolver-'));
 const bible=new BourbonBible([]),premises=CALIFORNIA_GROCERY_SOURCES.map(source=>({locationId:source.merchantId,polarisBannerName:source.banner,domainName:source.resolverDomainName||source.banner,address:{line1:source.address.slice(0,-`, ${source.city}, CA ${source.zip}`.length),city:source.city,state:'CA',country:'US',zipcode:source.zip}}));
 try{
  for(const missing of [false,true]){
   const result=await collectGroceryExpansion({id:'CA'},bible,{cursorDir,sleep:async()=>{},fetchText:async url=>({ok:true,status:200,text:JSON.stringify(url.includes('storeresolver')?new URL(url).searchParams.get('zipcode')==='96101'?captured:{instore:{stores:missing?premises.slice(1):premises}}:{response:{docs:[]}})})});
   assert.ok(result.metadata.resolverEmptyZips.includes('96101'));assert.deepEqual(result.metadata.resolverFailures,[]);
   assert.equal(result.metadata.verifiedPremises.length,CALIFORNIA_GROCERY_SOURCES.length-(missing?1:0));assert.equal(result.metadata.complete,!missing);
   assert.equal(result.signals.length,0);
  }
 }finally{await rm(cursorDir,{recursive:true,force:true});}
});
