import {createHash,randomBytes} from 'node:crypto';
import * as pilotReceiptModule from '../../src/lib/nationwide-pilot-receipt.ts';
const receiptRuntime = ((pilotReceiptModule as any).default || pilotReceiptModule) as typeof pilotReceiptModule;
const {cohortReceiptSources,signPilotReceipt,PILOT_RECEIPT_HEADER,PILOT_RECEIPT_CONTRACT} = receiptRuntime;
type Row=Record<string,any>;
type Read=(url:string,headers:Record<string,string>,limits:{maxBytes:number;timeoutMs:number})=>Promise<{status:number;body:Uint8Array}>;
export const COHORT_CAPTURE_LIMITS=Object.freeze({sources:5,tuples:50,requests:13,responseBytes:256*1024,schedulerBytes:1024*1024,totalBytes:4*1024*1024,outputBytes:8*1024*1024,requestMs:15000,totalMs:180000,clockSkewMs:5000});
const BASE='https://www.bourbonsignal.com';
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const closed=(v:Row,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const utc=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v?v:null;
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,180}$/.test(v)?v:null;
const number=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null;
const boolean=(v:unknown)=>typeof v==='boolean'?v:null;
const optionalClock=(v:unknown)=>v===null||v===undefined?null:utc(v)||'invalid';

export async function boundedProductionRead(url:string,headers:Record<string,string>,{maxBytes,timeoutMs}:{maxBytes:number;timeoutMs:number}){
  const u=new URL(url);if(u.origin!==BASE||!['/api/ops/health','/api/ops/source-scheduler','/api/drops','/api/coverage'].includes(u.pathname))throw Error('capture_scope');
  const response=await fetch(u,{method:'GET',headers:{...headers,Accept:'application/json','Cache-Control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  const reader=response.body?.getReader();if(!reader)throw Error('body_unavailable');const parts:Uint8Array[]=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw Error('body_limit');}parts.push(value);}
  return {status:response.status,body:Buffer.concat(parts)};
}

function schedulerProjection(payload:Row,sources:ReturnType<typeof cohortReceiptSources>){
  const ids=new Set(sources.map(s=>s.sourceId)),selected=(rows:unknown)=>Array.isArray(rows)?rows.filter(r=>r&&ids.has(r.source_id||r.sourceId)):[];
  return {enabled:payload.enabled===true,healthy:payload.healthy===true,
    jobs:selected(payload.jobs).map(r=>({sourceId:r.source_id,disabled:boolean(r.disabled),generation:number(Number(r.generation)),acceptedAt:utc(r.accepted_at),lastStartedAt:utc(r.last_started_at),lastCompletedAt:utc(r.last_completed_at),nextDueAt:utc(r.next_due_at),pausedUntil:optionalClock(r.paused_until),leaseUntil:optionalClock(r.lease_until),failures:number(r.failures),reason:id(r.last_reason),feedRows:number(r.feedRows),candidates:number(r.candidates)})),
    sourceHealth:(Array.isArray(payload.sourceHealth)?payload.sourceHealth:[]).filter(r=>r&&ids.has(r.source)).map(r=>({sourceId:r.source,status:id(r.status),acceptedAt:utc(r.acceptedAt),reason:id(r.reason)})),
    traces:selected(payload.traces).slice(0,40).map(r=>({sourceId:r.source_id,runId:id(r.run_id),generation:number(Number(r.generation)),dueAt:utc(r.due_at),startedAt:utc(r.started_at),finishedAt:utc(r.finished_at),status:id(r.status),accounting:{trigger:['scheduled','manual_or_rescue'].includes(r.accounting?.trigger)?r.accounting.trigger:'unknown',manualDueReset:boolean(r.accounting?.manualDueReset),baseline:boolean(r.accounting?.baseline),completeSnapshot:boolean(r.accounting?.completeSnapshot),elapsedMs:number(r.accounting?.elapsedMs),requestCount:number(r.accounting?.requestCount),bytes:number(r.accounting?.bytes),feed:number(r.accounting?.feed),candidates:number(r.accounting?.candidates)}})),
    pipeline:selected(payload.pipeline).map(r=>({sourceId:r.source_id,stage:id(r.stage),channel:id(r.channel),lastAt:utc(r.last_at),rowCount:number(Number(r.row_count))})),
    caveat:'Only selected public source scalars retained; raw scheduler body hash records acquisition, not reconstructable raw-body publication.'};
}

/** Bind the broad snapshot without rewriting either normal receipt. Feed adds
 * the exact mutable lane/poll overlay token; Coverage carries the broad ID. */
function sameBroadSnapshot(feed:Row,coverage:Row,expected:string){
  const prefix=expected+':source:';
  return coverage.snapshot===expected&&typeof feed.snapshot==='string'&&feed.snapshot.startsWith(prefix)
    &&/^(?:off|unavailable|[a-f0-9]{24}):[a-f0-9]{24}$/.test(feed.snapshot.slice(prefix.length));
}

function validateReceipt(p:Row,surface:string,source:ReturnType<typeof cohortReceiptSources>[number],requestStartedAt:string,receivedAt:string){
  if(!closed(p,['contractVersion','surface','sourceId','snapshot','receivedAt','total','identities'])||p.contractVersion!==PILOT_RECEIPT_CONTRACT||p.surface!==surface||p.sourceId!==source.sourceId
    ||typeof p.snapshot!=='string'||!id(p.snapshot)||!utc(p.receivedAt)||!Array.isArray(p.identities)||p.identities.length>200||p.total!==p.identities.length)throw Error('receipt_schema');
  if(Date.parse(p.receivedAt)<Date.parse(requestStartedAt)-COHORT_CAPTURE_LIMITS.clockSkewMs||Date.parse(p.receivedAt)>Date.parse(receivedAt)+COHORT_CAPTURE_LIMITS.clockSkewMs)throw Error('receipt_server_clock');
  const keys=['sourceId','runId','generation','state','storeId','canonicalBottleId','productId','variantId','observedAt'];
  if(p.identities.some((r:Row)=>!closed(r,keys)||r.sourceId!==source.sourceId||r.state!==source.state||!id(r.runId)||!Number.isSafeInteger(r.generation)||r.generation<=0||!utc(r.observedAt)
    ||Date.parse(r.observedAt)>Date.parse(p.receivedAt)||!source.bindings.some(b=>b.storeId===r.storeId&&b.productId===r.productId&&b.variantId===r.variantId&&b.canonicalBottleId===r.canonicalBottleId)))throw Error('receipt_identity');
  if(new Set(p.identities.map((r:Row)=>JSON.stringify([r.storeId,r.productId,r.variantId]))).size!==p.identities.length
    ||new Set(p.identities.map((r:Row)=>JSON.stringify([r.runId,r.generation]))).size>1)throw Error('receipt_duplicate_or_mixed_generation');
  return p;
}

/** Capture-only production reads. Registry authority is imported server code,
 * never source IDs/configuration supplied by workflow or URL arguments. */
export async function captureCohortReceipts({expectedCommit,producerCommit,producerRunId,observationId,key,secret,read=boundedProductionRead,now=Date.now}:{expectedCommit:string;producerCommit:string;producerRunId:string;observationId:string;key:string;secret:string;read?:Read;now?:()=>number}){
  const sources=cohortReceiptSources(),start=now();
  if(!/^[a-f0-9]{40}$/.test(expectedCommit)||producerCommit!==expectedCommit||!/^\d{1,20}$/.test(producerRunId)||!/^[A-Za-z0-9_-]{1,80}$/.test(observationId)||key.length<32||!secret
    ||!sources.length||sources.length>COHORT_CAPTURE_LIMITS.sources||sources.reduce((n,s)=>n+s.bindings.length,0)>COHORT_CAPTURE_LIMITS.tuples)throw Error('capture_prerequisite');
  const result:Row={contractVersion:'bourbon-signal/cohort-receipt-capture@1',capturedAt:new Date(start).toISOString(),expectedCommit,producerCommit,producerRunId,observationId,
    registry:sources,releaseBefore:null,releaseAfter:null,scheduler:null,receipts:[],pairs:[],errors:[],accounting:{requests:0,bytes:0,retries:0,redirects:0,merchantRequests:0},limits:COHORT_CAPTURE_LIMITS,
    admissions:[],activated:false,acceptedNewStores:0,caveats:['Normal customer-read telemetry may occur; this capture invokes no collection, rescue, monitor heartbeat or source mutation.','Receipt identities do not contain full cards, shelf count, customer details, provider delivery or exhaustive queue history.','Health/scheduler retain projected public scalars and raw response hashes; their omitted raw bodies cannot be reconstructed from these projections.','Capture integrity and matching rows do not grant source admission or independently count a new store.']};
  result.accounting.failedRequests=0;result.accounting.bytesScope='Complete returned response bodies only; failed-transfer bytes may be partial or unknown';
  async function get(url:string,headers:Record<string,string>,maxBytes:number,kind:string){
    const remaining=COHORT_CAPTURE_LIMITS.totalMs-(now()-start),budget=COHORT_CAPTURE_LIMITS.totalBytes-result.accounting.bytes;
    if(remaining<=0||budget<=0||result.accounting.requests>=13)throw Error('capture_budget');
    result.accounting.requests++;const requestStartedAt=new Date(now()).toISOString();
    const options={maxBytes:Math.min(maxBytes,budget),timeoutMs:Math.min(remaining,COHORT_CAPTURE_LIMITS.requestMs)};
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const r=await Promise.race([read(url,headers,options),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('read_timeout')),options.timeoutMs);})]);
      if(!(r.body instanceof Uint8Array)||r.body.byteLength>options.maxBytes)throw Error('response_bound');
      result.accounting.bytes+=r.body.byteLength;const body=Buffer.from(r.body),text=new TextDecoder('utf8',{fatal:true}).decode(body),payload=JSON.parse(text);
      return {url,status:r.status,requestStartedAt,receivedAt:new Date(now()).toISOString(),bytes:body.length,sha256:hash(body),kind,payload,text};
    }catch(error){result.accounting.failedRequests++;throw error;}finally{clearTimeout(timer);}
  }
  async function release(){
    const r=await get(BASE+'/api/ops/health',{},COHORT_CAPTURE_LIMITS.responseBytes,'release');
    if(![200,503].includes(r.status)||r.payload?.release?.status!=='healthy'||r.payload.release.commit!==expectedCommit||r.payload.release.environment!=='production'||!id(r.payload?.engine?.snapshotId))throw Error('release_identity');
    return {url:r.url,status:r.status,receivedAt:r.receivedAt,bytes:r.bytes,sha256:r.sha256,payload:{release:{status:'healthy',commit:expectedCommit,environment:'production'},engine:{snapshotId:r.payload.engine.snapshotId}}};
  }
  try{
    result.releaseBefore=await release();
    // read wins before monitor on old and new deployments; neither collection
    // nor monitor-heartbeat mutation is selected by this exact compatibility URL.
    const scheduler=await get(BASE+'/api/ops/source-scheduler?read=1&monitor=1',{authorization:`Bearer ${secret}`},COHORT_CAPTURE_LIMITS.schedulerBytes,'scheduler');
    if(scheduler.status!==200)throw Error('scheduler_unavailable');
    result.scheduler={url:scheduler.url,status:scheduler.status,receivedAt:scheduler.receivedAt,bytes:scheduler.bytes,sha256:scheduler.sha256,payload:schedulerProjection(scheduler.payload,sources)};
    for(const source of sources)for(const endpoint of ['drops','coverage']){
      const u=new URL('/api/'+endpoint,BASE);u.search=new URLSearchParams({state:source.state,limit:'1',source_receipt:source.sourceId,_bs_verify:`${now()}-${randomBytes(6).toString('hex')}`}).toString();
      try{
        const r=await get(String(u),{[PILOT_RECEIPT_HEADER]:signPilotReceipt(u,key,now())},COHORT_CAPTURE_LIMITS.responseBytes,endpoint);
        if(r.status!==200)throw Error('receipt_http');const p=validateReceipt(r.payload,endpoint==='drops'?'feed':'coverage',source,r.requestStartedAt,r.receivedAt);
        result.receipts.push({url:r.url,status:r.status,requestStartedAt:r.requestStartedAt,receivedAt:r.receivedAt,bytes:r.bytes,sha256:r.sha256,body:r.text,payload:p});
      }catch{result.errors.push({sourceId:source.sourceId,surface:endpoint,reason:'receipt_unavailable_or_invalid'});}
    }
    result.releaseAfter=await release();
    if(result.releaseBefore.payload.engine.snapshotId!==result.releaseAfter.payload.engine.snapshotId)result.errors.push({reason:'snapshot_changed_during_capture'});
    for(const source of sources){
      const receipts=result.receipts.filter((r:Row)=>r.payload.sourceId===source.sourceId),feed=receipts.find((r:Row)=>r.payload.surface==='feed')?.payload,coverage=receipts.find((r:Row)=>r.payload.surface==='coverage')?.payload;
      const identity=(p:Row)=>JSON.stringify(p.identities.map((r:Row)=>JSON.stringify(r)).sort());
      const current=(p:Row)=>p.identities.every((r:Row)=>Date.parse(r.observedAt)<=now()&&now()-Date.parse(r.observedAt)<=3600000);
      const matched=!!feed&&!!coverage&&feed.total>0&&identity(feed)===identity(coverage)&&current(feed)&&current(coverage)
        &&sameBroadSnapshot(feed,coverage,result.releaseBefore.payload.engine.snapshotId);
      const jobs=result.scheduler.payload.jobs.filter((r:Row)=>r.sourceId===source.sourceId),job=jobs.length===1?jobs[0]:null;
      const health=result.scheduler.payload.sourceHealth.filter((r:Row)=>r.sourceId===source.sourceId);
      const headHealthy=!!job&&result.scheduler.payload.enabled===true&&job.disabled===false&&job.failures===0&&job.reason==='accepted'
        &&job.acceptedAt&&job.lastStartedAt&&job.lastCompletedAt&&Date.parse(job.acceptedAt)<=now()&&now()-Date.parse(job.acceptedAt)<=source.expiryHours*3600000
        &&(!job.pausedUntil||Date.parse(job.pausedUntil)<=now())&&(!job.leaseUntil||Date.parse(job.leaseUntil)<=now())
        &&health.length===1&&health[0].status==='healthy'&&health[0].reason==='accepted'&&health[0].acceptedAt===job.acceptedAt;
      const traces=result.scheduler.payload.traces.filter((r:Row)=>r.sourceId===source.sourceId);
      const latest=traces.filter((r:Row)=>r.startedAt&&traces.every((other:Row)=>other.startedAt&&Date.parse(other.startedAt)<=Date.parse(r.startedAt)));
      const trace=latest.length===1?latest[0]:null;
      const scheduled=matched&&headHealthy&&trace&&trace.status==='accepted'&&trace.accounting.trigger==='scheduled'&&trace.accounting.manualDueReset===false
        &&trace.accounting.completeSnapshot===true&&trace.accounting.elapsedMs!==null&&trace.accounting.requestCount>0&&trace.accounting.bytes>0
        &&trace.dueAt&&trace.startedAt&&trace.finishedAt&&trace.startedAt===job.lastStartedAt&&trace.generation===job.generation
        &&Date.parse(trace.startedAt)>=Date.parse(trace.dueAt)&&Date.parse(trace.finishedAt)>=Date.parse(trace.startedAt)&&Date.parse(trace.finishedAt)<=now()
        &&Date.parse(job.acceptedAt)>=Date.parse(trace.startedAt)&&Date.parse(job.lastCompletedAt)>=Date.parse(trace.startedAt)
        &&Date.parse(job.acceptedAt)<=Date.parse(trace.finishedAt)&&Date.parse(job.lastCompletedAt)<=Date.parse(trace.finishedAt)
        &&feed.identities.every((identity:Row)=>identity.runId===trace.runId&&identity.generation===trace.generation
          &&Date.parse(identity.observedAt)>=Date.parse(trace.startedAt)-COHORT_CAPTURE_LIMITS.clockSkewMs
          &&Date.parse(identity.observedAt)<=Date.parse(trace.finishedAt)+COHORT_CAPTURE_LIMITS.clockSkewMs);
      const stores=[...new Set(source.bindings.map(b=>b.storeId))].map(storeId=>({storeId,normalFeedCoverageMatch:matched&&feed.identities.some((r:Row)=>r.storeId===storeId)}));
      result.pairs.push({sourceId:source.sourceId,normalFeedCoverageMatch:matched,stores,identities:feed?.total??0,currentSelectedHeadHealthy:!!headHealthy,scheduledRunMatch:!!scheduled,disabled:source.disabled});
    }
  }catch{result.errors.push({reason:'capture_release_scheduler_or_budget_failed'});}
  result.finishedAt=new Date(now()).toISOString();result.accounting.elapsedMs=now()-start;
  result.complete=result.errors.length===0&&result.receipts.length===sources.length*2&&result.releaseAfter!==null;
  result.allPairsMatch=result.complete&&result.pairs.every((p:Row)=>p.normalFeedCoverageMatch&&p.stores.every((s:Row)=>s.normalFeedCoverageMatch)&&p.scheduledRunMatch&&!p.disabled);
  if(Buffer.byteLength(JSON.stringify(result))>COHORT_CAPTURE_LIMITS.outputBytes)throw Error('capture_output_bound');
  return result;
}
