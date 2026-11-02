import { PHOENIX_CITYHIVE_EXPANSION_SOURCES, isPhoenixCityHiveExpansionProof, phoenixExpansionBottleMatch } from '../collectors/phoenix-cityhive-expansion.mjs';
import { BourbonBible } from '../core/bible.mjs';
import { isPublicDropFeedEligible } from '../../../src/lib/public-drop-evidence.ts';

export function diagnosePhoenixMetroExpansion({state,drops,bibleRecords,required=false,nowMs=Date.now()}) {
  const errors=[];
  const sources=PHOENIX_CITYHIVE_EXPANSION_SOURCES;
  const ids=new Set(sources.map(s=>s.id));
  const signals=(state?.signals||[]).filter(s=>ids.has(s.sourceChain)&&s.eventType==='cityhive_store_inventory_result');
  const published=(Array.isArray(drops)?drops:drops?.drops||[]).filter(r=>ids.has(r.sourceChain));
  const publicRows=published.filter(isPublicDropFeedEligible);
  const requests=state?.precisionMetadata?.cityhive?.phoenixExpansionRequests||[];
  const bible=new BourbonBible(bibleRecords||[]);
  const check=(ok,message)=>{if(!ok)errors.push(message);};
  const key=r=>`${r.storeId}|${r.productId}|${r.variantId||r.optionId||r.sourceProductBinding?.optionId}`;
  const current=r=>Number.isFinite(Date.parse(r.observedAt))&&nowMs-Date.parse(r.observedAt)>=-60_000&&nowMs-Date.parse(r.observedAt)<=7_200_000&&r.stale!==true&&r.sourceStale!==true;
  const successful=new Set(requests.filter(r=>r.ok===true&&r.status===200).map(r=>r.url));
  const sourceByKey=new Map(signals.map(r=>[key(r),r]));
  for(const row of signals){
    const match=phoenixExpansionBottleMatch(row.rawName,bible);
    check(isPhoenixCityHiveExpansionProof(row)&&current(row)&&successful.has(row.sourceUrl)
      &&match?.id===row.canonicalBottleId&&row.sourceProductBinding.canonicalName===match.canonical,
    'New Phoenix metro source row lost current premise, bottle, option or successful request proof.');
  }
  check(new Set(publicRows.map(key)).size===publicRows.length,'Duplicate Phoenix metro options cannot inflate public coverage.');
  for(const row of published){const original=sourceByKey.get(key(row));
    check(isPhoenixCityHiveExpansionProof(row)&&current(row)&&original
      &&row.price===original.price&&row.quantity===original.quantity&&row.observedAt===original.observedAt,
    'Published Phoenix metro inventory lost its original source price, quantity or observation.');
  }
  for(const source of sources){
    const receipts=requests.filter(r=>r.sourceId===source.id);
    check(receipts.length<=19,'Phoenix metro retailer exceeded its bounded request budget.');
    if(required){
      check(source.urls.every(seed=>receipts.some(r=>{const u=new URL(r.url),s=new URL(seed);u.searchParams.delete('merchant-id');u.searchParams.sort();s.searchParams.sort();return r.ok===true&&r.status===200&&u.href===s.href;})),
        `Phoenix metro ${source.chainName} is missing a required core inventory search.`);
      check(publicRows.some(r=>r.sourceChain===source.id),`Phoenix metro ${source.chainName} has no current public inventory.`);
    }
  }
  const allocatedRows=publicRows.filter(r=>['allocated','unicorn'].includes(r.tier));
  if(required){check(publicRows.length>=6,'New Phoenix metro inventory must retain at least six public listings.');check(allocatedRows.length>=1,'New Phoenix metro inventory must retain allocated inventory.');}
  return {status:errors.length?'failed':'ok',errors,newMetroStores:new Set(publicRows.map(r=>r.storeId)).size,newMetroPublicRows:publicRows.length,newMetroAllocatedRows:allocatedRows.length,newMetroRequests:requests.length};
}
