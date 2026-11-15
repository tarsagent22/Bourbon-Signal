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
