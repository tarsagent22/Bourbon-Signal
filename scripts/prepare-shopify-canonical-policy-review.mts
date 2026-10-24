import {open,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadShopifyBatchInputs} from './prepare-shopify-onboarding.mts';
import {reviewShopifyCanonicalPolicyCapture,SHOPIFY_CANONICAL_REVIEW_LIMITS} from './lib/shopify-canonical-policy-review.mts';

async function bounded(file:string,limit:number){
  const handle=await open(resolve(file),'r');
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size<1||stat.size>limit)throw Error('Input bound');
    const raw=Buffer.alloc(stat.size+1),read=await handle.read(raw,0,raw.length,0);
    if(read.bytesRead!==stat.size)throw Error('Input changed');return raw.subarray(0,read.bytesRead);
  }finally{await handle.close();}
}

/** Offline integrity review only. Supplied metadata never authenticates itself. */
async function main(){
  const args=new Map<string,string>();
  for(const argument of process.argv.slice(2)){
    const match=/^--(capture|archive|run|artifact|expected|out)=(.+)$/u.exec(argument);
    if(!match||args.has(match[1]))throw Error('Invalid argument');args.set(match[1],match[2]);
  }
  if(args.size!==6)throw Error('Explicit bounded inputs and output required');
  const limits=SHOPIFY_CANONICAL_REVIEW_LIMITS;
  const captureBytes=await bounded(args.get('capture')!,limits.captureBytes),archiveBytes=await bounded(args.get('archive')!,limits.archiveBytes);
  const runMetadataBytes=await bounded(args.get('run')!,limits.runMetadataBytes),artifactMetadataBytes=await bounded(args.get('artifact')!,limits.artifactMetadataBytes);
  const expected=JSON.parse((await bounded(args.get('expected')!,8192)).toString('utf8'));
  const batchInput=await loadShopifyBatchInputs({manifestFile:'engine/data/shopify-pickup-next-five-review-20261023.json',
    captureManifestFiles:['engine/test/fixtures/shopify-variant-pickup/next-five-20261023T1647/manifest.json']});
  const safeMatcherBytes=await bounded('engine/src/collectors/safe-bottle-match.mjs',128*1024);
  const report=await reviewShopifyCanonicalPolicyCapture({packetInput:{batchInput,safeMatcherBytes},captureBytes,archiveBytes,runMetadataBytes,artifactMetadataBytes,expected,now:Date.now()});
  const output=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(output)>limits.outputBytes)throw Error('Output bound');
  const out=resolve(args.get('out')!);await mkdir(dirname(out),{recursive:true});
  await writeFile(out,output,{flag:'wx'});
  console.log(JSON.stringify({scope:'offline_supplied_artifact_integrity_only',integrityVerified:report.integrityVerified,
    productionAuthorityVerified:false,acceptedNewStores:0,activated:false,blockers:report.blockers}));
  if(!report.integrityVerified)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{
  console.error('Canonical policy review failed closed; existing outputs preserved, no production authority or source admission created.');process.exitCode=1;
});
