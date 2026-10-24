import {open,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureShopifyCanonicalPolicy,CANONICAL_POLICY_DEPENDENCY_FILES} from './lib/shopify-canonical-policy-capture.mts';

async function boundedLocal(file:string,limit:number){
  const handle=await open(file,'r');
  try{
    const stat=await handle.stat();
    if(!stat.isFile()||stat.size>limit)throw Error('Local policy input exceeds limit');
    const bytes=Buffer.alloc(stat.size+1),result=await handle.read(bytes,0,bytes.length,0);
    if(result.bytesRead!==stat.size)throw Error('Local policy input changed');
    return bytes.subarray(0,result.bytesRead);
  }finally{await handle.close();}
}

async function main(){
  if(process.argv.length!==2||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Credentialed capture requires reviewed main-branch GitHub Actions');
  const expected=process.env.POLICY_EXPECTED_COMMIT||'',producer=process.env.GITHUB_SHA||'';
  if(!/^[a-f0-9]{40}$/u.test(expected)||producer!==expected||!process.env.BLOB_READ_WRITE_TOKEN||!process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY)throw Error('Capture context unavailable');
  const manifestBytes=await boundedLocal('engine/data/shopify-pickup-next-five-review-20261023.json',256*1024);
  const bindingBytes=await boundedLocal('engine/data/shopify-next-five-policy-bindings-20261024.json',64*1024),bindingFile=JSON.parse(bindingBytes.toString('utf8'));
  if(bindingFile.schemaVersion!==1||bindingFile.scope!=='read_only_policy_capture_bindings_no_admission_or_activation'||Object.keys(bindingFile).some(k=>!['schemaVersion','scope','bindings'].includes(k)))throw Error('Bindings unavailable');
  const dependencyBytes:Record<string,Buffer>={};
  for(const [key,file] of Object.entries(CANONICAL_POLICY_DEPENDENCY_FILES))dependencyBytes[key]=await boundedLocal(file,2*1024*1024);
  const {VercelBlobSnapshotStorage}=await import('../src/lib/vercel-blob-snapshot-storage.ts');
  const result=await captureShopifyCanonicalPolicy({storage:new VercelBlobSnapshotStorage(),encryptionKey:process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY,
    readRelease:async()=>{
      const response=await fetch('https://www.bourbonsignal.com/api/ops/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
      if(![200,503].includes(response.status))throw Error('Release response unavailable');
      const reader=response.body?.getReader();if(!reader)throw Error('Release response missing');
      const parts:Uint8Array[]=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024){await reader.cancel();throw Error('Release response exceeds limit');}parts.push(value);}
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    },expectedLiveCommit:expected,producerCommit:producer,producerRunId:process.env.GITHUB_RUN_ID||'',
    expectedSnapshotId:process.env.POLICY_EXPECTED_SNAPSHOT||'',expectedPointerSha256:process.env.POLICY_EXPECTED_POINTER_SHA256||'',
    manifestBytes,bindings:bindingFile.bindings,dependencyBytes});
  const output=resolve('out/shopify-canonical-policy.json');await mkdir(resolve('out'),{recursive:true});
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'captured',snapshotId:result.activeSnapshotId,canonicalRows:result.canonicalRows.length,bindings:result.bindings.length,scope:'read_only_policy_context_not_inventory_or_admission'}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Canonical policy capture failed closed; no raw exports, credentials, partial artifact or admissions emitted.');process.exitCode=1;});
