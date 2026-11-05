const assert=(ok,message)=>{if(!ok)throw Error(message);};
const numeric=value=>/^[1-9]\d{0,19}$/.test(String(value||''));
export const ACCEPTANCE_WORKFLOW_PATH='.github/workflows/verify-engine-expansion-delivery.yml';
export function validateAcceptanceWorkflowInputs(input,context){
 assert(context.repository==='tarsagent22/Bourbon-Signal'&&context.event==='workflow_dispatch'&&context.ref==='refs/heads/main','Read-only acceptance runs only by manual dispatch on the official main');
 assert(/^[a-f0-9]{40}$/.test(input.expectedCommit||'')&&input.expectedCommit===context.sha&&context.sha===context.currentMain,'Expected commit must equal checkout, workflow head and current main');
 assert(['baseline','verify'].includes(input.mode),'Unknown acceptance mode');
 assert(['active-CA-NV','active-CA-NV-IL'].includes(input.cohort),'Unknown active cohort');
 assert(/^\d+$/.test(input.minimum||'')&&Number.isSafeInteger(Number(input.minimum))&&Number(input.minimum)>=100&&Number(input.minimum)<=10000,'Minimum must be an integer from100 through10000');
 assert(numeric(context.runId),'Official workflow run identity required');
 if(input.mode==='baseline')assert(!input.baselineRunId&&!input.refreshRunId,'Baseline mode does not accept supplied source runs');
 else{
  assert(numeric(input.baselineRunId)&&numeric(input.refreshRunId),'Verify mode requires fixed numeric baseline and refresh runs');
  assert(BigInt(input.baselineRunId)<BigInt(context.runId)&&BigInt(input.refreshRunId)<BigInt(context.runId)&&input.baselineRunId!==input.refreshRunId,'Source runs must be distinct earlier runs');
 }
 return true;
}
export function validateBaselineWorkflowRun(run,{expectedCommit,workflowId,baselineRunId}){
 assert(String(run?.id)===baselineRunId&&run.repository?.full_name==='tarsagent22/Bourbon-Signal'&&run.head_repository?.full_name==='tarsagent22/Bourbon-Signal','Baseline run must belong to the official repository');
 assert(run.path===ACCEPTANCE_WORKFLOW_PATH&&run.workflow_id===workflowId&&run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.head_sha===expectedCommit,'Baseline must come from this exact official main workflow and commit');
 assert(run.status==='completed'&&run.conclusion==='success','Baseline workflow must have completed successfully');
 return true;
}
export function validateBaselineArtifact(artifacts,runId){
 const matching=artifacts.filter(artifact=>artifact.name===`engine-expansion-baseline-${runId}`&&!artifact.expired);
 assert(matching.length===1&&numeric(matching[0].id),'Exactly one unexpired official baseline artifact is required');
 assert(/^sha256:[a-f0-9]{64}$/.test(matching[0].digest||''),'An immutable upload-v4 archive digest is required');
 assert(matching[0].size_in_bytes>0&&matching[0].size_in_bytes<=256*1024*1024,'Baseline archive size is outside bounds');
 return matching[0];
}
