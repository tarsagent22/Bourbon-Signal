import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from '../engine/src/collectors/central-cityhive-expansion.mjs';
import {isNjMiResearchInventory} from '../engine/src/nj-mi-research-policy.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return[value.slice(2,at),value.slice(at+1)];}));
assert.ok(args.root&&/^\d+$/.test(args.run||'')&&/^[a-f0-9]{40}$/.test(args.commit||''),'Use --root=download --run=GitHubRunId --commit=exactCommit');
const root=path.resolve(args.root),bible=await BourbonBible.load(path.join(root,'bourbon-bible.json'));
const digest=createHash('sha256').update(JSON.stringify(bible.records)).digest('hex'),summary=[];
for(const state of ['NJ','MI']){
  const reportRoot=path.join(root,'nj-mi-research',state),report=JSON.parse(await readFile(path.join(reportRoot,'report.json'),'utf8'));
  assert.equal(report.state,state);assert.equal(report.metadata.origin.kind,'github_actions');
  assert.equal(report.metadata.origin.workflowRunId,args.run);assert.equal(report.metadata.origin.commitSha,args.commit);
  assert.equal(report.metadata.bibleRecordsSha256,digest);assert.equal(report.metadata.customerDeliveryAllowed,false);
  const reparsed=[];let requests=0;
  for(const receipt of report.metadata.receipts){
    assert.match(receipt.artifactPath,/^source-captures\/[A-Za-z0-9.-]+\.txt$/);
    const file=path.resolve(reportRoot,receipt.artifactPath);assert.ok(file.startsWith(reportRoot+path.sep));
    const bytes=await readFile(file);assert.equal(bytes.length,receipt.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
    assert.ok(Date.parse(receipt.requestedAt)>=Date.parse(report.startedAt)&&Date.parse(receipt.observedAt)<=Date.parse(report.finishedAt));
    const url=new URL(receipt.url),source=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.find(source=>source.state===state
      &&source.hostname===url.hostname&&source.merchantId===url.searchParams.get('merchant-id'));
    assert.ok(source,'Only exact reviewed merchant source URLs may enter this CityHive receipt proof');
    assert.equal(receipt.finalUrl,receipt.url);assert.equal(receipt.status,200);
    assert.equal(url.pathname,'/shop/');assert.equal(url.searchParams.get('ch-query'),source.prioritySearchTerm||'barrel proof');
    assert.equal([...url.searchParams].length,2);
    reparsed.push(...parseCentralCityHiveInventory(bytes.toString('utf8'),source,bible,{observedAt:receipt.observedAt}));requests++;
  }
  assert.equal(report.signals.length,reparsed.length);
  for(const row of report.signals){
    const expected=reparsed.find(candidate=>candidate.id===row.id);assert.ok(expected,'A reported row lacks matching raw first-party receipt evidence');
    for(const key of ['storeId','storeAddress','merchantId','productId','optionId','canonicalBottleId','canonicalName','rawName','price','observedAt','quantity','quantityIsExact'])assert.deepEqual(row[key],expected[key],key);
    assert.deepEqual({...row.sourceProductBinding,shadowOnly:undefined},{...expected.sourceProductBinding,shadowOnly:undefined});
    assert.equal(row.raw.shadowOnly,true);assert.equal(row.eligibleForOnSite,false);assert.equal(row.eligibleForDelivery,false);
    assert.equal(isNjMiResearchInventory(row,{nowMs:Date.parse(report.finishedAt)}),true);
    for(const mutate of [{storeAddress:'999 Other Street'},{merchantId:'wrong'},{productId:'wrong'},{quantity:1},
      {quantityIsExact:true},{sourceStale:true},{canonicalName:'Unreviewed expression'}])assert.equal(isNjMiResearchInventory({...row,...mutate},{nowMs:Date.parse(report.finishedAt)}),false);
  }
  summary.push({state,workflowRunId:args.run,sourceRequests:requests,qualifiedRows:reparsed.length,
    qualifiedPremises:new Set(reparsed.map(row=>row.storeId)).size,sourceClocks:reparsed.map(row=>row.observedAt),
    rawReceiptHashesVerified:true,rawIdentityReparsed:true,scope:'research_source_proof_not_customer_delivery',productionInactive:true});
}
await writeFile(path.join(root,'verified-research-captures.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
