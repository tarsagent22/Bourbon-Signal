import './shelf-native-image.test';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as shelf from './shelf-cabinet';
import type { MemberCollectionBottle } from '../api/types';
const bottle = (id: string, patch: Partial<MemberCollectionBottle> = {}): MemberCollectionBottle => ({bottleId:id, canonicalKey:id,bottleName:id,rating:80,isRated:true,sealedQuantity:1,openedQuantity:0,finishedCount:0,tastedOnly:false,tasteTags:[],addedAt:'2026-01-01',updatedAt:'2026-01-01',...patch});
test('personally rated owned only, valid zero, exact identity, stable ties, no mutation',()=>{
 const a=bottle('a'); const input=[a,bottle('tasted',{sealedQuantity:0,tastedOnly:true,rating:100}),bottle('unrated',{isRated:false,rating:100}),bottle('bad',{rating:NaN}),bottle('high',{rating:101}),bottle('neg',{rating:-1}),bottle('zero',{rating:0}),bottle('b'),bottle('a'),bottle('1792-12',{canonicalKey:'1792',bottleName:'1792 12 Year'}),bottle('1792-small',{canonicalKey:'1792',bottleName:'1792 Small Batch'})];
 assert.equal(typeof shelf.rankedShelfBottles,'function','ranking feature must exist');
 assert.deepEqual(shelf.rankedShelfBottles(input).map(b=>b.bottleId),['a','b','1792-12','1792-small','zero']);
 assert.equal(input[0],a); assert.equal(input.length,11);
 assert.deepEqual(shelf.rankedShelfBottles([bottle('a'),bottle('b',{rating:95})]).map(b=>b.bottleId),['b','a']);
 assert.equal(shelf.rankedShelfBottles([bottle('a',{sealedQuantity:0})]).length,0);
});
test('every count zero through twenty, balanced max two rows max ten and common scale',()=>{
 assert.equal(typeof shelf.cabinetRows,'function','row partition feature must exist');
 for(let n=0;n<=20;n++) {const items=Array.from({length:n},(_,i)=>bottle(String(i)));const rows=shelf.cabinetRows(items);assert.equal(rows.flat().length,n);assert.equal(rows.length,n===0?0:n<=10?1:2);assert.ok(rows.every(r=>r.length<=10));if(n>10)assert.ok(Math.abs(rows[0].length-rows[1].length)<=1);}
 assert.equal(shelf.rankedShelfBottles(Array.from({length:30},(_,i)=>bottle(String(i)))).length,20);
});
test('phone grids adapt to narrow screens and larger text; list fills its gutters',()=>{
 for(const [width,fontScale,columns] of [[320,1,2],[390,1,3],[430,1,3],[390,1.2,2],[430,1.5,2]]) {
  const grid=shelf.shelfGridLayout(width,'grid',fontScale);
  assert.equal(grid.columns,columns);
  assert.equal(grid.tileWidth*columns+(columns-1)*8+20,width);
  assert.deepEqual(shelf.shelfGridLayout(width,'list',fontScale),{columns:1,tileWidth:width-20});
 }
 assert.deepEqual(shelf.SHELF_STYLES.map(s=>s.label),['Amber Wood','Dark Walnut','Black Modern']);
});
test('custom editions with the same lossy key remain distinct and exact duplicates dedupe',()=>{
 const a=bottle('',{canonicalKey:'1792',bottleName:'1792 12 Year'});
 const b=bottle('',{canonicalKey:'1792',bottleName:'1792 Small Batch'});
 assert.notEqual(shelf.shelfBottleKey(a),shelf.shelfBottleKey(b));
 assert.equal(shelf.shelfBottleKey(bottle('known',{bottleName:'Old name'})),'known');
 assert.deepEqual(shelf.rankedShelfBottles([a,b,{...a}]),[a,b]);
});

test('showcase selections are owned, exact, limited and based on real collection data', () => {
 const old=bottle('old',{addedAt:'2026-01-01',rating:99,wouldBuyAgain:true});
 const newer=bottle('new',{addedAt:'2026-10-01',rating:80,isRated:false});
 const invalid=bottle('invalid',{addedAt:'invalid',rating:0});
 const tasted=bottle('tasted',{sealedQuantity:0,tastedOnly:true,rating:100,wouldBuyAgain:true});
 const input=[old,newer,invalid,tasted,{...old}];
 assert.deepEqual(shelf.showcaseBottles(input,'rated').map(b=>b.bottleId),['old','invalid']);
 assert.deepEqual(shelf.showcaseBottles(input,'recent').map(b=>b.bottleId),['new','old','invalid']);
 assert.deepEqual(shelf.showcaseBottles(input,'again').map(b=>b.bottleId),['old']);
 assert.equal(input.length,5);
 assert.equal(shelf.showcaseBottles(Array.from({length:30},(_,i)=>bottle(String(i))),'recent').length,3);
});
