import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ILLINOIS_GROCERY_SOURCES} from './collectors/illinois-grocery-premises.mjs';
import {ILLINOIS_GROCERY_PRIORITY_TERMS} from './collectors/grocery-xapi-expansion.mjs';
import {isGroceryExpansionInventory} from './grocery-xapi-policy.mjs';
import {isPublicDropFeedEligible} from '../../src/lib/public-drop-evidence.ts';

export function verifyIllinoisGrocery({state,drops,nowMs=Date.now(),minimumStores=150,minimumRows=700,minimumAllocatedStores=120}={}) {
  const errors=[],check=(value,message)=>{if(!value)errors.push(message);};
  const metadata=state?.precisionMetadata?.grocery;
  const ids=ILLINOIS_GROCERY_SOURCES.map(source=>source.storeId);
  check(state?.state==='IL'&&state.status==='useful'&&state.stale!==true,'Illinois must be fresh and useful');
  check(metadata?.complete===true&&JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)
    &&metadata.verifiedPremises?.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id)),
    'All closed Illinois premises require current resolver proof and complete planned searches');
  const requests=metadata?.requests||[],successful=requests.filter(row=>row.ok===true&&[200,206].includes(row.status));
  const failed=requests.filter(row=>!successful.includes(row));
  check(requests.length>ids.length*2&&requests.length<=2700&&failed.length<=8
    &&failed.every(row=>[0,408,500,502,503,504].includes(row.status)
      &&requests.slice(requests.indexOf(row)+1).some(next=>next.url===row.url&&next.kind===row.kind&&next.ok===true&&[200,206].includes(next.status))),
    'Illinois grocery requests must be complete, healthy or recovered by bounded transport retries, and within their reviewed ceiling');
  check(ids.every(id=>['bourbon','whiskey',...ILLINOIS_GROCERY_PRIORITY_TERMS].every(term=>successful.filter(request=>request.kind==='inventory'&&request.merchantId===id.split(':')[1]&&request.term===term&&new URL(request.url).searchParams.get('start')==='0').length===1)),
    'Every Illinois premise requires both broad searches and all eight core families');
  for(const request of metadata?.requests||[]){
    let url;try{url=new URL(request.url);}catch{check(false,'Invalid grocery request URL');continue;}
    if(request.kind==='resolver')check(url.origin==='https://www.safeway.com'&&url.pathname==='/abs/pub/xapi/storeresolver/v2/all','Unreviewed resolver route');
    else{
      const source=ILLINOIS_GROCERY_SOURCES.find(source=>source.merchantId===request.merchantId);
      check(source&&url.origin==='https://'+source.host&&url.pathname==='/abs/pub/xapi/search/substitute'
        &&url.searchParams.get('storeid')===source.merchantId&&url.searchParams.get('q')===request.term
        &&url.searchParams.get('banner')===source.banner&&url.searchParams.get('channel')==='instore'
        &&url.searchParams.get('rows')==='100'&&['0',...(['bourbon','whiskey'].includes(request.term)?['100','200']:[])].includes(url.searchParams.get('start')),
        'Inventory request lost its exact premise, in-store channel or bounded page');
    }
  }
  const sourceRows=(state?.signals||[]).filter(row=>row.sourceProductBinding?.source==='grocery-xapi');
  check(sourceRows.length>0&&sourceRows.every(row=>isGroceryExpansionInventory(row)&&row.canAlertAsInventory===true
    &&row.raw?.shadowOnly!==true&&row.raw?.sourceRuntimeNonAlertable!==true
    &&Date.parse(row.observedAt)>=Date.parse(state.startedAt)&&Date.parse(row.observedAt)<=Date.parse(state.finishedAt)
    &&nowMs-Date.parse(row.observedAt)>=0&&nowMs-Date.parse(row.observedAt)<=2*60*60_000),
    'Illinois source rows require current, exact product, strength, stock and premise evidence');
  const sourceKeys=new Set(sourceRows.map(row=>[row.storeId,row.productId,row.sourceUrl,row.observedAt].join('|')));
  const publicRows=(Array.isArray(drops)?drops:drops?.drops||[]).filter(row=>row.state==='IL'&&row.sourceProductBinding?.source==='grocery-xapi'&&isPublicDropFeedEligible(row));
  check(publicRows.every(row=>isGroceryExpansionInventory(row)&&sourceKeys.has([row.storeId,row.productId,row.sourceUrl,row.observedAt].join('|'))),'Public grocery rows must retain their original source proof');
  const stores=new Set(publicRows.map(row=>row.storeId)),allocated=publicRows.filter(row=>['allocated','unicorn'].includes(row.tier));
  const allocatedStores=new Set(allocated.map(row=>row.storeId));
  check(stores.size>=minimumStores&&publicRows.length>=minimumRows&&allocatedStores.size>=minimumAllocatedStores,'Fresh public store, bottle or allocated-store floor was not met');
  check(new Set(publicRows.map(row=>row.storeId+'|'+row.productId)).size===publicRows.length,'Duplicate listings cannot inflate gains');
  if(errors.length)throw new Error('Illinois grocery verification failed:\n'+errors.join('\n'));
  return {status:'ok',selectedStores:ids.length,freshPublicStores:stores.size,publicRows:publicRows.length,allocatedRows:allocated.length,allocatedStores:allocatedStores.size,requests:metadata.requests.length};
}

async function main(){
  const out=path.resolve('out'),read=async file=>JSON.parse(await readFile(path.join(out,file),'utf8'));
  const result=verifyIllinoisGrocery({state:await read('states/IL.json'),drops:await read('site/drops.json')});
  await writeFile(path.join(out,'illinois-grocery-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
