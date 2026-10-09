import React from 'react';
import {profileFixture,feedFixture} from '../../src/api/astra-fixtures';
import {buildSignalFeedAreaDirectory} from '../../../../src/lib/feed-area-options';
import {MobileApiError} from '../../src/api/client';
export * from '../cohesion-preview/mocks';
export const state={owner:'user_preview_A',slow:false,offline:false,profileSlow:!new URLSearchParams(location.search).has('usability'),requests:[],started:performance.now()};
export function useAuth(){return {userId:state.owner};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rows=Array.from({length:200},(_,i)=>({contractVersion:'bourbon-signal/signal@1',id:`row-${i}`,kind:'availability',source:{type:'trusted_source',label:'Retailer'},bottle:{name:i<160?`Limited Bourbon ${i}`:i<190?`Allocated Bourbon ${i}`:`Unicorn Bourbon ${i}`,rarity:i<160?'limited':i<190?'allocated':'unicorn'},location:{scope:'exact_store',state:'NC',store:{name:'Downtown ABC',city:'Raleigh',state:'NC'}},timing:{displayAt:new Date(Date.now()-i*3600000).toISOString()},evidence:{photo:false,corroborationCount:0,helpfulCount:0,retailerReported:false,sourceBacked:true},strength:'best',availability:{status:i>175?'reported':'available_now',price:59.99},historical:i>175,alertEligibility:{inventory:i<=175,watch:false},actions:[]}));
const api={
 getMemberProfile:async()=>{await pause(state.profileSlow?8000:5);return profileFixture({feedAreas:buildSignalFeedAreaDirectory()});},
 listSignals:async({rarities=[],cursor,limit=30,view,state:filterState,area}={})=>{
  const start=performance.now();state.requests.push({view,rarities,cursor,filterState,area,start});
  await pause(state.slow?8000:rarities.includes('allocated')&&!rarities.includes('unicorn')?500:50);
  if(state.offline)throw new MobileApiError('Connection unavailable. Showing saved Signals.',0,'NETWORK_ERROR',true);
  const selected=state.owner==='user_preview_B'?[]:rows.filter(row=>(!rarities.length||rarities.includes(row.bottle.rarity))&&(!filterState||filterState==='NC'));
  const offset=Number(cursor)||0;return {...feedFixture(),view,signals:selected.slice(offset,offset+limit),total:selected.length,hasMore:offset+limit<selected.length,nextCursor:offset+limit<selected.length?String(offset+limit):null};
 },getSignalAreaOptions:async()=>[],
};
export function useMobileApi(){return api;}
export const cacheDirectory='fixture://';
export const readAsStringAsync=async path=>localStorage.getItem(path);
export const writeAsStringAsync=async(path,value)=>localStorage.setItem(path,value);
export const deleteAsync=async path=>localStorage.removeItem(path);
