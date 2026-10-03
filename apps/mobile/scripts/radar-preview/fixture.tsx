import { useEffect } from 'react';
import { View } from 'react-native';
import type { MemberAlert, MemberPreferencesPatch } from '../../src/api/types';
import { preferencesFixture, profileFixture } from '../../src/api/astra-fixtures';
const scenario = new URLSearchParams(location.search).get('scenario') || 'empty';
let prefs = preferencesFixture({ alertMode:'anything_notable', monitoringScopes:[{type:'board', id:'NC:triad',state:'NC',label:'Triad Municipal ABC'},{type:'board',id:'NC:greensboro',state:'NC',label:'Greensboro ABC'}], entitlements:{alertAreaLimit:null,trackedBottleLimit:null,canReceiveSmsAlerts:true} });
prefs.notificationPreferences.rarityTiers = ['unicorn','allocated'];
prefs.notificationPreferences.email.enabled = true;
prefs.notificationPreferences.push.enabled = true;
prefs.notificationPreferences.sms = { enabled:false,available:true,verified:true,phone:'3365558539',mode:'major_only' };
if (scenario === 'setup') prefs.monitoringScopes = [];
if (scenario === 'free') prefs.entitlements = {alertAreaLimit:0,trackedBottleLimit:0};
let status = { enabled:true,currentDeviceRegistered:true,registeredDeviceCount:1 };
let alerts: MemberAlert[] = [0,1,2].map((n) => ({id:`history-${n}`,bottleName:['Stagg','Weller 12 Year','Eagle Rare 10 Year'][n],state:'NC',storeLabel:'Synthetic ABC Store',matchedArea:'Triad Municipal ABC',eventType:'availability',rarityTier:'allocated',quantity:2,score:70,priorityClass:'standard',createdAt:new Date(Date.now()-7*86400000).toISOString(),readAt:null,archivedAt:null,sourceType:'engine',sourceLabel:'Store inventory report'}));
if (scenario === 'current') alerts = [{...alerts[0], id:'current',createdAt:new Date(Date.now()-15*60000).toISOString(),sourceType:'community',sourceLabel:'Community sighting'},...alerts];
const api = {
  async getMemberPreferences(){return structuredClone(prefs);},
  async getMemberAlerts(){return {alerts:structuredClone(alerts),unreadCount:alerts.filter(a=>!a.readAt&&!a.archivedAt).length};},
  async getMemberProfile(){return profileFixture({feedAreas:{states:[{code:'NC',label:'North Carolina',areaLabel:'Board',options:[]}]}});},
  async listRadarBottles(){return [{id:'stagg',name:'Stagg',rarity:'unicorn'},{id:'eagle',name:'Eagle Rare 10 Year',rarity:'allocated'}];},
  async getPushDeviceStatus(){return status;},
  async updateMemberPreferences(patch: MemberPreferencesPatch){
    if(scenario==='save-error') throw new Error('Synthetic failure');
    if(patch.notificationPreferences) for(const [key,value] of Object.entries(patch.notificationPreferences)) (prefs.notificationPreferences as any)[key] = Array.isArray(value) ? value : {...(prefs.notificationPreferences as any)[key],...value};
    if(patch.alertMode) prefs.alertMode=patch.alertMode;
    if(patch.monitoringScopes) prefs.monitoringScopes=patch.monitoringScopes;
    if(patch.watchlistMutation){const m=patch.watchlistMutation; prefs.bottleAlertPreferences.bottleNames=prefs.bottleAlertPreferences.bottleNames.filter(n=>n!==m.bottleName);if(m.watched)prefs.bottleAlertPreferences.bottleNames.push(m.bottleName);prefs.bottleAlertPreferences.bottleKeys=prefs.bottleAlertPreferences.bottleNames.map(n=>n.toLowerCase());}
    return structuredClone(prefs);
  },
  async updateMemberAlert(action:string,id?:string){alerts=alerts.map(a=>a.id===id?{...a,...(action==='archive'?{archivedAt:new Date().toISOString()}:{readAt:new Date().toISOString()})}:a);return this.getMemberAlerts();},
  async searchMonitoringGeography(){return {results:[{id:'NC:triad',name:'Triad Municipal ABC',state:'NC',level:'board'},{id:'NC:greensboro',name:'Greensboro ABC',state:'NC',level:'board'}],hasMore:false};},
};
export function useMobileApi(){return api;}
export function useLocalSearchParams(){return {};}
const router={push(route:unknown){window.alert(JSON.stringify(route));}};
export function useRouter(){return router;}
export function useFocusEffect(callback:()=>void|(()=>void)){useEffect(callback,[callback]);}
export const SafeAreaView=View;
export function useSafeAreaInsets(){return {top:0,bottom:0,left:0,right:0};}
export async function radarPushDeviceId(){return 'preview';}
export async function radarPushPermission(){return scenario==='denied'?'denied':'granted';}
export async function rememberRadarPushEnabled(){}
export async function refreshRadarPushIfEnabled(){return status;}
export function watchRadarPushToken(){return {remove(){}};}
export async function enableRadarPush(){prefs.notificationPreferences.push.enabled=true;return status={...status,enabled:true};}
export async function disableRadarPush(){prefs.notificationPreferences.push.enabled=false;return status={...status,enabled:false};}
