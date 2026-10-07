import assert from 'node:assert/strict';
import {readCanonicalPublicCoverage,searchCanonicalPublicCoverage,isPublicCoverageContract} from '../src/lib/public-coverage-preview';
async function main(){
 let call:{url:string;options:RequestInit}|null=null;
 const contract={contractVersion:'bourbon-signal/coverage@3',generatedAt:'2026-10-06',states:[{code:'NC',name:'North Carolina',coverageExplanation:'Search 470 listed stores.',scope:{searchableStores:470}}]};
 const fetcher=(async(url,options)=>{call={url:String(url),options:options||{}};return Response.json(contract)}) as typeof fetch;
 const result=await readCanonicalPublicCoverage(fetcher);assert.equal(result.states[0].scope.searchableStores,470);assert.equal(call!.url,'https://www.bourbonsignal.com/api/coverage');assert.equal(call!.options.cache,'no-store');assert.equal(new Headers(call!.options.headers).get('cookie'),null);assert.equal(new Headers(call!.options.headers).get('Authorization'),null);assert.equal(isPublicCoverageContract({states:[]}),false);
 await assert.rejects(()=>readCanonicalPublicCoverage((async()=>Response.json({states:[]})) as typeof fetch));
 const searcher=(async(url,options)=>{assert.equal(String(url),'https://www.bourbonsignal.com/api/coverage');assert.equal(options?.method,'POST');assert.deepEqual(JSON.parse(String(options?.body)),{state:'NC',query:'Raleigh'});assert.equal(new Headers(options?.headers).get('cookie'),null);return Response.json({contractVersion:'bourbon-signal/coverage-search@1',state:'NC',results:[{label:'Raleigh',stateCode:'NC'}]})}) as typeof fetch;
 assert.equal((await searchCanonicalPublicCoverage('NC','Raleigh',searcher))[0].label,'Raleigh');console.log('Preview coverage and search use current public production contract without member credentials; malformed coverage fails closed.');
}
void main();
