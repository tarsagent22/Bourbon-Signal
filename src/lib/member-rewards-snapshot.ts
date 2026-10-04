import { isDeepStrictEqual } from 'node:util';

// JSONB does not preserve object-key order; undefined fields disappear in transit.
export function sameMemberRewardProfile(left: unknown, right: unknown) {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left ?? null)), JSON.parse(JSON.stringify(right ?? null)));
}
