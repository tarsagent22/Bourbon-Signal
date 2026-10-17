import seed from '../src/cellar/bottle-catalog-seed.json';
import { BOTTLE_REPUTATION, bottleReputation, reputationEvidence, currentEvidence } from '../../../shared/bottle-reputation';
import { writeFileSync } from 'node:fs';

const now = new Date();
const assessed = seed.map(bottle => {
  const entry = bottleReputation({ name: bottle.name, proof: bottle.proof ?? null, age: bottle.ageStatement ?? null });
  return { id: bottle.id, name: bottle.name, reviewed: reputationEvidence(entry, now).score != null, matchedExpression: entry?.key || null, releaseContext: Boolean(entry?.release && currentEvidence(entry.release.checkedAt, now)) };
});
const pending = assessed.filter(bottle => !bottle.reviewed);
const invalid = BOTTLE_REPUTATION.filter(entry => !entry.key || !entry.names.length || !entry.ratings.length || entry.identity && (!Number.isFinite(entry.identity.requiredProof) || entry.identity.requiredProof <= 0) || entry.release && (!['standard', 'limited', 'allocated'].includes(entry.release.kind) || !/^https:\/\//.test(entry.release.source) || !entry.release.reason.trim() || !entry.release.label.trim() || (!Number.isFinite(Date.parse(entry.release.checkedAt)) || Date.parse(entry.release.checkedAt) > now.getTime())) || entry.ratings.some(rating => !/^https:\/\//.test(rating.source) || !rating.publisher.trim() || !Number.isFinite(rating.value) || rating.value < 0 || rating.value > rating.scale || ![5, 100].includes(rating.scale) || !Number.isFinite(Date.parse(rating.checkedAt)) || Date.parse(rating.checkedAt) > now.getTime() || rating.kind === 'community' && (!Number.isInteger(rating.count) || rating.count! < 100)));
if (invalid.length || new Set(BOTTLE_REPUTATION.map(entry => entry.key)).size !== BOTTLE_REPUTATION.length) throw new Error('Invalid or duplicate reviewed evidence records');
const summary = { checkedAt: now.toISOString(), expressions: BOTTLE_REPUTATION.length, releaseContextExpressions: BOTTLE_REPUTATION.filter(entry => entry.release && currentEvidence(entry.release.checkedAt, now)).length, releaseContextEntries: assessed.filter(bottle => bottle.releaseContext).length, ratingObservations: BOTTLE_REPUTATION.reduce((total, entry) => total + entry.ratings.length, 0), catalogEntries: assessed.length, reviewCoveredEntries: assessed.length - pending.length, reviewPendingEntries: pending.length, expiredReleaseContexts: BOTTLE_REPUTATION.filter(entry => entry.release && !currentEvidence(entry.release.checkedAt, now)).map(entry => entry.key), expiredExpressions: BOTTLE_REPUTATION.filter(entry => reputationEvidence(entry, now).score == null).map(entry => entry.key) };
const output = process.argv.indexOf('--output');
if (output >= 0) {
  if (!process.argv[output + 1]) throw new Error('--output requires a filename');
  writeFileSync(process.argv[output + 1], JSON.stringify({ summary, assessed, pending }, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
