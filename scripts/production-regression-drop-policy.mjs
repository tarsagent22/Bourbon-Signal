import { readFileSync } from 'node:fs';
import * as dropClassificationModule from '../src/lib/drop-classification.ts';
import * as publicDropEvidenceModule from '../src/lib/public-drop-evidence.ts';

const classificationExports = dropClassificationModule.default || dropClassificationModule;
const { getDropClassificationIndex, resolveDropClassification } = classificationExports;
const publicDropEvidenceExports = publicDropEvidenceModule.default || publicDropEvidenceModule;
const { isFreshPublicDrop, isPublicDropFeedEligible } = publicDropEvidenceExports;

const dropFeedClassification = JSON.parse(readFileSync(new URL('../src/data/drop-feed-classification.generated.json', import.meta.url), 'utf8'));
const classificationIndex = getDropClassificationIndex(dropFeedClassification.records);

export function parseLiveDropTotal(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function liveDropTotalMeetsRegressionFloor({ localTotal, liveTotal, minRatio }) {
  if (liveTotal === null) return false;
  if (localTotal > 0 && liveTotal < Math.max(1, Math.floor(localTotal * minRatio))) return false;
  return true;
}

export function hiddenDegradedEngineStates(refreshHealth) {
  const degradedStates = Array.isArray(refreshHealth?.degradedStates)
    ? refreshHealth.degradedStates
    : [];
  return new Set(
    degradedStates
      .filter((entry) => !String(entry?.status || '').toLowerCase().startsWith('stale_useful'))
      .map((entry) => String(entry?.state || '').toUpperCase())
      .filter(Boolean),
  );
}

export function isDropExpectedInLiveFeed(drop, now = Date.now()) {
  const classification = resolveDropClassification(drop, classificationIndex);
  const classifiedDrop = {
    ...drop,
    tier: classification.tier,
    rarity_tier: classification.tier,
    classification_source: classification.source,
    classification_state: classification.state,
    classification_bottle_id: classification.bottleId,
    national_tier: classification.nationalTier,
  };
  return isPublicDropFeedEligible(classifiedDrop) && isFreshPublicDrop(classifiedDrop, now);
}
