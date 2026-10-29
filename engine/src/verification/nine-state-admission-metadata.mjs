import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{unzipSync}from'fflate';
import{validateImmutablePromotionEvidence}from'../reliability-policy.mjs';
const boundary=JSON.parse(readFileSync(new URL('../../data/source-evidence/nine-state-activation-boundary-20261029/metadata.json',import.meta.url),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),closed=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const defaultManifest=state=>JSON.parse(readFileSync(new URL(`../../data/state-integration/${state}.json`,import.meta.url),'utf8'));
const defaultArchive=state=>readFileSync(new URL(`../../data/promotion-provenance/${state}.zip`,import.meta.url));
function validateProof(state,evidence,manifest,archive){
 assert.ok(closed(evidence,boundary.entries[state].proofFields),state+': unexpected admission proof fields');
 assert.equal(evidence.shadowRuns,3);assert.equal(evidence.canaryRuns,2);assert.ok(Number.isFinite(Date.parse(evidence.verifiedAt)));
 assert.equal(evidence.verticalSliceManifest,`engine/data/state-integration/${state}.json`);assert.equal(evidence.fixtureContract,`engine/data/state-fixtures/${state}.json`);
 assert.ok(validateImmutablePromotionEvidence(state,evidence),state+': existing immutable3/2 validator rejected admission');
 const immutable=evidence.immutableEvidence,entry=boundary.entries[state],provenance=immutable.provenance;
 assert.ok(closed(immutable,['schemaVersion','state','generatedAt','sourceConfigHash','previewUrl','shadowRuns','canaryRuns','provenance',...(entry.sourceProof?['sourceProof']:[])]),state+': unknown immutable proof fields');
 assert.ok(closed(provenance,['status','repository','workflowRunId','artifactId','commitSha','artifactDigest','bundleDigest','workflowRunUrl','artifactName']),state+': unknown provenance fields');
 assert.deepEqual(manifest.evidence?.immutablePromotionEvidence,immutable,state+': manifest proof differs');if(Object.hasOwn(evidence,'shadowArtifact'))assert.equal(evidence.shadowArtifact,immutable.shadowRuns.at(-1).workflowRunUrl);if(Object.hasOwn(evidence,'canaryArtifact'))assert.equal(evidence.canaryArtifact,evidence.canaryPreviewUrl);
 assert.equal(immutable.sourceConfigHash,entry.sourceConfigHash);assert.equal(manifest.collector.cohortSha256,entry.cohortSha256);
 assert.equal(sha(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]])))),entry.sourceConfigHash,state+': semantics changed');
 for(const[runs,count]of[[immutable.shadowRuns,3],[immutable.canaryRuns,2]]){assert.equal(runs.length,count);for(const run of runs){assert.ok(closed(run,['runId','status','artifactHash','artifactId','commitSha','workflowRunUrl']));assert.match(run.artifactId,/^\d+$/);assert.equal(run.commitSha,provenance.commitSha);assert.equal(run.workflowRunUrl,`https://github.com/${provenance.repository}/actions/runs/${run.runId}`);}}
 assert.equal(provenance.repository,'tarsagent22/Bourbon-Signal');assert.ok(archive.length>0&&archive.length<=1024*1024);assert.equal(sha(archive),provenance.artifactDigest,state+': original issued ZIP digest differs');
 let count=0;const files=unzipSync(archive,{filter:file=>{if(file.name.endsWith('/'))return false;assert.equal(++count,1);assert.equal(file.name,state+'.json');assert.ok(file.originalSize<=2*1024*1024);return true;}});assert.equal(count,1);const bundle=JSON.parse(Buffer.from(files[state+'.json']).toString('utf8'));
 assert.ok(closed(bundle,['schemaVersion','state','repository','commitSha','workflowRunId','workflowRunAttempt','generatedAt','fileDigests',...(entry.sourceProof?['sourceProof']:[]),'bundleDigest']),state+': unknown issued bundle fields');assert.equal(bundle.schemaVersion,1);assert.equal(bundle.generatedAt,immutable.generatedAt);assert.equal(bundle.state,state);assert.equal(bundle.repository,provenance.repository);assert.equal(bundle.commitSha,provenance.commitSha);assert.equal(bundle.workflowRunId,provenance.workflowRunId);assert.equal(bundle.bundleDigest,provenance.bundleDigest);assert.equal(sha(JSON.stringify(bundle.fileDigests)),provenance.bundleDigest);assert.ok(Object.values(bundle.fileDigests).every(value=>/^[a-f0-9]{64}$/.test(value)));
 if(entry.sourceProof){assert.ok(closed(immutable.sourceProof,['protocol','cohortSha256','allSourceRunsComplete','storeIds','sourceRuns']));assert.deepEqual(bundle.sourceProof,immutable.sourceProof);assert.equal(immutable.sourceProof.protocol,entry.sourceProof.protocol);assert.equal(immutable.sourceProof.cohortSha256,entry.cohortSha256);assert.equal(immutable.sourceProof.allSourceRunsComplete,true);assert.deepEqual(immutable.sourceProof.storeIds,entry.sourceProof.storeIds);assert.equal(immutable.sourceProof.sourceRuns.length,3);for(const run of immutable.sourceProof.sourceRuns){assert.ok(closed(run,['workflowRunId','headSha','artifactId','artifactDigest']));const shadow=immutable.shadowRuns.find(row=>row.runId===run.workflowRunId);assert.ok(shadow);assert.equal(run.headSha,shadow.commitSha);assert.equal(run.artifactId,shadow.artifactId);assert.equal(run.artifactDigest,shadow.artifactHash);}}
 else assert.equal(immutable.sourceProof,undefined,state+': unexpected source protocol');
}
function replaceUnique(text,current,original,label){assert.equal(text.split(current).length-1,1,label+': exact metadata block must occur once');return text.replace(current,()=>original);}
const entryBlock=(state,entry)=>JSON.stringify({[state]:entry},null,2).split('\n').slice(1,-1).map(line=>'  '+line).join('\n');
const arrayBlock=states=>JSON.stringify({activeStates:states},null,2).split('\n').slice(1,-1).join('\n');
export function normalizeNineStateAdmissionMetadata(name,bytes,{loadManifest=defaultManifest,loadArchive=defaultArchive}={}){
 if(!['src/config/state-lifecycle.json','src/config/stateLifecycle.ts'].includes(name))return bytes;
 assert.equal(boundary.contractVersion,'bourbon-signal/nine-state-exact-admission-metadata-boundary@1');
 let text=bytes.toString('utf8');const originalBytes=bytes;const isTs=name.endsWith('.ts'),prefix=isTs?boundary.tsPrefix:'',suffix=isTs?boundary.tsSuffix:'\n';if(!text.startsWith(prefix)||!text.endsWith(suffix))return originalBytes;let config;try{config=JSON.parse(text.slice(prefix.length,text.length-suffix.length));}catch{return originalBytes;}const admitting=JSON.stringify(config.activeStates)===JSON.stringify(boundary.admittedActiveStates);
 if(!admitting&&JSON.stringify(config.activeStates)!==JSON.stringify(boundary.originalActiveStates))return originalBytes;
 // Unrecognized/malformed input is returned byte-identically to the existing
 // full-file Mississippi digest and literal guards; it is never normalized.
 try{
 for(const state of boundary.states){const actual=config.states[state],expected=boundary.entries[state];
  if(!admitting&&boundary.newStates.includes(state)){assert.deepEqual(actual??null,expected.original,state+': inactive metadata differs');continue;}
  if(!admitting&&JSON.stringify(actual)===JSON.stringify(expected.original))continue;
  assert.ok(actual);const{promotionEvidence,...descriptor}=actual;assert.equal(JSON.stringify(descriptor),JSON.stringify(expected.admittedDescriptor),state+': admitted descriptor differs');validateProof(state,promotionEvidence,loadManifest(state),loadArchive(state));
  const current=entryBlock(state,actual);text=expected.original===null?replaceUnique(text,',\n'+current,'',state+': exact added state'):replaceUnique(text,current,entryBlock(state,expected.original),state+': exact existing state');
 }
 }catch(error){if(!admitting)return originalBytes;throw error;}
 if(admitting)text=replaceUnique(text,arrayBlock(boundary.admittedActiveStates),arrayBlock(boundary.originalActiveStates),'exact active33 array');
 return Buffer.from(text);
}