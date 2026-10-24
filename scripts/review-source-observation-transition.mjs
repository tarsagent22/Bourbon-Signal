import {open,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {reviewSourceObservationTransition,OBSERVATION_TRANSITION_REVIEW_LIMITS} from './lib/source-observation-transition-review.mjs';

async function main(){
  const args=new Map();
  for(const argument of process.argv.slice(2)){
    const match=/^--(input|out)=(.+)$/u.exec(argument);
    if(!match||args.has(match[1]))throw Error('Invalid argument');args.set(match[1],match[2]);
  }
  if(args.size!==2)throw Error('Explicit input and output required');
  const handle=await open(resolve(args.get('input')),'r');let input;
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size<1||stat.size>OBSERVATION_TRANSITION_REVIEW_LIMITS.inputBytes)throw Error('Input bound');
    const raw=Buffer.alloc(stat.size+1),read=await handle.read(raw,0,raw.length,0);
    if(read.bytesRead!==stat.size)throw Error('Input changed');input=JSON.parse(raw.subarray(0,read.bytesRead).toString('utf8'));
  }finally{await handle.close();}
  if(!input||Array.isArray(input)||typeof input!=='object'||Object.hasOwn(input,'now'))throw Error('CLI owns the current review clock');
  const report=reviewSourceObservationTransition({...input,now:new Date().toISOString()}),output=JSON.stringify(report,null,2)+'\n';
  if(Buffer.byteLength(output)>OBSERVATION_TRANSITION_REVIEW_LIMITS.outputBytes)throw Error('Output bound');
  const out=resolve(args.get('out'));await mkdir(dirname(out),{recursive:true});await writeFile(out,output,{flag:'wx'});
  console.log(JSON.stringify({status:report.status,continuityIntegrityVerified:report.continuityIntegrityVerified,
    releaseBodyVerified:report.releaseBodyVerified,providerAuthenticationVerified:false,authorized:false,applied:false,blockers:report.blockers}));
  if(report.status==='blocked')process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{
  console.error('Offline transition review failed closed; existing outputs preserved and no operational transition authorized.');process.exitCode=1;
});
