import assert from 'node:assert/strict';
import test from 'node:test';
import * as deliveryModule from '../src/lib/alert-delivery';
import * as pushModule from '../src/lib/push-devices';
const { candidateToMemberAlert, normalizeAlertInboxMetadata, groupCandidatesByLocation } = (deliveryModule as any).default || deliveryModule;
const { buildExpoPushMessages } = (pushModule as any).default || pushModule;
const token='ExpoPushToken[aaaaaaaaaaaaaaaa]';
test('Community report fields survive candidate conversion, stored inbox and final provider preview',()=>{
const candidate={id:'community:sighting-123',dedupeKey:'community-sighting:sighting-123',bottle:'E.H. Taylor Single Barrel',sourceType:'community',state:'NC',storeName:'Durham ABC',storeCity:'Durham',storeAddress:'123 Main St',locationName:'Durham ABC',locationPrecision:'store_level',eventType:'qualified_community_sighting',tier:'allocated',quantityEstimate:'4',price:95};
const alert=candidateToMemberAlert('owner',candidate,'2026-10-19T12:00:00.000Z');
const restored=normalizeAlertInboxMetadata({recent:[JSON.parse(JSON.stringify(alert))]}).recent[0]!;
const [message]=buildExpoPushMessages([token],restored);
assert.equal(message?.title,'Community sighting');
assert.equal(message?.body,'E.H. Taylor Single Barrel · 4 bottles · $95\nDurham ABC · Durham, NC');
assert.equal(restored.signalId,'member:sighting-123');
});
test('a mixed rarity group cannot inherit the primary bottle allocated label',()=>{
const base={state:'NC',storeName:'ABC',locationName:'ABC',locationPrecision:'store_level',storeAddress:'123 Main St',eventType:'store_inventory_result',signalAt:'2026-10-19T12:00:00.000Z'};
const [group]=groupCandidatesByLocation([{...base,id:'a',bottle:'Blantons',tier:'allocated',quantity:4},{...base,id:'b',bottle:'Other',tier:'limited',quantity:2}]);
const alert=candidateToMemberAlert('owner',group!,'2026-10-19T12:00:00.000Z');
assert.equal(alert.allBottlesAllocated,false);assert.equal(alert.quantity,6);
});
