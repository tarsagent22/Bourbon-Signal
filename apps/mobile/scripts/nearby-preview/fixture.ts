const signal=(id:string,name:string,price:number)=>({contractVersion:'bourbon-signal/signal@1',id,bottle:{name},location:{scope:'exact_store'},availability:{label:'Retailer reported',price},timing:{displayAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString()}});
const stores=[{id:'one',name:'Oak & Barrel',address:'123 Main Street',city:'Raleigh',state:'NC',latitude:35.78,longitude:-78.64,distance:2.4,signals:[signal('one','Eagle Rare 10 Year',44.99),signal('two','Weller Special Reserve',29.99)]},{id:'two',name:'The Bottle Shop',address:'456 Market Street',city:'Cary',state:'NC',latitude:35.78,longitude:-78.7,distance:12.6,signals:[signal('three','Blanton’s Original Single Barrel',79.99)]}];
const api={nearby:async()=>{await new Promise(r=>setTimeout(r,300));return {stores,partial:false,unmapped:0,previewLocked:false};},getMemberPreferences:async()=>({bottleAlertPreferences:{bottleNames:['Eagle Rare 10 Year']}})};
export const useMobileApi=()=>api;
export const useLocalSearchParams=()=>({});
export const router={push:(value:unknown)=>{console.log('preview navigation',value);}};
export const getItemAsync=async()=>JSON.stringify({latitude:35.78,longitude:-78.64,label:'Raleigh, NC'});
export const setItemAsync=async()=>{};
