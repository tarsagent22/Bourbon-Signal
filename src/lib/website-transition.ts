export const APP_STORE_ID='6804261265';
export const APP_BUNDLE_ID='com.bourbonsignal.app';
export function verifiedStoreLink(payload:unknown):string|null {
 const p=payload as {results?:Array<{trackId?:number;bundleId?:string;trackViewUrl?:string;kind?:string}>};
 const app=p?.results?.find(a=>a.trackId===Number(APP_STORE_ID)&&a.bundleId===APP_BUNDLE_ID&&a.kind==='software');
 if(!app?.trackViewUrl)return null;
 try{const u=new URL(app.trackViewUrl);return u.protocol==='https:'&&u.hostname==='apps.apple.com'&&u.pathname.endsWith(`/id${APP_STORE_ID}`)?u.toString():null;}catch{return null;}
}
export function transitionAllowed(env:Record<string,string|undefined>,link:string|null){return env.BOURBON_WEB_TRANSITION_ENABLED==='true' && Number.isFinite(Date.parse(env.BOURBON_WEB_TRANSITION_APPROVED_AT || '')) && Boolean(link);}
export async function websiteLaunchState(){
 let downloadUrl:string|null=null;
 try{const r=await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`,{next:{revalidate:3600},signal:AbortSignal.timeout(5000)});if(r.ok)downloadUrl=verifiedStoreLink(await r.json());}catch{}
 return {downloadUrl,transitionActive:transitionAllowed(process.env,downloadUrl)};
}
export const RETIRED_WEB_ROUTES=['/dashboard','/alerts','/radar','/my-shelf','/finder','/bottle-check','/sightings','/events'];
export function isInteractiveWebPage(path:string){return RETIRED_WEB_ROUTES.some(p=>path===p || path.startsWith(p+'/'));}
