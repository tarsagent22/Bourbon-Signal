import {open,mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {captureCohortReceipts} from './lib/cohort-receipt-capture.mts';
async function main(){
  if(process.argv.length!==2||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Manual reviewed main execution only');
  const expected=process.env.COHORT_EXPECTED_COMMIT||'',producer=process.env.GITHUB_SHA||'';
  if(!/^[a-f0-9]{40}$/.test(expected)||expected!==producer)throw Error('Exact producer/live commit required');
  const output=resolve('out/shopify-cohort-capture.json'),reservation=resolve('out/shopify-cohort-capture.reservation.json');
  try{await stat(output);throw Error('Existing capture');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  await mkdir(resolve('out'),{recursive:true});const guard=await open(reservation,'wx',0o600);
  try{await guard.writeFile(JSON.stringify({reservedAt:new Date().toISOString(),expectedCommit:expected,producerCommit:producer,producerRunId:process.env.GITHUB_RUN_ID||'',mode:'capture_only_no_restart'})+'\n');await guard.sync();}finally{await guard.close();}
  const result=await captureCohortReceipts({expectedCommit:expected,producerCommit:producer,producerRunId:process.env.GITHUB_RUN_ID||'',observationId:process.env.COHORT_OBSERVATION_ID||'',key:process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY||'',secret:process.env.SOURCE_SCHEDULER_SECRET||''});
  const handle=await open(output,'wx',0o600);try{await handle.writeFile(JSON.stringify(result,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  console.log(JSON.stringify({complete:result.complete,allPairsMatch:result.allPairsMatch,receipts:result.receipts.length,requests:result.accounting.requests,acceptedNewStores:0,activated:false}));
  if(!result.complete)process.exitCode=1;
}
main().catch(()=>{console.error('Cohort capture failed closed; no source collection, rescue, activation or existing artifact overwrite.');process.exitCode=1;});
