import type {CoverageContract,CoverageSearchResult} from './coverage-model';
const origin='https://www.bourbonsignal.com';
export function isPublicCoverageContract(value:unknown):value is CoverageContract{
 const v=value as CoverageContract;
 return v?.contractVersion==='bourbon-signal/coverage@3'&&Array.isArray(v.states)&&v.states.length>0&&v.states.every(s=>typeof s.code==='string'&&/^[A-Z]{2}$/.test(s.code)&&typeof s.name==='string'&&typeof s.coverageExplanation==='string'&&s.scope&&Number.isFinite(s.scope.searchableStores));
}
export async function readCanonicalPublicCoverage(fetcher:typeof fetch=fetch):Promise<CoverageContract>{
 const r=await fetcher(origin+'/api/coverage',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 const data=await r.json();if(!r.ok||!isPublicCoverageContract(data))throw new Error('Current public coverage is temporarily unavailable.');return data;
}
export async function searchCanonicalPublicCoverage(state:string,query:string,fetcher:typeof fetch=fetch):Promise<CoverageSearchResult[]>{
 const r=await fetcher(origin+'/api/coverage',{method:'POST',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({state,query}),signal:AbortSignal.timeout(10000)});
 const data=await r.json();if(!r.ok||data.contractVersion!=='bourbon-signal/coverage-search@1'||data.state!==state||!Array.isArray(data.results)||!data.results.every((item:CoverageSearchResult)=>typeof item.label==='string'&&item.stateCode===state))throw new Error('Current public coverage search is temporarily unavailable.');return data.results;
}
