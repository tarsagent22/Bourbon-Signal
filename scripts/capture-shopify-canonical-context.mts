import {open,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureShopifyCanonicalContext,CanonicalContextCaptureError,CANONICAL_CONTEXT_DEPENDENCY_FILES,CANONICAL_CONTEXT_CAPTURE_LIMITS} from './lib/shopify-canonical-context-capture.mts';

async function boundedLocal(file:string,limit:number){
  const handle=await open(file,'r');
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size>limit)throw Error('Local input bound');
    const raw=Buffer.alloc(stat.size+1),read=await handle.read(raw,0,raw.length,0);
    if(read.bytesRead!==stat.size)throw Error('Local input changed');return raw.subarray(0,read.bytesRead);
  }finally{await handle.close();}
}

async function main(){
  if(process.argv.length!==2||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Main GitHub Actions execution required');
  const expected=process.env.CONTEXT_EXPECTED_COMMIT||'',producer=process.env.GITHUB_SHA||'';
  if(!/^[a-f0-9]{40}$/u.test(expected)||producer!==expected||!process.env.BLOB_READ_WRITE_TOKEN||!process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY)throw Error('Capture context unavailable');
  const dependencyBytes:Record<string,Buffer>={};
  for(const [key,file] of Object.entries(CANONICAL_CONTEXT_DEPENDENCY_FILES))dependencyBytes[key]=await boundedLocal(file,2*1024*1024);
  const {VercelBlobSnapshotStorage}=await import('../src/lib/vercel-blob-snapshot-storage.ts');
  const result=await captureShopifyCanonicalContext({storage:new VercelBlobSnapshotStorage(),encryptionKey:process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY,
    readRelease:async()=>{
      const response=await fetch('https://www.bourbonsignal.com/api/ops/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
      if(![200,503].includes(response.status))throw Error('Release response unavailable');
      const reader=response.body?.getReader();if(!reader)throw Error('Release body unavailable');
      const parts:Uint8Array[]=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024){await reader.cancel();throw Error('Release body bound');}parts.push(value);}
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    },expectedLiveCommit:expected,producerCommit:producer,producerRunId:process.env.GITHUB_RUN_ID||'',
    expectedSnapshotId:process.env.CONTEXT_EXPECTED_SNAPSHOT||'',expectedPointerSha256:process.env.CONTEXT_EXPECTED_POINTER_SHA256||'',
    dependencyBytes:dependencyBytes as Record<keyof typeof CANONICAL_CONTEXT_DEPENDENCY_FILES,Buffer>});
  const output=JSON.stringify(result,null,2)+'\n';if(Buffer.byteLength(output)>CANONICAL_CONTEXT_CAPTURE_LIMITS.outputBytes)throw Error('Output bound');
  await mkdir(resolve('out'),{recursive:true});await writeFile(resolve('out/shopify-canonical-context.json'),output,{flag:'wx'});
  console.log(JSON.stringify({status:'captured',snapshotId:result.activeSnapshotId,canonicalRows:result.canonicalRows.length,
    stateClassifications:result.stateClassifications.length,scope:result.scope,acceptedNewStores:0,activated:false}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch((error:unknown)=>{
  const code=error instanceof CanonicalContextCaptureError&&/^[a-z][a-z0-9_]{0,79}$/u.test(error.code)?error.code:'capture_failed_closed';
  console.error(JSON.stringify({status:'rejected',code,scope:'read_only_canonical_context_no_inventory_or_admission'}));
  console.error('Selected canonical context capture failed closed; no partial artifact, credentials, inventory or admissions emitted.');process.exitCode=1;
});
