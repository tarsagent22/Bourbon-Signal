import seed from '../src/cellar/bottle-catalog-seed.json';
import { BOTTLE_REPUTATION, bottleReputation, reputationEvidence } from '../../../shared/bottle-reputation';
import { writeFileSync } from 'node:fs';

const now = new Date();
const assessed = seed.map(bottle => {
  const entry = bottleReputation({ name: bottle.name, proof: bottle.proof ?? null, age: bottle.ageStatement ?? null });
  return { id: bottle.id, name: bottle.name, reviewed: reputationEvidence(entry, now).score != null, matchedExpression: entry?.key || null };
});
const pending = assessed.filter(bottle => !bottle.reviewed);
const invalid = BOTTLE_REPUTATION.filter(entry => !entry.key || !entry.names.length || !entry.ratings.length || entry.ratings.some(rating => !/^https:\/\//.test(rating.source) || !rating.publisher.trim() || !Number.isFinite(rating.value) || rating.value < 0 || rating.value > rating.scale || ![5, 100].includes(rating.scale) || !Number.isFinite(Date.parse(rating.checkedAt)) || Date.parse(rating.checkedAt) > now.getTime() || rating.kind === 'community' && (!Number.isInteger(rating.count) || rating.count! < 100)));
if (invalid.length || new Set(BOTTLE_REPUTATION.map(entry => entry.key)).size !== BOTTLE_REPUTATION.length) throw new Error('Invalid or duplicate reviewed evidence records');
const summary = { checkedAt: now.toISOString(), expressions: BOTTLE_REPUTATION.length, ratingObservations: BOTTLE_REPUTATION.reduce((total, entry) => total + entry.ratings.length, 0), catalogEntries: assessed.length, reviewCoveredEntries: assessed.length - pending.length, reviewPendingEntries: pending.length, expiredExpressions: BOTTLE_REPUTATION.filter(entry => reputationEvidence(entry, now).score == null).map(entry => entry.key) };
const output = process.argv.indexOf('--output');
if (output >= 0) {
  if (!process.argv[output + 1]) throw new Error('--output requires a filename');
  writeFileSync(process.argv[output + 1], JSON.stringify({ summary, assessed, pending }, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
