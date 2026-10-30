import registry from '../../data/new-england-research-sources.json' with {type:'json'};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const NEW_ENGLAND_RESEARCH_SOURCES=freeze(registry.sources);
export const NEW_ENGLAND_NAMES=Object.freeze({MA:'Massachusetts',CT:'Connecticut',RI:'Rhode Island'});
export const newEnglandCohortInputs=state=>['new-england-onsite-v1-strict-pickup-options',state,
  NEW_ENGLAND_RESEARCH_SOURCES.filter(source=>source.state===state).map(source=>Object.fromEntries([
    'id','chainId','name','state','stateCode','merchantId','storeId','address','city','zip','lat','lng','baseUrl','hostname','sourceLabel','categoryUrl','prioritySearchTerm',
  ].map(key=>[key,source[key]])))];
// Literal values below are regenerated only by a reviewed cohort admission.
export const NEW_ENGLAND_PRODUCTION_COHORTS=Object.freeze({"MA":"7c91950c8d2b6f30ecd9db7b0c9b991cc4e2ea82971177d12ca031678faa5f5d","CT":"b4803c1dc75da09682d90af9d070c34db22fbbb2982e66e7adb910706963fa24","RI":"9b410f9e81990421afac6523aaaa44c79b66e4ca54601834e3e5580a7c0f2a7a"});
