import assert from 'node:assert/strict';
import test from 'node:test';
import * as interactions from '../interactions/member-interactions';
import type { MemberCollectionBottle } from '../api/types';
const bottle=(id:string, patch:Partial<MemberCollectionBottle>={}):MemberCollectionBottle=>({bottleId:id,bottleName:id,canonicalKey:id,rating:0,isRated:false,sealedQuantity:0,openedQuantity:0,finishedCount:0,tastedOnly:true,addedAt:'2026-01-01',updatedAt:'2026-01-01',...patch});
const stats=(items:MemberCollectionBottle[])=>{
 assert.equal(typeof (interactions as any).collectionStatistics,'function','whole-collection statistics derivation must exist');
 return (interactions as any).collectionStatistics(items);
};
test('whole collection statistics distinguish physical bottles, entries and personal rating population',()=>{
 const s=stats([bottle('a',{sealedQuantity:2,openedQuantity:1,isRated:true,rating:0}),bottle('b',{sealedQuantity:1,isRated:true,rating:100}),bottle('c',{isRated:true,rating:50}),bottle('unrated',{rating:100}),bottle('invalid',{isRated:true,rating:NaN})]);
 assert.equal(s.ownedBottleCount,4);assert.equal(s.ownedWhiskeyCount,2);assert.equal(s.sealedBottleCount,3);assert.equal(s.openBottleCount,1);assert.equal(s.tastedOnlyCount,3);
 assert.equal(s.ratedCount,3);assert.equal(s.averageRating,50);assert.equal(s.highestRatedOwned.bottleId,'b');
 assert.equal(s.distillery.status,'unavailable');assert.equal(s.distillery.knownBottleCount,0);assert.deepEqual(s.distillery.leaders,[]);
});
test('brand, bottler and unverified tied distillery strings cannot become facility statistics',()=>{
 const items=[bottle('a',{sealedQuantity:2}),bottle('b',{openedQuantity:2})].map(b=>({...b,producer:'Brand',distillery:'Unverified tied name',brand:'Bottler'}));
 const s=stats(items);assert.equal(s.distillery.status,'unavailable');assert.equal(s.distillery.knownBottleCount,0);assert.deepEqual(s.distillery.leaders,[]);
});
test('empty and unrated collections have no fake average or highest bottle',()=>{
 for(const items of [[],[bottle('a')]]){const s=stats(items);assert.equal(s.averageRating,null);assert.equal(s.ratedCount,0);assert.equal(s.highestRatedOwned,null);}
});
test('missing and invalid ratings excluded, valid zero retained, stable owned ties',()=>{
 const s=stats([bottle('first',{sealedQuantity:1,rating:0,isRated:true}),bottle('second',{openedQuantity:3,rating:0,isRated:true}),bottle('missing',{isRated:true,rating:undefined as any}),bottle('negative',{isRated:true,rating:-1}),bottle('over',{isRated:true,rating:101})]);
 assert.equal(s.ratedCount,2);assert.equal(s.averageRating,0);assert.equal(s.highestRatedOwned.bottleId,'first');
});
test('stats do not cache account data, respond to edit/removal and ignore view filters',()=>{
 const a=[bottle('a',{sealedQuantity:3,isRated:true,rating:90}),bottle('b',{openedQuantity:1,isRated:true,rating:10})];
 const snapshot=structuredClone(a);const before=stats(a);
 interactions.filterAndSortCollection(a,'a','rating',{...interactions.DEFAULT_COLLECTION_FILTERS,status:'owned'});
 assert.deepEqual(stats(a),before);assert.deepEqual(a,snapshot);
 assert.equal(stats([{...a[0],sealedQuantity:1},a[1]]).ownedBottleCount,2);
 assert.equal(stats(a.slice(1)).averageRating,10);assert.equal(stats([]).ratedCount,0);assert.equal(stats([bottle('other')]).ownedBottleCount,0);
});
