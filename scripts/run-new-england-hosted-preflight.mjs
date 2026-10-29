import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {NEW_ENGLAND_RESEARCH_SOURCES,parseNewEnglandResearchInventory} from '../engine/src/collectors/new-england-research.mjs';
import {fetchReviewedCityHiveText,readCityHiveIncidentJournal,validateCityHiveIncidentJournal,persistCityHiveIncidentJournal,CITYHIVE_DENIAL_STATUSES} from '../engine/src/collectors/central-cityhive-transport.mjs';
import {sourceErrorForHttp} from '../engine/src/sources/source-error.mjs';

export async function runNewEnglandHostedPreflight(bible,{env=process.env,fetchText=fetchReviewedCityHiveText,signal,
  output=path.resolve('engine/out/new-england-source-preflight'),incidentDir=path.resolve('engine/out/source-incidents/new-england-cityhive'),
  persistJournal=persistCityHiveIncidentJournal}={}){
  if(env.BOURBON_SIGNAL_SHADOW_MODE!=='1')throw Error('Dedicated inactive research mode is required');
  const reports=[],observedHosts=new Set(),selected=[],rawRows=[];let attempted=0;
  for(const source of NEW_ENGLAND_RESEARCH_SOURCES){
    if(observedHosts.has(source.hostname))continue;
    observedHosts.add(source.hostname);selected.push(source.storeId);
    const file=path.join(incidentDir,source.state+'.json'),url=new URL(source.categoryUrl);
    url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
    const row={state:source.state,storeId:source.storeId,storeName:source.name,hostname:source.hostname,url:url.href,
      requestedAt:null,observedAt:null,status:null,qualifiedRows:0,attemptCount:0,sourceReceipt:null};
    let journal=await readCityHiveIncidentJournal(file,source.state,NEW_ENGLAND_RESEARCH_SOURCES),denied=false;
    if(journal.inFlight||journal.hosts[source.hostname]){
      reports.push({...row,heldForReview:true,reason:journal.inFlight?'unresolved_prior_attempt':'prior_http_denial',incident:journal.hosts[source.hostname]||journal.inFlight});continue;
    }
    signal?.throwIfAborted();row.requestedAt=new Date().toISOString();
    journal={...journal,inFlight:{attemptId:randomUUID(),startedAt:row.requestedAt}};
    await persistJournal(file,journal);
    const onResponse=async metadata=>{
      row.status=Number(metadata.status)||0;row.observedAt=new Date().toISOString();
      if(CITYHIVE_DENIAL_STATUSES.has(row.status)&&!denied){
        denied=true;const retry=Math.max(0,Number(metadata.retryAfterSeconds)||0),at=Date.parse(row.observedAt);
        const next={...journal,inFlight:null,hosts:{...journal.hosts,[source.hostname]:{httpStatus:row.status,
          lastAttemptAt:row.observedAt,nextAllowedAt:new Date(Math.min(8_640_000_000_000_000,Math.max(at+86_400_000,at+retry*1000))).toISOString()}}};
        try{await persistJournal(file,validateCityHiveIncidentJournal(next,source.state,NEW_ENGLAND_RESEARCH_SOURCES));journal=next;row.incidentPersisted=true;}
        catch(error){throw sourceErrorForHttp(row.status,'Denied source headers observed but journal write failed; durable unresolved latch blocks another attempt',{cause:error,details:{incidentWriteFailed:true,retryAfterSeconds:retry}});}
        throw sourceErrorForHttp(row.status,'Source denied the single hosted preflight; no alternate route or retry',{details:{incidentPersisted:true,retryAfterSeconds:retry}});
      }
    };
    try{
      attempted++;row.attemptCount=1;
      const response=await fetchText(url.href,{signal,reviewedSources:NEW_ENGLAND_RESEARCH_SOURCES,timeoutMs:10_000,maxBytes:2*1024*1024,onResponse});
      await onResponse(response);signal?.throwIfAborted();
      if(response.ok!==true||row.status!==200||response.url!==url.href)throw Error('No unredirected successful first-party response');
      const body=Buffer.from(response.text||'');if(body.length<1||body.length>2*1024*1024)throw Error('Body is empty or exceeds the source bound');
      const sha256=createHash('sha256').update(body).digest('hex'),artifactPath=`source-captures/${source.state}-${source.merchantId}-${sha256.slice(0,12)}.txt`;
      const parsed=parseNewEnglandResearchInventory(body.toString('utf8'),source,bible,{observedAt:row.observedAt});
      signal?.throwIfAborted();await mkdir(path.dirname(path.join(output,artifactPath)),{recursive:true});await writeFile(path.join(output,artifactPath),body);
      row.sourceReceipt={status:row.status,url:url.href,finalUrl:response.url,observedAt:row.observedAt,requestedAt:row.requestedAt,bytes:body.length,sha256,artifactPath};
      row.qualifiedRows=parsed.length;row.canonicalNames=[...new Set(parsed.map(row=>row.canonicalName))];rawRows.push(...parsed);
      journal={...journal,inFlight:null};await persistJournal(file,journal);
    }catch(error){
      row.error=error.message;row.status=Number(error.status)||row.status||0;
      if(!denied){journal={...journal,inFlight:null};await persistJournal(file,journal);}
    }
    reports.push(row);if(signal?.aborted)break;
  }
  const summary={schemaVersion:1,scope:'one_request_per_independent_host_research_preflight_not_complete_cohort_or_promotion',
    generatedAt:new Date().toISOString(),origin:env.GITHUB_ACTIONS==='true'?{kind:'github_actions',repository:env.GITHUB_REPOSITORY,
      workflowRunId:env.GITHUB_RUN_ID,commitSha:env.GITHUB_SHA,runAttempt:env.GITHUB_RUN_ATTEMPT||'1'}:{kind:'local_fixture_not_hosted_source_evidence'},
    candidatePremises:NEW_ENGLAND_RESEARCH_SOURCES.length,selectedPremises:selected,requestCount:attempted,
    successfulInventoryPremises:reports.filter(row=>row.status===200&&row.qualifiedRows>0).map(row=>row.storeId),
    uninspectedPremises:NEW_ENGLAND_RESEARCH_SOURCES.filter(source=>!selected.includes(source.storeId)).map(source=>source.storeId),
    reports,signals:rawRows,complete:false,promotionEligible:false,productionActivationAllowed:false,customerDeliveryAllowed:false};
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(summary,null,2)+'\n');
  return summary;
}
async function main(){
  const summary=await runNewEnglandHostedPreflight(await BourbonBible.load('engine/out/bourbon-bible.json'));
  console.log(JSON.stringify({scope:summary.scope,requestCount:summary.requestCount,inventoryPremises:summary.successfulInventoryPremises,
    uninspectedPremises:summary.uninspectedPremises,reports:summary.reports.map(row=>({store:row.storeName,status:row.status,attemptCount:row.attemptCount,rows:row.qualifiedRows,held:row.heldForReview||false})),complete:false,promotionEligible:false},null,2));
  if(summary.reports.some(row=>row.status!==200||row.qualifiedRows===0)||summary.successfulInventoryPremises.length===0)process.exitCode=1;
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
