import type { MemberCollectionBottle } from "../api/types";

const FAVORITE_RATING = 80;

export interface BourbonDnaTrait {
  name: string;
  ratingCount: number;
  averageRating: number;
}

export interface BourbonDnaConfidence {
  level: "building" | "emerging" | "established";
  label: string;
  detail: string;
}

export type BourbonDnaNextAction =
  | { kind: "rate_bottle"; bottleId: string; label: string; detail: string }
  | { kind: "add_taste_cues"; bottleId: string; label: string; detail: string }
  | { kind: "rate_another"; label: string; detail: string };

export interface BourbonDnaSummary {
  ratedCount: number;
  taggedRatingCount: number;
  favoriteCount: number;
  supportedTraits: BourbonDnaTrait[];
  confidence: BourbonDnaConfidence;
  nextAction: BourbonDnaNextAction;
}

function confidenceFor(ratedCount: number, taggedRatingCount: number): BourbonDnaConfidence {
  const evidence = `${ratedCount} rating${ratedCount === 1 ? "" : "s"} · ${taggedRatingCount} with taste cues`;
  if (ratedCount >= 8 && taggedRatingCount >= 5) {
    return { level: "established", label: "Established confidence", detail: `${evidence}. Repeated evidence is strong enough to make these taste patterns useful.` };
  }
  if (ratedCount >= 3 && taggedRatingCount >= 2) {
    return { level: "emerging", label: "Growing confidence", detail: `${evidence}. Your patterns are directional and will sharpen with more ratings.` };
  }
  return { level: "building", label: "Building confidence", detail: `${evidence}. This is an early read, not a complete taste profile.` };
}

function nextActionFor(bottles: MemberCollectionBottle[]): BourbonDnaNextAction {
  const unrated = bottles.find((bottle) => !bottle.isRated);
  if (unrated) {
    return {
      kind: "rate_bottle",
      bottleId: unrated.bottleId,
      label: `Rate ${unrated.bottleName}`,
      detail: "A saved bottle without a score is the clearest next data point.",
    };
  }

  const missingCues = bottles.find((bottle) => bottle.isRated && !(bottle.tasteTags || []).length);
  if (missingCues) {
    return {
      kind: "add_taste_cues",
      bottleId: missingCues.bottleId,
      label: `Add cues to ${missingCues.bottleName}`,
      detail: "Taste cues explain what your saved score means and strengthen trait support.",
    };
  }

  return {
    kind: "rate_another",
    label: bottles.length ? "Rate another whiskey" : "Rate your first whiskey",
    detail: "Save one score with the taste cues that stood out.",
  };
}

export function buildBourbonDna(bottles: MemberCollectionBottle[]): BourbonDnaSummary {
  const rated = bottles.filter((bottle) => bottle.isRated);
  const taggedRatingCount = rated.filter((bottle) => (bottle.tasteTags || []).length > 0).length;
  const favorites = rated.filter((bottle) => bottle.rating >= FAVORITE_RATING);
  const traits = new Map<string, { name: string; ratings: number[] }>();

  favorites.forEach((bottle) => {
    const uniqueTags = new Map<string, string>();
    (bottle.tasteTags || []).forEach((rawTag) => {
      const name = rawTag.trim();
      if (name) uniqueTags.set(name.toLocaleLowerCase(), name);
    });
    uniqueTags.forEach((name, key) => {
      const evidence = traits.get(key) || { name, ratings: [] };
      evidence.ratings.push(bottle.rating);
      traits.set(key, evidence);
    });
  });

  const supportedTraits = [...traits.values()]
    .map(({ name, ratings }) => ({
      name,
      ratingCount: ratings.length,
      averageRating: Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)) / 10,
    }))
    .sort((left, right) => right.ratingCount - left.ratingCount || right.averageRating - left.averageRating || left.name.localeCompare(right.name))
    .slice(0, 3);

  return {
    ratedCount: rated.length,
    taggedRatingCount,
    favoriteCount: favorites.length,
    supportedTraits,
    confidence: confidenceFor(rated.length, taggedRatingCount),
    nextAction: nextActionFor(bottles),
  };
}
