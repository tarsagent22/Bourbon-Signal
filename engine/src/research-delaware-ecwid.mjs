import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sourceData from '../data/de-ecwid-research-source.json' with { type: 'json' };
import { fetchReviewedFirstPartyText, CITYHIVE_DENIAL_STATUSES } from './collectors/central-cityhive-transport.mjs';
import { parseEcwidPickupOffer, verifyEcwidPickupPremise } from './collectors/ecwid-pickup-surfaces.mjs';
import { atomicWriteJson } from './fwgs-artifact-policy.mjs';
import { stableId, stripHtml } from './core/text.mjs';

const state='DE',quantitySemantics='binary_retailer_orderable_no_exact_count';
const merchant=Object.freeze({merchantId:sourceData.source.merchantId,name:sourceData.source.retailer,
  origin:sourceData.source.origin,storeId:'ecwid:de:130511528',address:sourceData.source.premise.address,
  city:sourceData.source.premise.city,zip:'19967'});
const product=Object.freeze({productId:sourceData.product.productId,sku:sourceData.product.sku,
  name:sourceData.product.title,canonical:sourceData.product.canonicalName,canonicalId:sourceData.product.canonicalId,
  url:sourceData.product.url});
const sourceLabel='Banks Wines & Spirits Millville first-party pickup';
const sourceRuntimeId='research:de:ecwid:130511528';
const urls=[sourceData.source.homeUrl,product.url];
const config=Object.freeze({id:state,label:sourceLabel,tier:'B',active:false,strategy:'retailer_store_inventory',
  cadence:'shadow-only',sources:urls.map(url=>({kind:'html',url,precisionOnly:true})),apiCandidates:[]});
const shadowFlags=Object.freeze({alertable:false,canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:false,
  eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false});
const sha=value=>createHash('sha256').update(value).digest('hex');
const cadenceMs=30*60_000,denialMs=24*60*60_000,quantityRegex=/\bConvenient In-Store and Curbside Pickup available for all orders\. Shipping is unavailable due to state regulations\./i;

export function delawareEcwidResearchSource(id){return id==='DE'?config:null;}
export function isDelawareEcwidShadowPickup(row,{nowMs=Date.now()}={}){
  const binding=row?.sourceProductBinding,age=nowMs-Date.parse(row?.observedAt||'');
  return row?.state==='DE'&&row.sourceRuntimeId===sourceRuntimeId&&row.sourceUrl===product.url
    &&row.storeId===merchant.storeId&&row.storeAddress===merchant.address&&row.productId===product.productId
    &&row.canonicalBottleId===product.canonicalId&&row.canonicalName===product.canonical&&row.tier==='allocated'
    &&row.locationPrecision==='store_level'&&row.availabilityStatus==='in_stock'&&row.sourceAvailabilityVerified===true
    &&row.quantity===0&&row.quantityIsExact===false&&row.quantitySemantics===quantitySemantics
    &&row.raw?.shadowOnly===true&&Number(row.raw?.reportedQuantity)>0&&age>=0&&age<=4*60*60_000
    &&binding?.merchantId===merchant.merchantId&&binding.storeId===merchant.storeId&&binding.productId===product.productId
    &&binding.sku===product.sku&&binding.canonicalId===product.canonicalId&&binding.observedAt===row.observedAt
    &&binding.premisesVerified===true&&binding.pickupOfferVerified===true
    &&Object.keys(shadowFlags).every(flag=>row[flag]===false);
}

function verifyLocalPickupPolicy(html){
  const visible=stripHtml(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu,' '));
  if(!quantityRegex.test(visible))throw Error('Banks public page no longer verifies the reviewed local pickup policy.');
}

function inventoryRow(offer,bible,observedAt){
  if(!offer)return null;
  const match=bible.match(product.canonical),record=match?.record;
  if(match?.method!=='exact-library-identity'||record?.id!==product.canonicalId||record.canonical!==product.canonical
    ||record.tier!=='allocated'||sourceData.product.sizeMl!==750) {
    throw Error('Banks pickup product did not match the current exact 750 mL allocated library identity.');
  }
  return{
    id:stableId([state,merchant.storeId,product.productId,product.sku]),state,stateCode:state,
    eventType:'retailer_store_inventory_result',sourceLabel,sourceUrl:product.url,sourceRuntimeId,
    observedAt,productId:product.productId,canonicalBottleId:record.id,canonicalName:record.canonical,
    rawName:product.name,tier:record.tier,price:offer.price,locationPrecision:'store_level',
    storeId:merchant.storeId,storeName:merchant.name,locationName:merchant.name,storeAddress:merchant.address,
    city:merchant.city,postalCode:merchant.zip,quantity:0,quantityIsExact:false,quantitySemantics,
    availabilityStatus:'in_stock',sourceAvailabilityVerified:true,
    inventorySemantics:'The current first-party Ecwid offer is orderable for pickup at Banks Wines & Spirits in Millville. Reported stock is binary; verify before driving.',
    evidence:`${merchant.name} reports ${product.canonical} available for pickup at ${merchant.address} for $${offer.price.toFixed(2)}.`,
    raw:{shadowOnly:true,reportedQuantity:offer.reportedQuantity,pickupWindow:offer.pickupWindow,quantitySemantics},
    ...shadowFlags,
    sourceProductBinding:{schemaVersion:1,source:'ecwid-first-party-pickup',merchantId:merchant.merchantId,
      storeId:merchant.storeId,storeAddress:merchant.address,productId:product.productId,sku:product.sku,
      rawName:product.name,canonicalId:record.id,canonicalName:record.canonical,observedAt,
      premisesVerified:true,pickupOfferVerified:true,quantitySemantics},
  };
}

export async function collectDelawareEcwidResearch(incoming,bible,{
  signal,env=process.env,fetchText=fetchReviewedFirstPartyText,
  clocksFile=path.resolve('out/research-source-attempts/delaware-ecwid.json'),
  reportDirectory=env.BOURBON_SIGNAL_STATE_OUT_FILE?path.dirname(env.BOURBON_SIGNAL_STATE_OUT_FILE):null,
}={}){
  if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1'||incoming!==config)throw Error('Delaware Ecwid collection requires its registered isolated shadow source.');
  const startedAt=new Date().toISOString(),requests=[],roadblocks=[],signals=[];
  const prior=await readFile(clocksFile,'utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(prior&&(prior.schemaVersion!==1||prior.hostname!==new URL(merchant.origin).hostname||!Number.isFinite(Date.parse(prior.nextAllowedAt))))
    throw Error('Delaware Ecwid attempt clock is malformed.');
  const recordClock=async(time,delay)=>atomicWriteJson(clocksFile,{schemaVersion:1,hostname:new URL(merchant.origin).hostname,
    lastAttemptAt:new Date(time).toISOString(),nextAllowedAt:new Date(time+delay).toISOString()});
  const due=!prior||Date.parse(prior.nextAllowedAt)<=Date.parse(startedAt);
  let complete=false,offer=null;
  if(due){
    await recordClock(Date.now(),cadenceMs);
    for(const [index,url] of urls.entries()){
      signal?.throwIfAborted();const receipt={url};requests.push(receipt);
      try{
        const response=await fetchText(url,{signal,maxBytes:1024*1024,isAllowedUrl:candidate=>candidate.href===url,
          onResponse:status=>{receipt.status=status.status;if(CITYHIVE_DENIAL_STATUSES.has(status.status)){
            return recordClock(Date.now(),Math.min(30*denialMs,Math.max(denialMs,(status.retryAfterSeconds||0)*1000)));
          }}});
        receipt.status=response.status;receipt.observedAt=new Date().toISOString();
        if(response.status!==200||response.url!==url)throw Error('Delaware Ecwid URL did not return its exact first-party page.');
        if(index===0){verifyEcwidPickupPremise(response.text,merchant);verifyLocalPickupPolicy(response.text);}
        else offer=parseEcwidPickupOffer(response.text,merchant,product);
        receipt.sha256=sha(response.text);receipt.bytes=Buffer.byteLength(response.text);
        if(reportDirectory){
          receipt.artifactPath=`source-captures/${index===0?'premise':'product'}.html`;
          const destination=path.join(reportDirectory,receipt.artifactPath);await mkdir(path.dirname(destination),{recursive:true});
          await writeFile(destination,response.text,{flag:'wx',signal});
        }
        receipt.ok=true;
      }catch(error){
        signal?.throwIfAborted();receipt.ok=false;
        roadblocks.push({state,source:sourceLabel,status:receipt.status||0,error:error.message});break;
      }
    }
    complete=requests.length===urls.length&&requests.every(row=>row.ok===true);
    if(complete){const row=inventoryRow(offer,bible,requests.at(-1).observedAt);if(row)signals.push(row);}
  }
  const finishedAt=new Date().toISOString(),sourceObservedAt=requests.at(-1)?.observedAt||null;
  const sources=requests.map(request=>({sourceRuntimeId,label:sourceLabel,url:request.url,status:request.status||0,
    ok:request.ok===true,alertable:false,inventoryAlertable:false,watchAlertable:false}));
  return{state,label:sourceLabel,tier:config.tier,strategy:config.strategy,cadence:config.cadence,startedAt,finishedAt,
    lastGoodAt:complete?sourceObservedAt:null,status:signals.length?'useful':due?'no_trusted_inventory':'not_due',stale:false,signals,sources,
    sourceResults:sources,roadblocks,metadata:{complete,shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,
      verifiedPremises:complete?[merchant.storeId]:[],selectedStores:[merchant.storeId],requests,sourceObservedAt,
      libraryRecordsSha256:sha(JSON.stringify(bible.records)),allDeliveryDisabled:true}};
}
