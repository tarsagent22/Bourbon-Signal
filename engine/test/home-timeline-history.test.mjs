import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeHistoricalTimelineDrops } from '../src/partial-refresh-contract.mjs';
const now='2026-10-07T15:00:00Z';
const row={id:'old',state:'OH',type:'store_inventory_result',eligibleForDropFeed:true,quantity:3,displayAt:'2026-10-05T12:00:00Z',canAlertAsInventory:true,canAlertAsWatch:true,sourceAvailabilityVerified:true};
test('missing published events persist with original date and no alert authority',()=>{
 const rows=mergeHistoricalTimelineDrops({now,currentDrops:[],previousDrops:[row]});
 assert.equal(rows.length,1); const old=rows[0];
 assert.equal(old.displayAt,row.displayAt); assert.equal(old.historical,true);assert.equal(old.canAlertAsInventory,false);assert.equal(old.canAlertAsWatch,false);assert.equal(old.sourceAvailabilityVerified,false);assert.equal(old.sourceStale,true);
});
test('current observation wins and invalid, expired, future and policy rows do not inflate history',()=>{
 const current={...row,quantity:8};
 assert.deepEqual(mergeHistoricalTimelineDrops({now,currentDrops:[current],previousDrops:[row]}),[current]);
 const rejected=[{...row,displayAt:'2026-08-01'}, {...row,displayAt:'broken'}, {...row,displayAt:'2027-01-01'}, {...row,type:'statewide_policy'}, {...row,eligibleForDropFeed:false}];
 assert.deepEqual(mergeHistoricalTimelineDrops({now,previousDrops:rejected}),[]);
});
test('retained history survives successive refreshes without timestamp renewal or duplication',()=>{
 const first=mergeHistoricalTimelineDrops({now,previousDrops:[row,row]});
 const second=mergeHistoricalTimelineDrops({now:'2026-10-08T15:00:00Z',previousDrops:first});
 assert.equal(second.length,1);assert.equal(second[0].displayAt,row.displayAt);
});
