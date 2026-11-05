const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const addressKey=store=>store.state+'|'+store.address.toLowerCase().replace(/[^a-z0-9]/g,'');
export function reviewedActiveGroceryCohort({california,nevada,illinois=[]}={}){
 requireValue(Array.isArray(california)&&Array.isArray(nevada)&&Array.isArray(illinois),'Explicit reviewed CA/NV and optional IL source arrays required');
 const seenIds=new Set(),seenPremises=new Set();
 return [...california.map(source=>({state:'CA',source})),...nevada.map(source=>({state:'NV',source})),...illinois.map(source=>({state:'IL',source}))].map(({state,source})=>{
  const store=source.store||source,banner=source.banner,merchant=String(source.merchantId||'');
  requireValue((store.stateCode||source.stateCode)===state,'Only CA/NV/IL reviewed active grocery premises may be counted');
  requireValue((state==='IL'?banner==='jewelosco':['safeway','vons','albertsons','pavilions'].includes(banner))&&source.host===`www.${banner}.com`&&/^\d+$/.test(merchant),'Exact reviewed grocery host/banner/merchant binding required');
  requireValue(state!=='NV'||source.platform==='albertsons-xapi'&&source.inventoryEligible===true,'NV source must be an admitted inventory-eligible XAPI premise');
  const result={state,storeId:store.storeId||store.id,name:store.name,address:store.address,city:store.city,lat:store.lat,lng:store.lng,sourceId:source.id};
  requireValue(result.storeId===`${banner}:${merchant}`&&typeof result.name==='string'&&result.name.length>0&&typeof result.city==='string'&&result.city.length>0&&typeof result.address==='string'&&new RegExp(`,\\s*${state}\\s+\\d{5}`).test(result.address),'Exact premise ID/address/city required');
  requireValue(Number.isFinite(result.lat)&&Number.isFinite(result.lng)&&(state==='IL'?result.lat>=36&&result.lat<=43&&result.lng>=-92&&result.lng<=-87:result.lat>=32&&result.lat<=43&&result.lng>=-125&&result.lng<=-114),'Reviewed premise coordinates required');
  const id=state+'|'+result.storeId,premise=addressKey(result);
  requireValue(!seenIds.has(id)&&!seenPremises.has(premise),'Duplicate physical premise or store identity in cohort');
  seenIds.add(id);seenPremises.add(premise);return result;
 });
}

export function partitionCandidatePremises(expected,{baselineRows,currentRows,premiseKey,isEligible}={}){
 requireValue(Array.isArray(expected)&&Array.isArray(baselineRows)&&Array.isArray(currentRows)&&typeof premiseKey==='function'&&typeof isEligible==='function','Real baseline/current rows and explicit evidence policy required');
 const before=new Set(baselineRows.map(premiseKey).filter(Boolean)),candidates=[],excluded=[];
 for(const store of expected){
  const key=premiseKey({...store,storeAddress:store.address});requireValue(Boolean(key),'Expected premise has no canonical physical identity');
  if(before.has(key)){excluded.push({...store,reason:'already_in_latest_released_artifact'});continue;}
  const rows=currentRows.filter(row=>premiseKey(row)===key&&isEligible(row));
  if(!rows.length){excluded.push({...store,reason:'no_fresh_eligible_published_inventory'});continue;}
  candidates.push({store,premise:key,rows});
 }
 return{candidates,excluded};
}

// Active configuration is an admission boundary, not evidence of a new engine
// addition. Only the explicit reviewed additions can contribute to the target.
export function reviewedAdditionsWithinActiveCohort({active,additions}={}){
 requireValue(Array.isArray(active)&&Array.isArray(additions)&&additions.length>0,'Explicit active and reviewed-addition cohorts required');
 const fields=['state','storeId','sourceId','name','address','city','lat','lng'];
 const bindings=new Map(),physical=new Set();
 for(const store of active){
  const key=store.state+'|'+store.storeId;
  requireValue(!bindings.has(key),'Duplicate active store binding');bindings.set(key,store);
 }
 const selected=new Set();
 for(const addition of additions){
  const key=addition.state+'|'+addition.storeId,bound=bindings.get(key),premise=addressKey(addition);
  requireValue(bound&&fields.every(field=>bound[field]===addition[field]),'Reviewed addition is not exactly bound to its closed active source');
  requireValue(!selected.has(key)&&!physical.has(premise),'Duplicate reviewed addition binding or physical premise');
  selected.add(key);physical.add(premise);
 }
 return additions;
}
