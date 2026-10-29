import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{BourbonBible}from'../src/core/bible.mjs';
import{CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory,centralCityHiveLibraryTier,centralCityHiveRecordMarketTier}from'../src/collectors/central-cityhive-expansion.mjs';
import{canonicalizeSignal}from'../src/operational-report.mjs';
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const fixture=JSON.parse(await readFile(new URL('./fixtures/central-cityhive/yucatan-liquor-okc.json',import.meta.url),'utf8'));
const source=CENTRAL_CITYHIVE_EXPANSION_SOURCES.find(s=>s.id===fixture.sourceId);
const rows=parseCentralCityHiveInventory(`<script>JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(fixture))}"))</script>`,source,bible,{observedAt:fixture.captures[0].capturedAt});

test('verified Larceny barrel-proof stock uses current unique library tier through operation',()=>{
 const row=rows.find(r=>r.canonicalName==='Larceny Barrel Proof');assert.ok(row);
 assert.equal(bible.match('Larceny Barrel Proof').record.tier,'standard');
 assert.equal(row.tier,'limited');assert.equal(centralCityHiveLibraryTier(row,bible),'limited');
 assert.equal(canonicalizeSignal(row,bible).tier,'limited');
 assert.equal(centralCityHiveRecordMarketTier(bible.match('Larceny Barrel Proof').record,'AL'),'allocated');
});

test('library regular and disabled expressions never gain an alert tier from legacy seeds',()=>{
 for(const name of ['Buffalo Trace Bourbon','Green River Full Proof Bourbon','Elijah Craig Toasted Barrel'])assert.equal(centralCityHiveRecordMarketTier(bible.match(name).record,'TX'),'standard');
 const record=structuredClone(bible.match('Larceny Barrel Proof').record);record.libraryIdentities[0].isAlertEligible=false;
 assert.equal(centralCityHiveRecordMarketTier(record,'OK'),'standard');
 record.libraryIdentities[0].isAlertEligible=true;record.libraryIdentities.push({...record.libraryIdentities[0],id:'conflicting-library-identity'});
 assert.equal(centralCityHiveRecordMarketTier(record,'OK'),null);
});

test('tier override requires exact source/store/product/variant/identity proof',()=>{
 const row=rows.find(r=>r.canonicalName==='Larceny Barrel Proof');
 for(const patch of [{merchantId:'wrong'},{storeAddress:'wrong'},{sourceUrl:'https://attacker.invalid/x'},{sourceProductBinding:null},{quantity:1},
  {sourceProductBinding:{...row.sourceProductBinding,canonicalBottleId:'another-expression'}},
  {sourceProductBinding:{...row.sourceProductBinding,identityName:'Elijah Craig Barrel Proof'}},
 ])assert.equal(centralCityHiveLibraryTier({...row,...patch},bible),null);
});
