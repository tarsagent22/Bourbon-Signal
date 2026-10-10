import assert from "node:assert/strict";
import test from "node:test";
import { rankBottleMatches } from "../shared/admin-bottle-matches";
import { validateBottleDraft } from "../shared/owner-admin";
import { validateBottleSubmissionResearch } from "../shared/bottle-submission-research";
import { validateReviewedBottleArtwork } from "../shared/bottle-artwork";
import { buildSightingRarityCatalog, sightingBottleRarity } from "../src/lib/sighting-bottle-rarity";
import { normalizeMemberSightingSignal } from "../src/lib/signals/signal-contract";
const now = Date.parse("2026-10-10T12:00:00Z");
const bottle:any = {id:"exact",canonicalName:"Example",brand:"Example",category:"bourbon",availability:"allocated",nationalTier:"allocated",nationalConfidence:"high",aliases:[],stateOverrides:[]};
const sighting:any = {id:"post",bottleId:"exact",bottleName:"Example",storeCity:"Boone",storeState:"NC",storeId:"abc",storeName:"ABC",createdAt:"2026-10-09T12:00:00Z",source:"custom"};
test("rarity can remain pending without pretending the bottle is common or limited",()=>{
  assert.equal(validateBottleDraft({...bottle,rarityPending:true}).rarityPending,true);
  assert.equal(validateBottleDraft({...bottle,rarityPending:true}).nationalConfidence,"low");
  assert.equal(validateBottleDraft({...bottle,rarityPending:false}).nationalConfidence,"high");
  assert.equal(sightingBottleRarity(sighting,{...bottle,rarityPending:true},now).nationalLabel,"Rarity pending");
  assert.equal(sightingBottleRarity({...sighting,reviewState:{needsBottleReview:true}},bottle,now).pending,false,"an exact catalog match can supply rarity without changing the post review workflow");
  const result = normalizeMemberSightingSignal({...sighting,bottleId:undefined,rarityTier:"unicorn",reviewState:{needsBottleReview:true}});
  assert.equal(result.bottle.rarityPending,true,"manual rarity cannot masquerade as confirmed catalog rarity");
});
test("local scarcity follows the sighting area and only fresh supported evidence",()=>{
  const stateOverride = {jurisdiction:"NC",tier:"allocated",confidence:"high",reason:"Official allocation",officialAllocationStatus:"state_allocated",verifiedOpportunityCount:0,coverageDenominator:0,evidenceWindow:{start:"2026-10-01",end:"2026-10-09"},sourceIds:["official-list"],lastReviewedAt:"2026-10-09"};
  const local = {...bottle,stateOverrides:[stateOverride]};
  const result = sightingBottleRarity(sighting,local,now);
  assert.equal(result.areaLabel,"Boone, NC");assert.equal(result.localLabel,"Allocated in NC");
  assert.equal(sightingBottleRarity({...sighting,storeState:"KY"},local,now).localEstablished,false);
  assert.equal(sightingBottleRarity({...sighting,sightingType:"online_social"},local,now).localEstablished,false);
  assert.equal(sightingBottleRarity(sighting,{...local,stateOverrides:[{...stateOverride,evidenceWindow:{start:"2025-01-01",end:"2025-02-01"}}]},now).localEstablished,false);
  assert.equal(sightingBottleRarity(sighting,bottle,now).localLabel,"Limited local data");
});
test("matching ranks relevant exact identities and does not dump an alphabetical catalog",()=>{
  const bottles=[{canonicalName:"A random bottle",aliases:[]},{canonicalName:"High West The Prisoner's Share",aliases:["Prisoner's share"]},{canonicalName:"High West Bourbon",aliases:[]}];
  assert.deepEqual(rankBottleMatches(bottles,""),[]);
  assert.equal(rankBottleMatches(bottles,"Prisoner’s share")[0].canonicalName,bottles[1].canonicalName);
  assert.equal(rankBottleMatches(bottles,"no matching whiskey").length,0);
});
test("research requires sources and low confidence leaves rarity pending",()=>{
  const r={canonicalName:"Exact bottle",brand:"Exact",category:"bourbon",availability:"unicorn",confidence:"low",summary:"Edition unclear",researchedAt:new Date(now).toISOString(),sources:[{title:"Producer",url:"https://example.com/bottle"}]};
  assert.equal(validateBottleSubmissionResearch(r).availability,null);
  assert.throws(()=>validateBottleSubmissionResearch({...r,sources:[]}));
  assert.throws(()=>validateBottleSubmissionResearch({...r,sources:[{title:"Bad",url:"javascript:alert(1)"}]}));
});
test("public art only accepts inspected original asset metadata, never private member photos",()=>{
  const art={url:"https://test.public.blob.vercel-storage.com/bottle-artwork/art.png",sha256:"a".repeat(64),reviewedAt:new Date(now).toISOString(),description:"Original transparent bottle illustration"};
  assert.equal(validateReviewedBottleArtwork(art)?.url,art.url);
  for(const url of ["https://test.private.blob.vercel-storage.com/bottle-artwork/a.png","https://test.public.blob.vercel-storage.com/member-photos/a.png","https://test.public.blob.vercel-storage.com.evil.test/bottle-artwork/a.png"]) assert.throws(()=>validateReviewedBottleArtwork({...art,url}));
});

test("catalog rarity repairs old sightings without treating local confidence as expression rarity", () => {
  const catalog = buildSightingRarityCatalog([
    {...bottle, nationalConfidence:"low"},
    {...bottle,id:"regular",canonicalName:"Standard Bourbon",availability:"common",nationalTier:"regular"},
    {...bottle,id:"pending",canonicalName:"Undecided",rarityPending:true},
  ]);
  const fixed = catalog.present({...sighting,rarityTier:"limited"});
  assert.equal(fixed.rarityTier,"allocated");
  assert.equal(fixed.bottleRarity.nationalLabel,"Allocated");
  assert.equal(fixed.bottleRarity.localEstablished,false);
  const common = catalog.present({...sighting,bottleName:"Standard Bourbon",bottleId:"regular",rarityTier:"unicorn"});
  assert.equal(common.rarityTier,undefined);
  assert.equal(common.bottleRarity.nationalLabel,"Regular availability");
  assert.equal(catalog.present({...sighting,bottleName:"Undecided",bottleId:"pending"}).bottleRarity.pending,true);
  assert.equal(catalog.present({...sighting,bottleName:"Example Rye"}).bottleRarity.pending,true,"must not guess a different expression");
  const ambiguous=buildSightingRarityCatalog([{...bottle,aliases:["Shared"]},{...bottle,id:"second",canonicalName:"Second",aliases:["Shared"]}]);
  assert.equal(ambiguous.resolve({bottleName:"Shared"}),undefined);
});

test("reviewed expression aliases preserve rye, age and release identity",()=>{
 const rye={...bottle,id:"forester-rye",canonicalName:"Old Forester Single Barrel Barrel Strength Rye",aliases:[]};
 const catalog=buildSightingRarityCatalog([rye,{...bottle,id:"michters-barrel",canonicalName:"Michters barrel"}]);
 assert.equal(catalog.present({...sighting,bottleName:"Old Forester Single Barrel Rye Barrel Strength",bottleId:undefined}).rarityTier,"allocated");
 assert.equal(catalog.resolve({bottleName:"Old Forester Single Barrel Barrel Strength Bourbon"}),undefined);
 assert.equal(catalog.present({...sighting,bottleName:"Michters barrel",bottleId:"michters-barrel"}).bottleRarity.pending,true);
 assert.equal(catalog.present({...sighting,bottleName:"Old Overholt 12 Year"}).bottleRarity.pending,true);
});
