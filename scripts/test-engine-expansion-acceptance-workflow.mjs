import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateAcceptanceWorkflowInputs,validateBaselineWorkflowRun,validateBaselineArtifact,ACCEPTANCE_WORKFLOW_PATH} from './engine-expansion-acceptance-workflow-policy.mjs';
import {reviewedActiveGroceryCohort,reviewedAdditionsWithinActiveCohort,partitionCandidatePremises} from './engine-expansion-delivery-policy.mjs';
const commit='a'.repeat(40),context={repository:'tarsagent22/Bourbon-Signal',event:'workflow_dispatch',ref:'refs/heads/main',sha:commit,currentMain:commit,runId:'300'};
const input={mode:'verify',expectedCommit:commit,cohort:'active-CA-NV-IL',minimum:'100',baselineRunId:'100',refreshRunId:'200'};
const run={id:100,repository:{full_name:context.repository},head_repository:{full_name:context.repository},path:ACCEPTANCE_WORKFLOW_PATH,workflow_id:5,event:'workflow_dispatch',head_branch:'main',head_sha:commit,status:'completed',conclusion:'success'};
const artifact={id:10,name:'engine-expansion-baseline-100',expired:false,size_in_bytes:1000,digest:'sha256:'+'b'.repeat(64)};

test('official current-main baseline/verify requests and exact successful baseline artifact are accepted',()=>{
 assert.equal(validateAcceptanceWorkflowInputs(input,context),true);
 assert.equal(validateAcceptanceWorkflowInputs({...input,mode:'baseline',baselineRunId:'',refreshRunId:''},context),true);
 assert.equal(validateBaselineWorkflowRun(run,{expectedCommit:commit,workflowId:5,baselineRunId:'100'}),true);
 assert.equal(validateBaselineArtifact([artifact],'100'),artifact);
});
test('unreviewed refs, stale heads, low targets and shell/path-shaped run IDs fail closed',()=>{
 for(const mutation of [{ref:'refs/heads/research'},{event:'pull_request'},{repository:'fork/Bourbon-Signal'},{currentMain:'c'.repeat(40)}])assert.throws(()=>validateAcceptanceWorkflowInputs(input,{...context,...mutation}));
 for(const mutation of [{expectedCommit:'main'},{minimum:'99'},{minimum:'100.5'},{minimum:'1e3'},{minimum:'100;echo bad'},{baselineRunId:'../100'},{baselineRunId:'301'},{baselineRunId:'200'},{refreshRunId:'200$(bad)'},{cohort:'WA'}])assert.throws(()=>validateAcceptanceWorkflowInputs({...input,...mutation},context));
});
test('foreign workflow provenance, failed runs, expired or undigested/duplicate archives are rejected',()=>{
 for(const mutation of [{head_sha:'c'.repeat(40)},{workflow_id:6},{path:'.github/workflows/research.yml'},{head_branch:'feature'},{event:'pull_request'},{conclusion:'failure'},{status:'in_progress'},{head_repository:{full_name:'fork/Bourbon-Signal'}}])assert.throws(()=>validateBaselineWorkflowRun({...run,...mutation},{expectedCommit:commit,workflowId:5,baselineRunId:'100'}));
 for(const candidates of [[{...artifact,expired:true}],[{...artifact,digest:''}],[artifact,{...artifact,id:11}],[{...artifact,size_in_bytes:300*1024*1024}]])assert.throws(()=>validateBaselineArtifact(candidates,'100'));
});
test('optional IL cohort retains exact coordinates and cannot admit WA or foreign coordinates',()=>{
 const il={id:'jewelosco-il-3294',name:'Jewel-Osco #3294',stateCode:'IL',banner:'jewelosco',host:'www.jewelosco.com',merchantId:'3294',storeId:'jewelosco:3294',address:'140 W Lake St, Addison, IL 60101',city:'Addison',lat:41.9349175,lng:-87.9925583};
 assert.equal(reviewedActiveGroceryCohort({california:[],nevada:[],illinois:[il]})[0].lng,il.lng);
 assert.throws(()=>reviewedActiveGroceryCohort({california:[],nevada:[],illinois:[{...il,stateCode:'WA'}]}));
 assert.throws(()=>reviewedActiveGroceryCohort({california:[],nevada:[],illinois:[{...il,lng:-120}]}));
 const key=r=>r.state+'|'+(r.storeAddress||r.address),store=reviewedActiveGroceryCohort({california:[],nevada:[],illinois:[il]})[0];
 const result=partitionCandidatePremises([store],{baselineRows:[{...store,storeId:'legacy-alias'}],currentRows:[store],premiseKey:key,isEligible:()=>true});
 assert.equal(result.candidates.length,0);assert.equal(result.excluded[0].reason,'already_in_latest_released_artifact');
});
test('workflow uses main-only official dispatch, read permissions, protected secrets and no publishing commands',async()=>{
 const yaml=await readFile(new URL('../.github/workflows/verify-engine-expansion-delivery.yml',import.meta.url),'utf8');
 assert.match(yaml,/if: github.ref == 'refs\/heads\/main'/);assert.match(yaml,/contents: read/);assert.match(yaml,/actions: read/);
 assert.match(yaml,/environment: production/);assert.match(yaml,/persist-credentials: false/);assert.match(yaml,/npm ci --ignore-scripts/);
 assert.doesNotMatch(yaml,/gh workflow run|git push|put\(|activate.*snapshot|run:.*publish/i);
});

test('restored preconfigured stores cannot inflate the explicit new-addition minimum',()=>{
 const existing={state:'CA',storeId:'safeway:100',sourceId:'existing-source',name:'Existing store',address:'100 Existing St, City, CA 90001',city:'City',lat:34,lng:-118};
 const addition={...existing,storeId:'safeway:200',sourceId:'reviewed-new-source',name:'Reviewed addition',address:'200 New St, City, CA 90001'};
 const target=reviewedAdditionsWithinActiveCohort({active:[existing,addition],additions:[addition]});
 const key=row=>row.state+'|'+(row.storeAddress||row.address);
 const result=partitionCandidatePremises(target,{baselineRows:[],currentRows:[existing,addition],premiseKey:key,isEligible:()=>true});
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].store.storeId,addition.storeId);
 const restoredOnly=partitionCandidatePremises(target,{baselineRows:[],currentRows:[existing],premiseKey:key,isEligible:()=>true});assert.equal(restoredOnly.candidates.length,0);
});
test('unknown, changed or duplicate reviewed additions fail exact closed-registry binding',()=>{
 const store={state:'IL',storeId:'jewelosco:3294',sourceId:'jewelosco-il-3294',name:'Jewel-Osco #3294',address:'140 W Lake St, Addison, IL 60101',city:'Addison',lat:41.9349175,lng:-87.9925583};
 for(const additions of [[{...store,storeId:'jewelosco:999999'}],[{...store,sourceId:'unknown'}],[{...store,lat:42}],[{...store,address:'Another street'}],[store,{...store}]])assert.throws(()=>reviewedAdditionsWithinActiveCohort({active:[store],additions}));
 assert.throws(()=>reviewedAdditionsWithinActiveCohort({active:[store],additions:[]}));
});
