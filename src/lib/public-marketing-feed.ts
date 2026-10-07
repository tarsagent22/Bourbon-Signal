export type PublicMarketingDrop={id:string;bottle:string;state:string;observedAt:string;location:string};
export function publicMarketingDrops(payload:unknown):PublicMarketingDrop[]{
 const p=payload as {drops?:Array<Record<string,unknown>>};
 return (Array.isArray(p?.drops)?p.drops:[]).slice(0,6).flatMap(d=>{
  const text=(keys:string[])=>keys.map(k=>d[k]).find(v=>typeof v==='string'&&v.trim()) as string|undefined;
  const bottle=text(['canonical_name','canonicalName','bottle_name','bottleName','bourbonName','raw_name','rawName']);
  const state=text(['state','state_code']);const observedAt=text(['detected_at','first_seen_at','firstSeenAt','observed_at','last_seen_at','timestamp']);
  if(!bottle||!state)return [];
  // Location is only the state: public marketing never reveals members or private/store evidence.
  return [{id:String(d.id || d.eventId || d.canonical_id || `${state}:${bottle}`).slice(0,200),bottle:bottle.slice(0,180),state:state.slice(0,24),observedAt:observedAt&&Number.isFinite(Date.parse(observedAt))?observedAt:'',location:state.slice(0,24)}];
 });
}
export async function readPublicMarketingFeed(){
 try{
  // Deliberately anonymous. Never forward the requesting owner's/session's cookies.
  const r=await fetch('https://www.bourbonsignal.com/api/drops?limit=6',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
  if(!r.ok)return {drops:[],unavailable:true};
  return {drops:publicMarketingDrops(await r.json()),unavailable:false};
 }catch{return {drops:[],unavailable:true};}
}
