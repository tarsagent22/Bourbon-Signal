import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {directoryId,parseNcBoards,parseNcStores,parseIdahoStores,parseCityHiveDirectory,parseMontgomeryStores} from './lib/sighting-store-directory-sources.mjs';
import {mergeSightingStoreRows,sightingStoreAddressKey} from '../src/lib/sighting-store-directory-core.ts';
const capture=process.argv.find(a=>a.startsWith('--capture-dir='))?.split('=').slice(1).join('=') || 'test-results/store-library-sources';
const output='src/data/sighting-store-directory.generated.json';
const root=path.resolve('.');const reports=[];const rows=[];
async function json(file){return JSON.parse(await readFile(file,'utf8'));}
async function get(label,url,options={}){
 if(process.argv.includes('--reuse-source-captures')) {
  const file=path.join(capture,label+'.txt');const captured=await stat(file);
  if(Date.now()-captured.mtimeMs>24*60*60*1000)throw Error(`${label}: source capture is older than 24 hours`);
  const text=await readFile(file,'utf8');return {text,digest:createHash('sha256').update(text).digest('hex'),checkedAt:captured.mtime.toISOString()};
 }
 const r=await fetch(url,{...options,headers:{'user-agent':'BourbonSignalStoreDirectory/1.0 (+https://bourbonsignal.com)',...options.headers},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(`${label}: HTTP ${r.status}`);
 const text=await r.text();await mkdir(capture,{recursive:true});await writeFile(path.join(capture,label+'.txt'),text);
 return {text,digest:createHash('sha256').update(text).digest('hex'),checkedAt:new Date().toISOString()};
}
async function source(label,state,url,parser){
 const res=await get(label,url);const stores=parser(res.text);
 if(!stores.length)throw Error(`${label}: empty store directory`);
 rows.push(...stores);reports.push({label,state,url,count:stores.length,checkedAt:res.checkedAt,sha256:res.digest});
 console.log(`${label}: ${stores.length} stores`);
}
const locator='https://abc2.nc.gov/Search/ABCStoreLocator';
const initial=await get('nc-boards',locator);const boards=parseNcBoards(initial.text);const boardReports=[];let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<boards.length){const board=boards[next++];
 const res=await get('nc-board-'+board.id,'https://abc2.nc.gov/Search/StoreSearch',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',referer:locator},body:new URLSearchParams({StoreLocatorCity:'',StoreLocatorZipCode:'',StoreLocatorMiles:'10',StoreLocatorBoard:board.id})});
 const stores=parseNcStores(res.text,board);rows.push(...stores);boardReports.push({id:board.id,name:board.name,count:stores.length,sha256:res.digest});
}}));
const ncCount=rows.length;if(ncCount<450||boardReports.length!==boards.length)throw Error('Incomplete statewide NC ABC store capture');
reports.push({label:'NC ABC Commission store locator',state:'NC',url:locator,count:ncCount,checkedAt:initial.checkedAt,sha256:initial.digest,boards:boardReports.sort((a,b)=>Number(a.id)-Number(b.id))});
console.log(`NC ABC: ${ncCount} stores; ${boards.length} boards; zero missing responses`);
const official=await json('engine/out/location-bible-official.json');
for(const state of ['VA','UT']){
 const report=official.sourceReports.find(r=>r.state===state&&r.status==='ok');
 if(!report)throw Error(`Refresh ${state} with engine location:bible before generating the directory`);
 const stores=official.locations.filter(r=>r.state===state&&r.type==='store');rows.push(...stores);
 reports.push({label:report.id,state,url:report.sourceUrl,count:stores.length,checkedAt:official.generatedAt});
}
await source('Idaho official store locator','ID','https://idaholiquor.com/stores/',parseIdahoStores);
await source('Montgomery ABS official store directory','MD','https://mcg.montgomerycountymd.gov/mcg-iframe-template/abs/storeslocation.aspx',parseMontgomeryStores);
await source('Liquor Barn published locations','KY','https://liquorbarn.com/pages/our-stores',h=>parseCityHiveDirectory(h,'https://liquorbarn.com/pages/our-stores'));
await source('New York active liquor store licenses','NY',"https://data.ny.gov/resource/9s3h-dpkz.json?$where="+encodeURIComponent("class='0100'")+"&$limit=10000&$order=licensepermitid",text=>{
 const records=JSON.parse(text);if(records.length<3000||records.length>=10000)throw Error('Incomplete NY license collection');
 return records.map(r=>({id:`ny-sla-${r.licensepermitid}`,state:'NY',name:r.dba||r.tradename||r.legalname,address:r.actualaddressofpremises,city:r.city,zip:r.zipcode,county:r.premisescounty,aliases:[r.legalname,r.legacyserialnumber].filter(Boolean),source:'New York State Liquor Authority active Liquor Store licenses',sourceUrl:'https://data.ny.gov/d/9s3h-dpkz'}));
});
await source('Colorado active retail liquor licenses','CO',"https://data.colorado.gov/resource/ier5-5ms2.json?$where="+encodeURIComponent("lower(license_type) like '%retail liquor store%' or lower(license_type) like '%liquor%drugstore%'")+"&$limit=10000&$order=license_number",text=>{
 const records=JSON.parse(text);if(records.length<1000||records.length>=10000)throw Error('Incomplete Colorado license collection');
 return records.map(r=>({id:`co-liquor-${r.license_number}`,state:'CO',name:r.doing_business_as||r.licensee_name,address:r.street_address,city:r.city,zip:String(r.zip||'').replace(/\.0$/,''),aliases:[r.licensee_name,r.license_number].filter(Boolean),source:'Colorado Department of Revenue retail liquor license directory',sourceUrl:'https://data.colorado.gov/d/ier5-5ms2'}));
});
const reviewed=await json('src/config/mississippi-known-stores.json');
rows.push(...reviewed.stores);reports.push({label:reviewed.source.label,state:'MS',url:reviewed.source.url,count:reviewed.stores.length,checkedAt:reviewed.reviewedAt,sha256:reviewed.source.responseDigest});
const wv=await json('engine/data/store-universe/WV.json');
rows.push(...wv.stores);reports.push({label:'West Virginia ABCA licensed retail directory',state:'WV',url:'https://www.wvabca.com/licensesearch.aspx',count:wv.stores.length,checkedAt:wv.source?.capturedAt||'2026-07-26'});
const supplemental=process.argv.find(a=>a.startsWith('--supplement-dir='))?.split('=').slice(1).join('=');
const licenseFiles=process.argv.find(a=>a.startsWith('--license-files-dir='))?.split('=').slice(1).join('=');
if(licenseFiles){for(const state of ['CA','GA','TX','KY','FL','IL','SC','TN']){
 const p=await json(path.join(licenseFiles,`store-library-licenses-${state}.json`));
 rows.push(...p.stores);reports.push({label:`${state} official spirits retail licenses`,state,url:p.url,count:p.stores.length,checkedAt:p.checkedAt||new Date().toISOString(),publishedAt:p.publishedAt,sha256:p.sha256});
}}
const authoritativeStates=new Set(['NC','VA','UT','ID','NY','CO',...(licenseFiles?['CA','TX','KY','FL','SC','TN']:[])]);
for(const name of ['locations','stores']){
 const bundled=await json(`engine/out/site/${name}.json`);
 const live=supplemental?await json(path.join(supplemental,`store-library-live-${name}-before.json`)):null;
 for(const payload of [live,bundled])for(const r of payload?.[name]||[])if(!authoritativeStates.has(r.state))rows.push(r);
}
for(const [file,state] of [['florida-abc-store-registry.json','FL'],['florida-star-liquors-store-registry.json','FL']]){
 const p=await json('engine/data/'+file);
 rows.push(...p.stores.filter(r=>r.active!==false).map(r=>({...r,id:r.id||`fl-abc-${r.storeCode}`,state,source:'Retailer-published store registry',sourceUrl:state==='FL'&&r.storeCode?'https://www.abcfws.com/stores':p.sourceUrl})));
 reports.push({label:file,state,url:p.sourceUrl||'https://www.abcfws.com/stores',count:p.stores.length,sha256:p.sha256,checkedAt:'2026-10-08'});
}
// Adopt existing exact-store IDs only at the same verified physical address.
// New locations remain distinct and cannot inherit a nearby store's identity.
const known=[];for(const name of ['stores','locations']){
 const p=await json(`engine/out/site/${name}.json`);known.push(...(p[name]||[]));
 if(supplemental){const l=await json(path.join(supplemental,`store-library-live-${name}-before.json`));known.push(...(l[name]||[]));}
}
const old=mergeSightingStoreRows(known);const oldByAddress=new Map(old.map(r=>[sightingStoreAddressKey(r),r]));
const stores=mergeSightingStoreRows(rows).map(r=>{
 const previous=oldByAddress.get(sightingStoreAddressKey(r));
 return previous?{...r,id:previous.id,aliases:[...new Set([r.id,...(r.aliases||[]),...(previous.aliases||[]),previous.name])].filter(x=>x!==previous.id&&x!==r.name).slice(0,30)}:r;
});
const states={};for(const r of stores)states[r.state]=(states[r.state]||0)+1;
const focusedStates=(await json('src/config/state-lifecycle.json')).activeStates.map(s=>s==='MD-MONTGOMERY'?'MD':s);
for(const state of focusedStates)if(!states[state])throw Error(`Focused state ${state} has no selectable stores`);
if(stores.filter(r=>r.state==='NC').length!==ncCount)throw Error('NC ABC physical address dedupe changed the official store count; inspect before publishing');
const payload={contractVersion:'bourbon-signal/sighting-store-directory@1',generatedAt:new Date().toISOString(),focusedStates,states,sources:reports,stores};
await writeFile(path.resolve(root,output),JSON.stringify(payload)+'\n');
console.log(JSON.stringify({output,count:stores.length,states}));
