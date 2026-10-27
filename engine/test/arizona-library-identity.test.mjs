import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {BourbonBible} from '../src/core/bible.mjs';
import {arizonaXapiLibraryIdentity} from '../src/collectors/arizona-xapi-library-identity.mjs';
import {parseArizonaXapiInventory} from '../src/collectors/arizona-xapi.mjs';
import {canonicalizeSignal} from '../src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../src/export-site-contract.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-26-library-identity.json',import.meta.url),'utf8'));
const bible=await BourbonBible.load(new URL('../out/bourbon-bible.json',import.meta.url));
const depth=JSON.parse(await readFile(new URL('./fixtures/arizona-xapi/2026-10-26-library-depth.json',import.meta.url),'utf8'));

test('live full-expression captures recover library depth while contradictory and incomplete identities remain excluded',()=>{
  assert(depth.captures.length>=10);
  for(const {product,store,observedAt,canonicalName} of depth.captures){
    const signals=parseArizonaXapiInventory({response:{docs:[product]}},store,bible,{observedAt});
    assert.equal(signals.length,1,product.name);assert.equal(signals[0].canonicalName,canonicalName);
    for(const patch of [{name:product.name+' Mystery Finish'},{containsAlcohol:false},{storeId:'9999'},{dispItemPackageQty:2}]) {
      assert.equal(arizonaXapiLibraryIdentity({...product,...patch},bible,{storeId:store.locationId}).record,null,product.name+JSON.stringify(patch));
    }
    for(const channelInventory of [{instore:'0',instoreItemQty:10},{instore:'1',instoreItemQty:0}]) assert.equal(parseArizonaXapiInventory({response:{docs:[{...product,channelInventory}]}},store,bible,{observedAt}).length,0);
  }
  for(const {product,store} of depth.excluded) assert.equal(arizonaXapiLibraryIdentity(product,bible,{storeId:store.locationId}).record,null,product.name);
});

test('captured positive Eagle Rare stock survives the complete public projection with its original premise and SKU',t=>{
  for(const {product,store,observedAt} of fixture.captures){
    t.mock.timers.enable({apis:['Date'],now:Date.parse(observedAt)+60000});
    const signals=parseArizonaXapiInventory({response:{docs:[product]}},store,bible,{observedAt});
    assert.equal(signals.length,1);assert.equal(signals[0].canonicalName,'Eagle Rare 10 Year');
    assert.equal(signals[0].sourceBottleMatchMethod,'exact-arizona-library-identity');
    const op=signals.map(s=>canonicalizeSignal(s,bible));
    const drops=buildDrops(op,bibleLookup(bible.records),op).filter(isPublicDropFeedEligible);
    assert.equal(drops.length,1);assert.equal(drops[0].storeId,`safeway:${store.locationId}`);
    assert.equal(drops[0].productId,product.id);assert.equal(drops[0].price,product.price);
    t.mock.timers.reset();
  }
});

test('new title matching rejects contradictory strength, package, premise and expression evidence',()=>{
  const {product,store}=fixture.captures[0];
  const match=p=>arizonaXapiLibraryIdentity(p,bible,{storeId:store.locationId});
  assert.equal(match(product).record.canonical,'Eagle Rare 10 Year');
  for (const age of ['12 Year','17 Year']) assert.notEqual(match({...product,name:product.name.replace('10 Year',age)}).record?.canonical,'Eagle Rare 10 Year');
  for(const patch of [{pid:'1'},{upc:'invalid'},{storeId:'9999'},{containsAlcohol:false},{alcoholVolumePct:50},
    {dispItemSizeQty:700},{dispItemPackageQty:2},{unitOfMeasure:'l'},
    ...['10 Year Single Barrel','10 Year Barrel Proof','10 Year Finished Rye'].map(age=>({name:product.name.replace('10 Year',age)})),
    {name:product.name.replace('90 Proof','100 Proof')},{name:product.name+' Mystery Finish'}]){
    assert.equal(match({...product,...patch}).record,null,JSON.stringify(patch));
  }
});

test('the source adapter supports a new library expression without a SKU whitelist and rejects alias collisions',()=>{
  const product={...fixture.captures[0].product,name:'Invented Valley 14 Year Toasted Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml',alcoholVolumePct:50};
  const record={id:'future-library-bottle',canonical:'Invented Valley 14 Year Toasted Bourbon',libraryIdentities:[{canonicalName:'Invented Valley 14 Year Toasted Bourbon',aliases:[]}]};
  const b={records:[record]};
  assert.equal(arizonaXapiLibraryIdentity(product,b,{storeId:product.storeId}).record,record);
  assert.equal(arizonaXapiLibraryIdentity({...product,name:product.name.replace('Toasted','Port Finished')},b,{storeId:product.storeId}).record,null);
  const ambiguous={records:[record,{...record,id:'other',canonical:'Invented Valley 14 Year Toasted Whiskey',libraryIdentities:[{canonicalName:'Invented Valley 14 Year Toasted Whiskey',aliases:[]}]}]};
  assert.equal(arizonaXapiLibraryIdentity(product,ambiguous,{storeId:product.storeId}).record,null);
});
