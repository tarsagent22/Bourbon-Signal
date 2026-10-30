import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

export const REPOSITORY='tarsagent22/Bourbon-Signal';
export const REFRESH={id:311991230,path:'.github/workflows/refresh-feed.yml'};
export const PATHS={production:'.github/workflows/refresh-continuation.yml',smoke:'.github/workflows/refresh-continuation-smoke-relay.yml',producer:'.github/workflows/refresh-continuation-smoke.yml'};
export const ENVIRONMENTS={production:'inventory-refresh-continuation-paced',immediate:'inventory-refresh-continuation-smoke-zero',paced:'inventory-refresh-continuation-smoke-paced'};
export const DEFAULT_INPUTS=Object.freeze({force_all_states:'false',states:'',sources:'',va_required_store_id:'',recovery_attempt:'0'});
const ACTIVE=['in_progress','queued','pending','waiting','requested'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const id=value=>/^[1-9][0-9]{0,15}$/.test(String(value||''))&&Number.isSafeInteger(Number(value));
const fail=reason=>{throw Object.assign(Error(reason),{code:reason});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pathOf=run=>String(run?.path||'').split('@')[0];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function trustedRun(run,target,currentSha,{success=true}={}){
 return id(run?.id)&&run.workflow_id===target.id&&pathOf(run)===target.path&&run.head_branch==='main'
  &&run.head_sha===currentSha&&run.head_repository?.full_name===REPOSITORY&&run.repository?.full_name===REPOSITORY
  &&run.run_attempt===1&&(!success||(run.status==='completed'&&run.conclusion==='success'));
}
export function validateTimer(environment,name,minutes){
 if(environment?.name!==name||!Array.isArray(environment.protection_rules))return false;
 const timers=environment.protection_rules.filter(rule=>rule.type==='wait_timer');
 return minutes===0?timers.length===0:timers.length===1&&timers[0].wait_timer===minutes;
}
export function commonDecision(s){
 if(s.repository!==REPOSITORY||s.branch!=='main'||s.attempt!==1)return 'untrusted_repository_ref_or_rerun';
 if(s.enabled!=='1'||s.maintenance!=='0')return 'feature_off_or_maintenance';
 if(!/^[a-f0-9]{40}$/.test(s.currentSha||'')||s.relaySha!==s.currentSha)return 'superseded_relay';
 if(s.relay?.state!=='active'||s.target?.state!=='active')return 'workflow_disabled';
 if(s.relay?.path!==PATHS[s.mode]||!id(s.relay?.id)||!id(s.target?.id))return 'unexpected_workflow';
 if(!validateTimer(s.environment,s.environmentName,s.waitMinutes))return 'missing_or_wrong_wait_environment';
 if(s.activeRuns?.some(run=>ACTIVE.includes(run.status)))return 'refresh_already_active_or_queued';
 if(s.historyTruncated)return 'unknown_run_history';
 if(s.recentRuns?.some(run=>run.id!==s.source?.id&&Date.parse(run.created_at)>=Date.parse(s.source?.created_at)))return 'newer_refresh_exists';
 if(!Number.isFinite(s.nowMs)||!Number.isFinite(Date.parse(s.source?.created_at))||!Number.isFinite(Date.parse(s.source?.updated_at))
  ||s.nowMs<Date.parse(s.source.updated_at)||s.nowMs-Date.parse(s.source.updated_at)>7200000)return 'stale_or_unknown_producer_clock';
 return null;
}
export function productionDecision(s){
 const reason=commonDecision(s);if(reason)return{continue:false,reason};
 if(s.target.id!==REFRESH.id||s.target.path!==REFRESH.path||!trustedRun(s.source,REFRESH,s.currentSha))return{continue:false,reason:'untrusted_or_failed_producer'};
 if(!['schedule','workflow_dispatch'].includes(s.source.event))return{continue:false,reason:'unknown_source_event'};
 if(s.eventName==='workflow_dispatch'){
  if(s.sender!=='tarsagent22'||String(s.inputs.accepted_run_id)!==String(s.source.id)||s.inputs.accepted_full_fleet_snapshot!=='true')
   return{continue:false,reason:'manual_full_fleet_acceptance_required'};
 }else if(s.eventName==='workflow_run'){
  if(s.source.event!=='schedule'&&!(s.source.event==='workflow_dispatch'&&s.verifiedLineage===true))
   return{continue:false,reason:'unknown_or_targeted_scope'};
 }else return{continue:false,reason:'unknown_source_event'};
 return{continue:true,reason:'successful_default_adaptive_producer',mode:'production',sourceRunId:s.source.id,
  mainSha:s.currentSha,environment:s.environmentName,waitMinutes:15,targetId:REFRESH.id,inputs:DEFAULT_INPUTS};
}
export function smokeDecision(s){
 const reason=commonDecision(s);if(reason)return{continue:false,reason};
 const m=s.marker;
 if(s.eventName!=='workflow_run'||s.target.id===REFRESH.id||s.target.path!==PATHS.producer||!trustedRun(s.source,s.target,s.currentSha)
  ||m?.schemaVersion!==1||m.kind!=='no_retailer_smoke'||m.sourceRunId!==s.source.id||m.mainSha!==s.currentSha
  ||!['immediate','paced'].includes(m.pacing)||!/^[a-f0-9]{32}$/.test(m.chainId||'')||!Number.isSafeInteger(m.cycle)||m.cycle<1)
  return{continue:false,reason:'untrusted_smoke_producer'};
 const limit=m.pacing==='immediate'?5:2;
 if(m.cycle>limit)return{continue:false,reason:'unbounded_smoke_cycle'};
 if(m.cycle>=limit)return{continue:false,reason:'bounded_smoke_completed',completedCycles:m.cycle,chainId:m.chainId,sourceRunId:s.source.id,mainSha:s.currentSha};
 return{continue:true,reason:'bounded_no_retailer_smoke',mode:'smoke',sourceRunId:s.source.id,mainSha:s.currentSha,
  environment:s.environmentName,waitMinutes:m.pacing==='paced'?15:0,targetId:s.target.id,
  chainId:m.chainId,cycle:m.cycle+1,pacing:m.pacing};
}

// Read exactly one small JSON entry; never extract artifacts or execute their contents.
export function readSmallZip(bytes,name){
 if(bytes.length>262144)fail('oversized_receipt_archive');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+10)!==1)fail('receipt_archive_entry_count');
 const offset=bytes.readUInt32LE(end+16);
 if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)fail('receipt_archive_directory');
 const method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),size=bytes.readUInt32LE(offset+24),length=bytes.readUInt16LE(offset+28),local=bytes.readUInt32LE(offset+42);
 if(bytes.readUInt16LE(offset+8)&1||size>65536||compressed>131072||![0,8].includes(method)||bytes.subarray(offset+46,offset+46+length).toString()!==name
  ||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)fail('unsafe_receipt_archive');
 const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
 if(start+compressed>offset)fail('receipt_archive_bounds');
 const input=bytes.subarray(start,start+compressed),body=method===0?input:inflateRawSync(input,{maxOutputLength:65536});
 if(body.length!==size)fail('receipt_archive_size');
 return JSON.parse(body.toString('utf8'));
}

export function githubClient(token,{fetchImpl=fetch}={}){
 let calls=0;const boundedFetch=(...args)=>{if(++calls>60)fail('github_request_budget_exhausted');return fetchImpl(...args);};
 const request=async(path,{method='GET',body}={})=>{
  if(!path.startsWith(`/repos/${REPOSITORY}/`))fail('foreign_github_api_path');
  const response=await boundedFetch('https://api.github.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2026-03-10',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)fail('github_http_'+response.status);
  if(method==='POST'&&response.status!==200)fail('dispatch_outcome_unknown');
  return response.status===204?null:response.json();
 };
 return{get:path=>request(path),post:(path,body)=>request(path,{method:'POST',body}),download:async path=>{
  if(!new RegExp(`^/repos/${REPOSITORY}/actions/artifacts/[0-9]+/zip$`).test(path))fail('foreign_artifact_path');
  const response=await boundedFetch('https://api.github.com'+path,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token}});
  const url=new URL(response.headers.get('location')||'https://invalid.invalid');
  if(response.status!==302||url.protocol!=='https:'||url.username||url.password||!url.hostname.endsWith('.blob.core.windows.net'))fail('unsafe_artifact_redirect');
  const result=await boundedFetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!result.ok||Number(result.headers.get('content-length'))>262144)fail('receipt_download_failed');
  const chunks=[];let count=0;for await(const part of result.body){count+=part.length;if(count>262144)fail('oversized_receipt_archive');chunks.push(part);}
  return Buffer.concat(chunks);
 }};
}
const repoPath=tail=>`/repos/${REPOSITORY}/${tail}`;
export async function receiptArtifact(api,run,name,file){
 const list=await api.get(repoPath(`actions/runs/${run.id}/artifacts?per_page=100`));
 if(list.total_count>100)fail('unknown_artifact_history');
 const matches=list.artifacts.filter(row=>row.name===name&&row.expired===false);
 if(matches.length!==1)fail('missing_or_ambiguous_receipt');
 const a=matches[0];if(!/^sha256:[a-f0-9]{64}$/.test(a.digest||'')||a.size_in_bytes>262144||a.workflow_run?.id!==run.id||a.workflow_run?.head_sha!==run.head_sha)fail('untrusted_receipt_origin');
 const bytes=await api.download(repoPath(`actions/artifacts/${a.id}/zip`));if('sha256:'+sha(bytes)!==a.digest)fail('receipt_zip_digest_mismatch');
 return readSmallZip(bytes,file);
}
async function completedIssuer(api,runId,workflow,currentSha){
 for(let i=0;i<6;i++){
  const run=await api.get(repoPath(`actions/runs/${runId}`));
  if(trustedRun(run,workflow,currentSha))return run;
  if(run.status!=='in_progress'&&run.status!=='queued')break;
  if(i<5)await delay(2000);
 }
 fail('untrusted_or_incomplete_receipt_issuer');
}
async function verifiedLineage(api,source,relay,currentSha){
 const match=/^Inventory recovery continuation-v1-([1-9][0-9]*)-([1-9][0-9]*)$/.exec(source.display_title||'');
 if(!match||source.actor?.login!=='github-actions[bot]'||source.triggering_actor?.login!=='github-actions[bot]')return false;
 const issuer=await completedIssuer(api,match[1],relay,currentSha);
 const receipt=await receiptArtifact(api,issuer,`refresh-continuation-receipt-${issuer.id}`,'continuation-receipt.json');
 return receipt.schemaVersion===1&&receipt.status==='dispatched'&&receipt.mode==='production'&&receipt.relayRunId===issuer.id
  &&receipt.sourceRunId===Number(match[2])&&receipt.targetRunId===source.id&&receipt.mainSha===currentSha&&receipt.targetId===REFRESH.id
  &&receipt.environment===ENVIRONMENTS.production&&receipt.waitMinutes===15&&receipt.elapsedWaitMs>=900000
  &&same(receipt.inputs,{...DEFAULT_INPUTS,incident_key:`continuation-v1-${issuer.id}-${match[2]}`});
}

export async function snapshot({api,event,eventName,env,mode,nowMs=Date.now()}){
 const enabled=mode==='production'?env.CONTINUATION_ENABLED:env.CONTINUATION_SMOKE_ENABLED;
 if(enabled!=='1'||env.CONTINUATION_MAINTENANCE!=='0')return{mode,repository:env.GITHUB_REPOSITORY,branch:'main',attempt:Number(env.GITHUB_RUN_ATTEMPT),enabled,maintenance:env.CONTINUATION_MAINTENANCE};
 if(env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||Number(env.GITHUB_RUN_ATTEMPT)!==1
  ||env.GITHUB_WORKFLOW_REF!==`${REPOSITORY}/${PATHS[mode]}@refs/heads/main`)fail('untrusted_relay_context');
 const currentSha=(await api.get(repoPath('git/ref/heads/main'))).object.sha;
 const relay=await api.get(repoPath('actions/workflows/'+PATHS[mode].split('/').at(-1)));
 const target=mode==='production'?await api.get(repoPath('actions/workflows/311991230')):await api.get(repoPath('actions/workflows/refresh-continuation-smoke.yml'));
 const sourceId=eventName==='workflow_dispatch'?event.inputs?.accepted_run_id:event.workflow_run?.id;
 if(!id(sourceId))fail('missing_producer_run');
 const source=await api.get(repoPath(`actions/runs/${sourceId}`));
 if(eventName==='workflow_run'&&(event.action!=='completed'||event.repository?.full_name!==REPOSITORY||event.workflow_run?.workflow_id!==target.id))fail('untrusted_trigger_payload');
 let marker,verified=false;
 if(mode==='smoke')marker=await receiptArtifact(api,source,`refresh-continuation-smoke-${source.id}`,'smoke-marker.json');
 else if(source.event==='workflow_dispatch'&&eventName==='workflow_run')verified=await verifiedLineage(api,source,relay,currentSha);
 const environmentName=mode==='production'?ENVIRONMENTS.production:ENVIRONMENTS[marker?.pacing];
 if(!environmentName)fail('unknown_smoke_pacing');
 const environment=await api.get(repoPath('environments/'+environmentName));
 const activeRuns=[];let historyTruncated=false;
 for(const status of ACTIVE){const page=await api.get(repoPath(`actions/workflows/${target.id}/runs?branch=main&status=${status}&per_page=100`));historyTruncated||=page.total_count>100;activeRuns.push(...page.workflow_runs);}
 const recent=await api.get(repoPath(`actions/workflows/${target.id}/runs?branch=main&per_page=10`));
 return{mode,repository:env.GITHUB_REPOSITORY,branch:'main',attempt:Number(env.GITHUB_RUN_ATTEMPT),enabled,maintenance:env.CONTINUATION_MAINTENANCE,
  currentSha,relaySha:env.GITHUB_SHA,relay,target,source,eventName,sender:event.sender?.login,inputs:event.inputs||{},marker,verifiedLineage:verified,
  environmentName,environment,waitMinutes:mode==='production'||marker?.pacing==='paced'?15:0,activeRuns,recentRuns:recent.workflow_runs,historyTruncated,nowMs};
}

export async function dispatchOnce({api,plan,relayRunId,persist}){
 if(!id(relayRunId)||!id(plan.sourceRunId)||!id(plan.targetId)||!['production','smoke'].includes(plan.mode)
  ||(plan.mode==='production'&&(plan.targetId!==REFRESH.id||plan.waitMinutes!==15||plan.environment!==ENVIRONMENTS.production))
  ||(plan.mode==='smoke'&&(plan.targetId===REFRESH.id||!/^[a-f0-9]{32}$/.test(plan.chainId||'')||!['immediate','paced'].includes(plan.pacing)
   ||plan.environment!==ENVIRONMENTS[plan.pacing]||plan.waitMinutes!==(plan.pacing==='paced'?15:0)||!Number.isSafeInteger(plan.cycle)||plan.cycle<2||plan.cycle>(plan.pacing==='paced'?2:5))))fail('unreviewed_dispatch_target');
 const inputs=plan.mode==='production'?{...DEFAULT_INPUTS,incident_key:`continuation-v1-${relayRunId}-${plan.sourceRunId}`}:
  {chain_id:plan.chainId,cycle:String(plan.cycle),pacing:plan.pacing,relay_run_id:String(relayRunId),confirm_smoke_only:'true'};
 const receipt={schemaVersion:1,...plan,relayRunId,inputs,status:'dispatch_intent',targetRunId:null};
 await persist(receipt); // Local evidence only; uploaded after POST. Attempt=1 is the rerun boundary, not a remote transaction.
 try{
  const result=await api.post(repoPath(`actions/workflows/${plan.targetId}/dispatches`),{ref:'main',inputs});
  if(!id(result?.workflow_run_id))fail('dispatch_outcome_unknown');
  receipt.targetRunId=Number(result.workflow_run_id);receipt.status='dispatched';await persist(receipt);return receipt;
 }catch(error){receipt.status='dispatch_outcome_unknown';receipt.reason=error.code||'dispatch_transport_or_persistence_error';await persist(receipt);throw error;}
}

export async function produceSmoke({api,event,env}){
 if(env.CONTINUATION_SMOKE_ENABLED!=='1'||env.CONTINUATION_MAINTENANCE!=='0')fail('smoke_feature_off');
 if(env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||Number(env.GITHUB_RUN_ATTEMPT)!==1
  ||env.GITHUB_WORKFLOW_REF!==`${REPOSITORY}/${PATHS.producer}@refs/heads/main`)fail('untrusted_smoke_context');
 const input=event.inputs||{},cycle=Number(input.cycle),pacing=input.pacing;
 if(!/^[a-f0-9]{32}$/.test(input.chain_id||'')||!['immediate','paced'].includes(pacing)||!Number.isSafeInteger(cycle)||cycle<1||cycle>(pacing==='immediate'?5:2)||input.confirm_smoke_only!=='true')fail('unbounded_or_unconfirmed_smoke');
 const currentSha=(await api.get(repoPath('git/ref/heads/main'))).object.sha;
 if(currentSha!==env.GITHUB_SHA)fail('superseded_smoke');
 const target=await api.get(repoPath('actions/workflows/refresh-continuation-smoke.yml'));
 if(target.id===REFRESH.id||target.path!==PATHS.producer||target.state!=='active')fail('smoke_workflow_disabled_or_untrusted');
 if(cycle===1){if(event.sender?.login!=='tarsagent22'||input.relay_run_id)fail('untrusted_smoke_seed');}
 else{
  if(event.sender?.login!=='github-actions[bot]'||!id(input.relay_run_id))fail('untrusted_smoke_hop');
  const relay=await api.get(repoPath('actions/workflows/refresh-continuation-smoke-relay.yml'));
  const issuer=await completedIssuer(api,input.relay_run_id,relay,currentSha),receipt=await receiptArtifact(api,issuer,`refresh-continuation-receipt-${issuer.id}`,'continuation-receipt.json');
  if(receipt.schemaVersion!==1||receipt.relayRunId!==issuer.id||receipt.status!=='dispatched'||receipt.mode!=='smoke'||receipt.targetId!==target.id
   ||receipt.targetRunId!==Number(env.GITHUB_RUN_ID)||receipt.chainId!==input.chain_id||receipt.cycle!==cycle||receipt.pacing!==pacing||receipt.mainSha!==currentSha
   ||receipt.environment!==ENVIRONMENTS[pacing]||receipt.waitMinutes!==(pacing==='paced'?15:0)||!Number.isFinite(receipt.elapsedWaitMs)
   ||receipt.elapsedWaitMs<(pacing==='paced'?900000:0)||receipt.elapsedWaitMs>7200000
   ||!same(receipt.inputs,{chain_id:input.chain_id,cycle:String(cycle),pacing,relay_run_id:String(issuer.id),confirm_smoke_only:'true'}))fail('unverified_smoke_hop');
 }
 return{schemaVersion:1,kind:'no_retailer_smoke',sourceRunId:Number(env.GITHUB_RUN_ID),mainSha:currentSha,chainId:input.chain_id,cycle,pacing,producedAt:new Date().toISOString()};
}

export function validateWait(old,decision,runId,nowMs=Date.now()){
 const elapsed=nowMs-Date.parse(old?.plannedAt);
 if(old?.schemaVersion!==1||old.relayRunId!==runId||old.mainSha!==decision.mainSha||old.sourceRunId!==decision.sourceRunId||old.mode!==decision.mode
  ||old.environment!==decision.environment||old.waitMinutes!==decision.waitMinutes||!Number.isFinite(elapsed)||elapsed<decision.waitMinutes*60000||elapsed>7200000)fail('unverified_or_unelapsed_wait');
 return elapsed;
}
export async function main({env=process.env,event,api,args=process.argv.slice(2)}={}){
 const mode=args.find(x=>x.startsWith('--mode='))?.split('=')[1],phase=args.find(x=>x.startsWith('--phase='))?.split('=')[1];
 if(!['production','smoke','producer'].includes(mode)||!['plan','dispatch','produce'].includes(phase))fail('unknown_continuation_operation');
 if((mode==='producer')!==(phase==='produce'))fail('unknown_continuation_operation');
 event||=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8'));api||=githubClient(env.GITHUB_TOKEN);
 const dir='.operator/refresh-continuation';await mkdir(dir,{recursive:true});
 const persist=receipt=>writeFile(dir+'/continuation-receipt.json',JSON.stringify(receipt,null,2)+'\n');
 if(mode==='producer'){if(phase!=='produce'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')fail('unknown_smoke_operation');await writeFile(dir+'/smoke-marker.json',JSON.stringify(await produceSmoke({api,event,env}),null,2)+'\n');return;}
 const s=await snapshot({api,event,eventName:env.GITHUB_EVENT_NAME,env,mode}),decision=mode==='production'?productionDecision(s):smokeDecision(s);
 if(phase==='plan'){
  const plan={schemaVersion:1,...decision,mode,relayRunId:Number(env.GITHUB_RUN_ID),plannedAt:new Date().toISOString()};
  await writeFile(dir+'/continuation-plan.json',JSON.stringify(plan,null,2)+'\n');
  await appendFile(env.GITHUB_OUTPUT,`continue=${decision.continue===true}\nenvironment=${decision.continue?decision.environment:''}\n`);
  console.log(JSON.stringify({continue:decision.continue,reason:decision.reason}));return plan;
 }
 if(!decision.continue){await persist({schemaVersion:1,status:'stopped',mode,reason:decision.reason});return;}
 const own=await api.get(repoPath(`actions/runs/${env.GITHUB_RUN_ID}`));
 if(!trustedRun(own,s.relay,s.currentSha,{success:false}))fail('untrusted_current_relay');
 const old=await receiptArtifact(api,own,`refresh-continuation-plan-${own.id}`,'continuation-plan.json');
 const elapsed=validateWait(old,decision,own.id);
 const receipt=await dispatchOnce({api,plan:{...decision,plannedAt:old.plannedAt,elapsedWaitMs:elapsed},relayRunId:own.id,persist});
 console.log(JSON.stringify({status:receipt.status,targetRunId:receipt.targetRunId,elapsedWaitMs:elapsed}));return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error('Continuation stopped: '+(error.code||'guard_or_provider_error'));process.exitCode=1;});
