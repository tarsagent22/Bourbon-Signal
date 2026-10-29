import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {NEW_ENGLAND_RESEARCH_SOURCES,parseNewEnglandResearchInventory} from '../engine/src/collectors/new-england-research.mjs';
const root='engine/data/source-evidence/new-england-research-20261029';
const evidence=JSON.parse(await readFile(root+'/receipts.json','utf8')),bible=await BourbonBible.load('engine/out/bourbon-bible.json');
const nowMs=Date.now(),rows=[],summary=[];
for(const receipt of evidence.officialPremiseReceipts||[]){
  if(receipt.status!==200||receipt.finalUrl!==receipt.url||!/^captures\/official-[A-Za-z0-9._-]+\.gz$/.test(receipt.artifactPath))throw Error('Invalid official premise capture binding');
  const compressed=await readFile(root+'/'+receipt.artifactPath),body=gunzipSync(compressed,{maxOutputLength:2*1024*1024});
  if(compressed.length!==receipt.compressedBytes||createHash('sha256').update(compressed).digest('hex')!==receipt.compressedSha256
    ||body.length!==receipt.bytes||createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw Error('Official premise capture changed');
}
for(const source of NEW_ENGLAND_RESEARCH_SOURCES){
  const receipt=evidence.receipts.find(row=>row.url===source.discoveryUrl);
  if(!receipt||receipt.status!==200||receipt.finalUrl!==receipt.url||!/^captures\/[A-Za-z0-9._-]+\.html\.gz$/.test(receipt.artifactPath))throw Error('Invalid source capture binding');
  const compressed=await readFile(root+'/'+receipt.artifactPath);
  if(compressed.length!==receipt.compressedBytes||createHash('sha256').update(compressed).digest('hex')!==receipt.compressedSha256)throw Error('Compressed source body changed');
  const body=gunzipSync(compressed,{maxOutputLength:2*1024*1024});
  if(body.length!==receipt.bytes||createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw Error('Raw source body changed');
  const parsed=parseNewEnglandResearchInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt,nowMs});
  if(!parsed.length)throw Error('No currently qualified scarce pickup evidence at '+source.name);
  rows.push(...parsed);summary.push({state:source.state,storeId:source.storeId,storeName:source.name,sourceObservedAt:receipt.observedAt,
    receiptSha256:receipt.sha256,bottles:parsed.map(row=>({canonicalName:row.canonicalName,rawName:row.rawName,price:row.price,tier:row.tier,productId:row.productId,optionId:row.optionId}))});
}
if(rows.some(row=>row.eligibleForOnSite||row.canAlertAsInventory||row.canAlertAsWatch||row.eligibleForDelivery||row.eligibleForEmail||row.eligibleForSms))throw Error('Research delivery isolation failed');
const result={schemaVersion:1,verifiedAt:new Date(nowMs).toISOString(),scope:evidence.scope,stores:summary.length,rows:rows.length,
  allNotificationAndCustomerFlagsDisabled:true,productionActivationAllowed:false,promotionEligible:false,summary};
await writeFile('.operator/new-england-source-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
