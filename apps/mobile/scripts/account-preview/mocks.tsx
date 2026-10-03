import React,{useEffect} from 'react';
import {Text} from 'react-native';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';
const query=new URLSearchParams(location.search);
export let routeParams:any={section:query.get('section')||'rewards',item:'sticker_pack'};
export const fixtureState={balance:130,redemptions:[] as any[],calls:[] as any[],failOnce:query.has('retry'),free:query.has('free')};
(globalThis as any).rewardFixture=fixtureState;
const catalog=[{key:'sticker_pack',name:'Bourbon Signal sticker pack',points:75,fulfillmentType:'physical',options:{usShippingIncluded:true}},{key:'rocks_glass',name:'Bourbon Signal rocks glass',points:400,fulfillmentType:'physical',options:{usShippingIncluded:true,glassQuantity:1,engravingPointsPerGlass:125}},{key:'glencairn',name:'Bourbon Signal Glencairn',points:450,fulfillmentType:'physical',options:{usShippingIncluded:true,glassQuantity:1,engravingPointsPerGlass:125}}];
const profile={customDisplayName:'Chandler',identity:{label:'Founder #1'},membership:{label:fixtureState.free?'Free':'Bottled in Bond',tier:fixtureState.free?'free':'bottled-in-bond'},entitlements:{fullFeed:true,canSubmitSignals:true}};
const badges=[{id:'first_sighting',label:'First Sighting',earnedAt:'2026-10-02T12:00:00Z',pointsAwarded:10},{id:'photo_finish',label:'Photo Finish',earnedAt:'2026-10-03T12:00:00Z',pointsAwarded:10}];
let address:any={recipientName:'Sample Member',addressLine1:'123 Example Street',addressLine2:null,city:'Louisville',stateCode:'KY',postalCode:'40202',phone:'+15025550100',status:'submitted'};
const receipts=new Map();
const api={getMemberProfile:async()=>({profile}),updateMemberProfile:async({displayName}:any)=>{profile.customDisplayName=displayName;return {profile};},getSignalPoints:async()=>({balance:fixtureState.balance,debt:0,tier:profile.membership.tier,redemptionEligible:!fixtureState.free,catalog,redemptions:fixtureState.redemptions,activity:[{id:'1',kind:'credit',points:20,balanceDelta:20,debtDelta:0,sourceType:'clerk_metadata',reason:'sighting_base_v4',createdAt:'2026-10-03T15:00:00Z'}]}),getAchievements:async()=>({points:130,currentWeeklyStreak:2,longestWeeklyStreak:3,eligibleSightings:8,helpfulSightings:2,photoSightings:4,badges,badgeProgress:[{id:'spotter_bronze',label:'Spotter',tier:'bronze',current:5,target:5,earned:true},{id:'spotter_silver',label:'Spotter',tier:'silver',current:8,target:25,earned:false,description:'Post 25 eligible bottle sightings.'},{id:'local_scout_bronze',label:'Local Scout',tier:'bronze',current:4,target:5,earned:false,description:'Post 5 eligible sightings in one city.'},{id:'helpful_neighbor',label:'Helpful Neighbor',current:0,target:1,earned:false,description:'One active sighting with at least 3 upvotes and a net score of 3.'}]}),getReferralSummary:async()=>({referralLink:'https://example.test/r/DEMO',referralPoints:30,program:{pointsByTier:{free:10,standard:100,barrel:250,'bottled-in-bond':1500},freeAwardLimit:3,upgradeAwardsDifferenceOnly:true},referrals:{total:3,awarded:3,free:3,standard:0,barrel:0,founder:0}}),getRewardShipping:async()=>({record:address,defaultRecipientName:'Sample Member'}),saveRewardShipping:async(value:any)=>{address=value;return {record:address};},redeemReward:async(value:any)=>{fixtureState.calls.push(value);if(!receipts.has(value.idempotencyKey)){fixtureState.balance-=75;const result={ok:true,redemptionId:'fixture-redemption',status:'submitted',balance:fixtureState.balance};receipts.set(value.idempotencyKey,result);fixtureState.redemptions=[{id:result.redemptionId,itemKey:value.itemKey,pointsSpent:75,status:'submitted',createdAt:'2026-10-03T12:00:00Z',updatedAt:'2026-10-03T12:00:00Z'}];}if(fixtureState.failOnce){fixtureState.failOnce=false;throw new Error('Simulated lost response. Retry the same redemption.');}return receipts.get(value.idempotencyKey);},cancelReward:async()=>{fixtureState.redemptions[0].status='canceled';fixtureState.balance+=75;return {ok:true};}};
export function useMobileApi(){return api;}
export function useAuth(){return {userId:'account-preview-member',signOut:async()=>{}};}
function navigate(value:any){const path=typeof value==='string'?value:value.pathname;routeParams=value.params||{};globalThis.dispatchEvent(new CustomEvent('fixture-navigate',{detail:path.split('/').pop()}));}
const router={push:navigate,replace:navigate};
export const useRouter=()=>router;export const useLocalSearchParams=()=>routeParams;
export function useFocusEffect(fn:any){useEffect(fn,[fn]);}
export const getItemAsync=async(key:string)=>localStorage.getItem(key);
export const setItemAsync=async(key:string,value:string)=>localStorage.setItem(key,value);
export const deleteItemAsync=async(key:string)=>localStorage.removeItem(key);
export const randomUUID=()=>crypto.randomUUID();
export const signOutWithRadarPushDisabled=async()=>{};
export const runtimeVersion='fixture';export const updateId='fixture';
export default {nativeAppVersion:'fixture',nativeBuildVersion:'fixture'};
export function MaterialCommunityIcons({name,size,color}:any){return <Text accessible={false} style={{fontFamily:'MaterialCommunityIcons',fontSize:size,color}}>{String.fromCodePoint((glyphMap as any)[name]||983041)}</Text>;}
