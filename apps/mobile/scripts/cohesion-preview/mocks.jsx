import React from 'react';
import {preferencesFixture,profileFixture,feedFixture} from '../../src/api/astra-fixtures';
import seed from '../../src/cellar/bottle-catalog-seed.json';
import {MobileApiError} from '../../src/api/client';
export const fixture={route:'Home',catalogFailed:false,storeFailed:false,detailFailed:false,alertsFailed:false,empty:false,expired:false,requests:0};
export const setRoute=route=>{fixture.route=route;window.dispatchEvent(new Event('fixture-route'));};
export const router={push(path){const p=typeof path==='string'?path:path.pathname;setRoute(p.includes('cellar/add')?'Add bottle':p.includes('signal/')?'Bottle Profile':p.includes('radar')?'Radar':p.includes('post')?'Post':'Account');},back(){setRoute('My Shelf');}};
export function useRouter(){return router;}
export function useLocalSearchParams(){return {id:'fixture-signal'};}
export function useFocusEffect(callback){React.useEffect(callback,[callback]);}
export const Stack=Object.assign(()=>null,{Screen:()=>null});
export function useAuth(){return {userId:'cohesion-fixture',signOut:async()=>{}};}
export function useUser(){return {user:{id:'cohesion-fixture',primaryEmailAddress:{emailAddress:'fixture@example.test'}}};}
const purchases={status:'unavailable',products:[],eligibleProductIds:[],refresh:async()=>{},restore:async()=>{},purchase:async()=>{},profile:null,membership:null,restoreAvailable:false};
export function usePurchases(){return purchases;}
export const getItemAsync=async key=>localStorage.getItem(key);
export const setItemAsync=async(key,value)=>localStorage.setItem(key,value);
export const deleteItemAsync=async key=>localStorage.removeItem(key);
export const CryptoDigestAlgorithm={SHA256:'SHA-256'};
export const randomUUID=()=>crypto.randomUUID();
export const getRandomBytes=count=>crypto.getRandomValues(new Uint8Array(count));
export const digestStringAsync=async(_,text)=>text;
export const runtimeVersion='fixture';export const updateId='local-preview';
const names=['W.L. Weller Full Proof','Eagle Rare 12 Year',"Russell's Reserve 13 Year",'Pappy Van Winkle 15 Year','Old Forester 1910 Old Fine Whisky','Wild Turkey Rare Breed'];
let preferences=preferencesFixture({entitlements:{canUseCollection:true,canUseRecommendations:true},collectionPreferences:{version:1,bottles:names.map((name,i)=>({bottleId:seed.find(b=>b.name===name)?.id||`fixture-${i}`,bottleName:name,canonicalKey:name.toLowerCase(),rating:95-i*3,isRated:true,sealedQuantity:1,openedQuantity:i%2,finishedCount:0,tastedOnly:false,tasteTags:['Vanilla'],wouldBuyAgain:true,addedAt:'2026-10-01',updatedAt:'2026-10-04'}))}});
const signal={contractVersion:'bourbon-signal/signal@1',id:'fixture-signal',kind:'availability',source:{type:'trusted_source',label:'Retailer'},bottle:{name:'W.L. Weller Full Proof',id:seed[0].id,rarity:'allocated'},location:{scope:'exact_store',state:'NC',store:{name:'Downtown ABC',address:'100 Main Street',city:'Raleigh',state:'NC'}},timing:{displayAt:new Date().toISOString()},evidence:{photo:false,corroborationCount:0,helpfulCount:0,retailerReported:false,sourceBacked:true},strength:'best',alertEligibility:{inventory:true,watch:true},availability:{status:'reported',price:59.99},actions:['watch_bottle']};
const api={
 getMemberPreferences:async()=>({...preferences,collectionPreferences:{...preferences.collectionPreferences,bottles:fixture.empty?[]:preferences.collectionPreferences.bottles}}),
 updateMemberPreferences:async patch=>{preferences={...preferences,...patch};return preferences;},
 getMemberProfile:async()=>profileFixture({customDisplayName:'Chandler',feedAreas:{states:[{code:'NC',label:'North Carolina',areaLabel:'Board',options:[{value:'Wake',label:'Wake County'}]}]}}),
 listBottleCatalog:async()=>{if(fixture.catalogFailed)throw Error('offline');return seed;},
 listSignals:async({cursor}={})=>{fixture.requests++;if(cursor&&fixture.expired){fixture.expired=false;throw new MobileApiError('Feed expired',409,'CURSOR_EXPIRED',true,true);}return {...feedFixture(),signals:fixture.empty?[]:names.map((name,i)=>({...signal,id:`fixture-${i}`,bottle:{...signal.bottle,name,rarity:['allocated','limited','unicorn'][i%3]}})),nextCursor:fixture.expired?'expired':null,hasMore:fixture.expired};},
 getSignal:async()=>{if(fixture.detailFailed)throw Error('offline');return {signal};},getHuntOutcome:async()=>({outcome:null}),setHuntOutcome:async()=>({outcome:null}),
 getMemberAlerts:async()=>{if(fixture.alertsFailed)throw Error('offline');return {alerts:[],unreadCount:0};},
 getPushDeviceStatus:async()=>({supported:true,enabled:false,registeredDeviceCount:0}),
 searchMonitoringGeography:async()=>{if(fixture.storeFailed)throw Error('offline');return {states:[],results:[],hasMore:false};},
 getSignalPoints:async()=>({balance:150,debt:0,catalog:[],redemptions:[],redemptionEligible:true}),
 getAchievements:async()=>({badges:[],badgeProgress:[],currentWeeklyStreak:2}),
 getReferralSummary:async()=>({code:'FIXTURE',referralLink:'https://example.test/referral',referralPoints:0,founderGlassesEarned:0,founderGlassesAwaitingAddress:0,referrals:{total:0,free:0,standard:0,barrel:0,founder:0},program:{pointsByTier:{free:5,standard:50,barrel:100,'bottled-in-bond':200},freeAwardLimit:5,upgradeAwardsDifferenceOnly:true}}),
 submitSighting:async()=>({created:true,duplicate:false}),
};
export function useMobileApi(){return api;}
export const radarPushDeviceId=async()=>'fixture-device';export const radarPushPermission=async()=>'granted';
export const refreshRadarPushIfEnabled=async()=>null;export const watchRadarPushToken=()=>({remove(){}});
export const enableRadarPush=async()=>null;export const disableRadarPush=async()=>null;export const signOutWithRadarPushDisabled=async()=>{};
export const PushMaintenance=()=>null;export const PushResponseHandler=()=>null;
export const nativePhotoJournal=()=>({load:async()=>null});
export const chooseSightingPhoto=async()=>({error:'Photo actions require a native device.'});
export const discardSightingPhoto=()=>{};export const sightingPhotoBlob=async()=>new Blob();export const retainSightingPhoto=(_,photo)=>photo;
