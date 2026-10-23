import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadShopifyBatchInputs} from './prepare-shopify-onboarding.mts';
import {assembleShopifyAdmissionReviewPacket,type ShopifyAdmissionReviewInput} from './lib/shopify-admission-review-packet.mts';

/** Preparation only. This command never creates approvals, admissions or sources. */
export async function prepareShopifyAdmissionReview(options: Parameters<typeof loadShopifyBatchInputs>[0] = {},review: Pick<ShopifyAdmissionReviewInput,'evidence'|'decisions'> = {}) {
  const batchInput=await loadShopifyBatchInputs({
    manifestFile:'engine/data/shopify-pickup-next-five-review-20261023.json',
    captureManifestFiles:['engine/test/fixtures/shopify-variant-pickup/next-five-20261023T1647/manifest.json'],
    ...options,
  });
  const safeMatcherBytes=await readFile(new URL('../engine/src/collectors/safe-bottle-match.mjs',import.meta.url));
  return assembleShopifyAdmissionReviewPacket({batchInput,safeMatcherBytes,evidence:review.evidence,decisions:review.decisions,now:Date.now()});
}

async function readReviewBundle(file:string){
  const handle=await open(resolve(file),'r');
  try{
    const stat=await handle.stat();
    if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Review bundle exceeds limit');
    const bytes=Buffer.alloc(stat.size+1),read=await handle.read(bytes,0,bytes.length,0);
    if(read.bytesRead!==stat.size)throw Error('Review bundle changed');
    const bundle=JSON.parse(bytes.subarray(0,read.bytesRead).toString('utf8'));
    if(!bundle||Array.isArray(bundle)||Object.keys(bundle).some(key=>!['evidence','decisions'].includes(key))||!Array.isArray(bundle.evidence)||!Array.isArray(bundle.decisions))throw Error('Invalid review bundle');
    return bundle as Pick<ShopifyAdmissionReviewInput,'evidence'|'decisions'>;
  }finally{await handle.close();}
}

async function main(){
  const values=new Map<string,string[]>();
  for(const argument of process.argv.slice(2)){
    const match=/^--(manifest|catalog|classification|captures|review|out)=(.+)$/u.exec(argument);
    if(!match||(match[1]!=='captures'&&values.has(match[1])))throw Error('Unsupported preparation argument');
    values.set(match[1],[...(values.get(match[1])||[]),match[2]]);
  }
  if(!values.get('out')?.[0])throw Error('Explicit output required');
  const options={...(values.has('manifest')?{manifestFile:values.get('manifest')![0]}:{}),
    ...(values.has('catalog')?{catalogFile:values.get('catalog')![0]}:{}),
    ...(values.has('classification')?{classificationFile:values.get('classification')![0]}:{}),
    ...(values.has('captures')?{captureManifestFiles:values.get('captures')}:{} )};
  const review=values.has('review')?await readReviewBundle(values.get('review')![0]):{};
  const report=await prepareShopifyAdmissionReview(options,review),out=resolve(values.get('out')![0]);
  await mkdir(dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({packet:out,scope:report.scope,acceptedNewStores:report.acceptedNewStores,activated:report.activated,
    requiresExplicitLeadReview:report.requiresExplicitLeadReview,blockers:report.blockers}));
  if(report.blockers?.length)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{
  console.error('Admission review preparation failed closed; no existing report overwritten and no source admitted.');process.exitCode=1;
});
