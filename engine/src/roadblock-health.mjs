import { stableId } from './core/text.mjs';

const EXPECTED_NEGATIVE = /reachable_no_safe|no_safe_inventory|locator_only|no current|not currently|sold out|out of stock|store closed for ecommerce|catalog only|no matching/i;
const BLOCKED = /cloudflare|captcha|forbidden|access denied|rate.?limit|blocked|robot/i;

export function classifyRoadblock(roadblock = {}) {
  const text = `${roadblock.status || ''} ${roadblock.error || ''} ${roadblock.nextRoute || ''}`;
  if (EXPECTED_NEGATIVE.test(text)) return { severity: 'expected_negative', actionable: false };
  if (BLOCKED.test(text) || [401, 403, 429].includes(Number(roadblock.status))) return { severity: 'source_blocked', actionable: true };
  return { severity: 'operational_failure', actionable: true };
}

export function summarizeRoadblocks(roadblocks = []) {
  const classified = roadblocks.map((roadblock) => ({ ...roadblock, ...classifyRoadblock(roadblock) }));
  const groups = new Map();
  for (const roadblock of classified) {
    const normalizedError = String(roadblock.error || roadblock.status || 'unknown').toLowerCase().replace(/https?:\/\/\S+/g, '<url>').replace(/\d+/g, '#').trim();
    const key = stableId([roadblock.state || '', roadblock.source || '', roadblock.severity, normalizedError]);
    const existing = groups.get(key) || { id: key, state: roadblock.state || null, source: roadblock.source || null, severity: roadblock.severity, count: 0, sample: roadblock };
    existing.count += 1;
    groups.set(key, existing);
  }
  return {
    total: classified.length,
    expectedNegativeCount: classified.filter((row) => row.severity === 'expected_negative').length,
    blockedSourceCount: classified.filter((row) => row.severity === 'source_blocked').length,
    operationalFailureCount: classified.filter((row) => row.severity === 'operational_failure').length,
    actionableCount: classified.filter((row) => row.actionable).length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    roadblocks: classified,
  };
}
