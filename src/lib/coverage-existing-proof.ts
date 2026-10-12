export function existingCoverageVerified(target: { targetType: string; stateCode: string; canonicalTargetKey: string }, state: any, results: any[] = []) {
  if (!state || state.code !== target.stateCode || state.health !== 'current'
    || !(state.freshness?.currentInventoryStores > 0)) return false;
  if (target.targetType === 'state') return state.coverageDepth === 'deep' && state.coverageStatus === 'available';
  if (target.targetType !== 'city') return false;
  return results.some(row => row.kind === 'city' && row.stateCode === target.stateCode
    && row.canonicalTargetKey === target.canonicalTargetKey && row.status === 'covered');
}
