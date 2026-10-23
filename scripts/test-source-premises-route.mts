import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import * as opsAuthModule from '../src/lib/ops-auth.ts';
import * as premisesModule from '../src/lib/source-premises-baseline.ts';
const {authorizeOpsBearer}=((opsAuthModule as any).default || opsAuthModule) as typeof import('../src/lib/ops-auth.ts');
const {readSourcePremisesBaseline}=((premisesModule as any).default || premisesModule) as typeof import('../src/lib/source-premises-baseline.ts');

async function harness() {
  const calls = { queries:0, collections:0, monitors:0, lanePolls:0 }, env = { CRON_SECRET:'fixture-cron',SOURCE_SCHEDULER_SECRET:'fixture-source',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40) };
  const executor = { query: async () => { calls.queries++; return {rows:[{statement_at:new Date().toISOString(),heads:[],premises:[]}]}; } };
  let fail = false;
  const source = await readFile(new URL('../src/app/api/ops/source-scheduler/route.ts',import.meta.url),'utf8');
  const code = (await transform(source,{loader:'ts',format:'cjs',target:'node22'})).code;
  const requireStub = (name:string) => {
    if(name.includes('ops-auth'))return {authorizeOpsBearer,getDedicatedScorecardReadSecret:()=> 'fixture-read'};
    if(name.includes('source-premises-baseline'))return {readSourcePremisesBaseline:async (...args:Parameters<typeof readSourcePremisesBaseline>)=>{if(fail)throw Error('SECRET_FAILURE');return readSourcePremisesBaseline(...args);}};
    if(name.includes('alert-queue/runtime'))return {createProductionAlertQueueSqlExecutor:()=>executor};
    if(name.includes('source-lane-runtime'))return {pollRuntimeSourceLanes:()=>{calls.lanePolls++;}};
    if(name==='@/lib/source-lane')return {SOURCE_LANES:[]};
    if(name.includes('source-scheduler'))return {pollSourceRegistry:()=>[],sourceSchedulerHealth:()=>{calls.monitors++;},runSourceScheduler:()=>{calls.collections++;}};
    throw Error(`Unexpected import ${name}`);
  };
  const module={exports:{} as {GET:(request:Request)=>Promise<Response>}};
  new Function('require','module','exports','process',code)(requireStub,module,module.exports,{env});
  const get=(query:string,secret='fixture-read')=>module.exports.GET(new Request(`https://www.bourbonsignal.com/api/ops/source-scheduler${query}`,{headers:{authorization:`Bearer ${secret}`}}));
  return {get,calls,setFailure:()=>{fail=true;}};
}

test('all existing authorized read roles can obtain only sanitized premises without collection or monitor writes',async()=>{
  const h=await harness();
  for(const secret of ['fixture-read','fixture-source','fixture-cron']) {
    const response=await h.get('?read=1&premises=1',secret),body=await response.json();
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(body.contractVersion,'bourbon-signal/source-premises-baseline@1');assert.equal(body.releaseCommit,'a'.repeat(40));
    assert.deepEqual(body.premises,[]);assert.equal(body.completeness.historicalAbsenceProven,false);
  }
  assert.deepEqual(h.calls,{queries:3,collections:0,monitors:0,lanePolls:0});
});
test('unauthorized requests cannot touch SQL or trigger a fallback',async()=>{
  const h=await harness();assert.equal((await h.get('?read=1&premises=1','wrong')).status,401);
  assert.deepEqual(h.calls,{queries:0,collections:0,monitors:0,lanePolls:0});
});
for(const query of ['?premises=1','?read=0&premises=1','?read=1&premises=0','?read=1&premises=1&monitor=1','?read=1&premises=1&source=private',
  '?read=1&read=1&premises=1','?read=1&premises=1&premises=1'])test(`invalid premises query cannot become collection: ${query}`,async()=>{
  const h=await harness();assert.equal((await h.get(query,'fixture-cron')).status,400);
  assert.deepEqual(h.calls,{queries:0,collections:0,monitors:0,lanePolls:0});
});
test('database failure exports no partial baseline or private error and never starts recovery',async()=>{
  const h=await harness();h.setFailure();const response=await h.get('?read=1&premises=1');
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SECRET/);
  assert.deepEqual(h.calls,{queries:0,collections:0,monitors:0,lanePolls:0});
});
