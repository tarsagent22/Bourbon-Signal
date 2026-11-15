function researchSourceContract(module) {
  return JSON.stringify({
    origin: module.origin,
    batchPath: module.batchPath,
    sources: module.sources.map(source => ({...source,
      requestUrls: source.terms.map(term => module.southDakotaRetailerRequest(term))})),
  });
}

export function southDakotaResearchSourceContractMatches(before, current) {
  return researchSourceContract(before) === researchSourceContract(current);
}

export function hasReviewedSouthDakotaResearchRegistration(source) {
  return typeof source === 'string'
    && /import\s*\{\s*southDakotaResearchSource\s*,\s*southDakotaResearchLifecycle\s*,\s*collectSouthDakotaResearch\s*\}\s*from\s*['"]\.\/research-south-dakota-retailer\.mjs['"]/.test(source)
    && /\|\|\s*southDakotaResearchSource\(state\)/.test(source)
    && /southDakotaResearchSource\(config\.id\)\)\s*return\s+collectSouthDakotaResearch\(config,\s*bible,\s*options\)/.test(source);
}

export function hasSouthDakotaProductionRegistration({genericState, stateSources} = {}) {
  return typeof genericState === 'string' && typeof stateSources === 'string'
    && /import\s*\{\s*collectSouthDakotaProductionState\s*\}\s*from\s*['"]\.\/south-dakota-production\.mjs['"]/.test(genericState)
    && /if\s*\(\s*config\.id\s*===\s*['"]SD['"]\s*\)\s*return\s+collectSouthDakotaProductionState\(config,\s*bible,\s*options\)/.test(genericState)
    && /id:\s*['"]SD['"]\s*,\s*label:\s*['"]South Dakota first-party pickup inventory['"]/.test(stateSources)
    && /sources:\s*\[\{\s*kind:\s*['"]api['"]\s*,\s*url:\s*SD_MR_LIQUOR_ORIGIN\s*\+\s*SD_MR_LIQUOR_PATH/.test(stateSources);
}
