import { lookupBourbonKnowledge, mergeNoteKeywords, type BourbonKnowledgeProfile } from "@/lib/bourbon-dna-library";

export const BOURBON_DNA_TAGS = [
  "Caramel",
  "Vanilla",
  "Oak",
  "Cherry",
  "Grape",
  "Spice",
  "Proof heat",
  "Sweet",
  "Honey",
  "Dark fruit",
  "Leather",
  "Nutty",
  "Smoky",
  "Dessert",
  "Balanced",
] as const;

export type BourbonDnaTag = (typeof BOURBON_DNA_TAGS)[number];

export interface BourbonDnaInput {
  name: string;
  brand?: string;
  producer?: string;
  proof?: number;
  category?: string;
  aliases?: string[];
  userTags?: string[];
}

export interface BourbonDnaProfile {
  tags: BourbonDnaTag[];
  weights: Partial<Record<BourbonDnaTag, number>>;
  method: "curated" | "inferred" | "user_augmented";
  confidence: "low" | "medium" | "high";
  signals: string[];
  mashBillFamily?: string;
  mashBill?: string;
  mashBillConfidence?: BourbonKnowledgeProfile["mashBillConfidence"];
  noteKeywords?: string[];
}

export interface CollectionTasteInput {
  canonicalKey: string;
  bottleName: string;
  rating: number;
  tasteTags?: string[];
  proof?: number;
  wouldBuyAgain?: boolean;
  inferredProfile?: BourbonDnaProfile;
}

export interface UserTasteProfile {
  weights: Partial<Record<BourbonDnaTag, number>>;
  favoriteTags: BourbonDnaTag[];
  avoidTags: BourbonDnaTag[];
  mashBillWeights: Record<string, number>;
  favoriteMashBills: string[];
  bottleCount: number;
  positiveBottleCount: number;
  preferredProof?: number;
  preferredProofRange?: { min: number; max: number };
  proofBottleCount: number;
  confidence: "early" | "learning" | "strong";
  nextLearningPrompt?: string;
}

const TAG_SET = new Set<string>(BOURBON_DNA_TAGS);

function normalizeTag(tag: string): BourbonDnaTag | null {
  const match = BOURBON_DNA_TAGS.find((candidate) => candidate.toLowerCase() === tag.trim().toLowerCase());
  return match || null;
}

function addTag(profile: BourbonDnaProfile, tag: BourbonDnaTag, weight: number, signal: string) {
  profile.weights[tag] = Math.max(profile.weights[tag] || 0, weight);
  if (!profile.tags.includes(tag)) profile.tags.push(tag);
  if (!profile.signals.includes(signal)) profile.signals.push(signal);
}

function normalizeBottleKey(input: BourbonDnaInput) {
  return [input.name, input.brand, ...(input.aliases || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CURATED_BOURBON_DNA: Array<{
  match: RegExp;
  tags: Array<{ tag: BourbonDnaTag; weight: number }>;
  signals: string[];
}> = [
  {
    match: /\beagle rare\b(?=.*\b(?:12|twelve)\b)/,
    tags: [
      { tag: "Grape", weight: 0.92 },
      { tag: "Dark fruit", weight: 0.88 },
      { tag: "Oak", weight: 0.82 },
      { tag: "Leather", weight: 0.72 },
      { tag: "Caramel", weight: 0.68 },
      { tag: "Honey", weight: 0.62 },
      { tag: "Balanced", weight: 0.58 },
    ],
    signals: [
      "curated review: ER12 is darker and more complex than ER10",
      "curated review: classic Buffalo Trace grape with blackberry/dark fruit, oak, leather, caramel/toffee, and honey",
      "curated review score 7.5/10; preferred neat pour at MSRP over ER10",
    ],
  },
  {
    match: /\beagle rare\b(?=.*\b(?:10|ten|10y|10yr|10 year)\b)|\beagle rare\b(?!.*\b(?:12|17|25)\b)/,
    tags: [
      { tag: "Grape", weight: 0.86 },
      { tag: "Cherry", weight: 0.78 },
      { tag: "Sweet", weight: 0.7 },
      { tag: "Vanilla", weight: 0.66 },
      { tag: "Leather", weight: 0.58 },
      { tag: "Oak", weight: 0.54 },
      { tag: "Caramel", weight: 0.5 },
    ],
    signals: [
      "curated review: ER10 is lighter/brighter than ER12",
      "curated review: grape, cherry pie, confectioner's sugar, vanilla buttercream, leather, barrel char, and a drier shorter finish",
      "curated review score 6.5/10; good neat and likely strong in an Old Fashioned",
    ],
  },
  {
    match: /\beagle rare\b(?=.*\b(?:17|seventeen)\b)/,
    tags: [
      { tag: "Oak", weight: 0.84 },
      { tag: "Leather", weight: 0.78 },
      { tag: "Dark fruit", weight: 0.74 },
      { tag: "Grape", weight: 0.7 },
      { tag: "Caramel", weight: 0.62 },
      { tag: "Balanced", weight: 0.56 },
    ],
    signals: ["curated reviewer ladder places Eagle Rare 17 at 8/10, above ER12 and ER10"],
  },
];

function applyCuratedBourbonDna(profile: BourbonDnaProfile, input: BourbonDnaInput) {
  const key = normalizeBottleKey(input);
  const curated = CURATED_BOURBON_DNA.find((entry) => entry.match.test(key));
  if (!curated) return;

  for (const { tag, weight } of curated.tags) addTag(profile, tag, weight, "curated bourbon DNA");
  for (const signal of curated.signals) {
    if (!profile.signals.includes(signal)) profile.signals.push(signal);
  }
  profile.method = "curated";
  profile.confidence = "high";
}

function applyKnowledgeProfile(profile: BourbonDnaProfile, input: BourbonDnaInput) {
  const knowledge = lookupBourbonKnowledge(input);
  if (!knowledge) return;

  for (const [rawTag, weight] of Object.entries(knowledge.tags)) {
    const tag = normalizeTag(rawTag);
    if (tag && typeof weight === "number") addTag(profile, tag, weight, `mash bill library: ${knowledge.family}`);
  }

  profile.mashBillFamily = knowledge.family;
  profile.mashBill = knowledge.mashBill;
  profile.mashBillConfidence = knowledge.mashBillConfidence;
  profile.noteKeywords = mergeNoteKeywords(profile.noteKeywords, knowledge.noteKeywords);
  for (const sourceNote of knowledge.sourceNotes) {
    if (!profile.signals.includes(sourceNote)) profile.signals.push(sourceNote);
  }
}

export function createBourbonDnaProfile(input: BourbonDnaInput): BourbonDnaProfile {
  const text = [input.name, input.brand, input.producer, input.category, ...(input.aliases || [])].filter(Boolean).join(" ").toLowerCase();
  const profile: BourbonDnaProfile = { tags: [], weights: {}, method: "inferred", confidence: "medium", signals: [] };

  applyCuratedBourbonDna(profile, input);
  applyKnowledgeProfile(profile, input);

  for (const rawTag of input.userTags || []) {
    const tag = normalizeTag(rawTag);
    if (tag) addTag(profile, tag, 1, "user taste cue");
  }

  if (input.category === "rye" || /\brye\b/.test(text)) addTag(profile, "Spice", 0.78, "rye/high-spice style");
  if ((input.proof || 0) >= 105 || /barrel proof|full proof|cask strength|single barrel|bond|bottled.?in.?bond|101/.test(text)) addTag(profile, "Proof heat", 0.72, "proof/style signal");
  if (/double oak|double oaked|toasted|1910|woodford|old forester|brown.?forman|elijah craig|knob creek|russell|wild turkey/.test(text)) addTag(profile, "Oak", 0.72, "oak/producer pattern");
  if (/maker|weller|larceny|wheated|rebel|old fitzgerald/.test(text)) addTag(profile, "Sweet", 0.7, "wheated/sweet profile");
  if (/buffalo trace|eagle rare|e\.h\.? taylor|stagg|blanton|benchmark|sazerac|1792|barton/.test(text)) addTag(profile, "Caramel", 0.66, "brand family pattern");
  if (/buffalo trace|eagle rare|e\.h\.? taylor|stagg|blanton|benchmark|sazerac/.test(text)) addTag(profile, "Grape", 0.64, "Buffalo Trace grape profile");
  if (/four roses|high rye|redemption|bulleit|new riff|rye/.test(text)) addTag(profile, "Spice", 0.74, "high-rye pattern");
  if (/michter|angel|finished|port|sherry|rum|cognac|amburana|redwood|casey jones|jefferson/.test(text)) addTag(profile, "Dark fruit", 0.62, "finish/producer pattern");
  if (/old forester|woodford|buffalo trace|eagle rare|blanton|weller|maker|four roses|russell|wild turkey|knob creek|elijah craig|1792/.test(text)) addTag(profile, "Vanilla", 0.6, "classic bourbon profile");
  if (/1910|double oak|toasted|woodford|angel|honey|maple|sweet|dessert/.test(text)) addTag(profile, "Sweet", 0.75, "dessert/sweet-oak signal");
  if (/honey|eagle rare/.test(text)) addTag(profile, "Honey", 0.58, "honey/sweet finish signal");
  if (/booker|baker|knob creek|jim beam|beam|basil hayden/.test(text)) addTag(profile, "Nutty", 0.62, "Beam/nutty profile");
  if (/jack daniel|charcoal|smoke|smoky/.test(text)) addTag(profile, "Smoky", 0.58, "charcoal/smoke signal");
  if (/cherry|red fruit|fruit/.test(text)) addTag(profile, "Cherry", 0.58, "fruit descriptor signal");
  if (/leather|eagle rare/.test(text)) addTag(profile, "Leather", 0.52, "leather/mature oak signal");

  if (!profile.tags.length) addTag(profile, "Balanced", 0.45, "fallback balanced profile");
  if (profile.tags.length < 2 && !profile.tags.includes("Balanced")) addTag(profile, "Balanced", 0.4, "secondary balance signal");

  if ((input.userTags || []).some((tag) => TAG_SET.has(tag))) profile.method = "user_augmented";
  if (profile.method !== "curated") profile.confidence = profile.signals.length >= 4 ? "high" : profile.signals.length >= 2 ? "medium" : "low";
  return profile;
}

function ratingSignalWeight(rating: number) {
  if (rating >= 90) return 1.35;
  if (rating >= 80) return 0.85 + ((rating - 80) / 10) * 0.35;
  if (rating >= 70) return 0.22;
  if (rating >= 60) return 0.08;
  return 0;
}

function proofBand(proof: number) {
  if (proof < 90) return "lower-proof";
  if (proof <= 101) return "classic proof";
  if (proof <= 115) return "higher-proof";
  return "barrel-proof";
}

export function buildUserTasteProfile(collection: CollectionTasteInput[]): UserTasteProfile {
  const weights: Partial<Record<BourbonDnaTag, number>> = {};
  const avoid: Partial<Record<BourbonDnaTag, number>> = {};
  const mashBillWeights: Record<string, number> = {};
  let proofWeightTotal = 0;
  let weightedProofTotal = 0;
  let proofBottleCount = 0;
  let positiveBottleCount = 0;
  const positiveProofs: number[] = [];

  for (const entry of collection) {
    const rating = Math.max(0, Math.min(100, entry.rating || 0));
    const likedWeight = ratingSignalWeight(rating);
    const avoidWeight = rating < 60 ? (60 - rating) / 60 : 0;
    const adjustedLikedWeight = likedWeight * (entry.wouldBuyAgain === false ? 0.45 : 1);
    if (rating >= 80) positiveBottleCount += 1;

    const explicitTags = (entry.tasteTags || []).map((tag) => normalizeTag(tag)).filter((tag): tag is BourbonDnaTag => Boolean(tag));
    for (const tag of explicitTags) {
      if (adjustedLikedWeight) weights[tag] = (weights[tag] || 0) + adjustedLikedWeight * 1.15;
      if (avoidWeight) avoid[tag] = (avoid[tag] || 0) + avoidWeight;
    }

    if (entry.inferredProfile) {
      for (const tag of entry.inferredProfile.tags) {
        const bottleWeight = entry.inferredProfile.weights[tag] || 0.4;
        if (adjustedLikedWeight) weights[tag] = (weights[tag] || 0) + adjustedLikedWeight * bottleWeight;
        if (avoidWeight) avoid[tag] = (avoid[tag] || 0) + avoidWeight * bottleWeight;
      }
      if (entry.inferredProfile.mashBillFamily && adjustedLikedWeight) {
        mashBillWeights[entry.inferredProfile.mashBillFamily] = (mashBillWeights[entry.inferredProfile.mashBillFamily] || 0) + adjustedLikedWeight;
      }
    }

    if (typeof entry.proof === "number" && Number.isFinite(entry.proof) && rating >= 80) {
      proofBottleCount += 1;
      positiveProofs.push(entry.proof);
      proofWeightTotal += adjustedLikedWeight || 0.75;
      weightedProofTotal += entry.proof * (adjustedLikedWeight || 0.75);
    }
  }

  const favoriteTags = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag as BourbonDnaTag)
    .slice(0, 6);
  const avoidTags = Object.entries(avoid)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag as BourbonDnaTag)
    .slice(0, 4);
  const favoriteMashBills = Object.entries(mashBillWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([family]) => family)
    .slice(0, 3);
  const preferredProof = proofWeightTotal > 0 ? Math.round((weightedProofTotal / proofWeightTotal) * 10) / 10 : undefined;
  const preferredProofRange = preferredProof
    ? { min: Math.max(70, Math.round(preferredProof - 8)), max: Math.round(preferredProof + 8) }
    : positiveProofs.length
      ? { min: Math.min(...positiveProofs), max: Math.max(...positiveProofs) }
      : undefined;
  const confidence: UserTasteProfile["confidence"] = positiveBottleCount >= 8 && favoriteTags.length >= 3
    ? "strong"
    : positiveBottleCount >= 3
      ? "learning"
      : "early";
  const nextLearningPrompt = positiveBottleCount < 3
    ? "Rate a few more bottles; the next jump in accuracy comes from simple scores, not a quiz."
    : !favoriteMashBills.length
      ? "Bourbon DNA is learning your proof range now; mash-bill patterns will appear as more rated bottles match the library."
      : `Current read: ${favoriteMashBills[0]} is one of your strongest families. Keep rating bottles to confirm or disprove it.`;

  return { weights, favoriteTags, avoidTags, mashBillWeights, favoriteMashBills, bottleCount: collection.length, positiveBottleCount, preferredProof, preferredProofRange, proofBottleCount, confidence, nextLearningPrompt };
}

export function scoreProofMatch(userProfile: UserTasteProfile, bottleProof?: number) {
  if (!userProfile.preferredProof || typeof bottleProof !== "number" || !Number.isFinite(bottleProof)) {
    return { score: 0, label: "Proof unavailable", explanation: "Proof data is not available yet for this bottle." };
  }
  const delta = Math.abs(bottleProof - userProfile.preferredProof);
  if (delta <= 5) {
    return { score: 4, label: "Strong proof match", explanation: `${bottleProof} proof is very close to your ${proofBand(userProfile.preferredProof)} comfort zone.` };
  }
  if (delta <= 10) {
    return { score: 2.4, label: "Similar proof", explanation: `${bottleProof} proof is near bottles you rate highly.` };
  }
  if (delta <= 18) {
    return { score: 0.8, label: "Adjacent proof", explanation: `${bottleProof} proof is a little outside your usual range, but still close enough to consider.` };
  }
  return { score: -1.2, label: "Different proof range", explanation: `${bottleProof} proof is outside your current preferred range.` };
}

export function scoreBourbonDnaMatch(userProfile: UserTasteProfile, bottleProfile: BourbonDnaProfile, bottleProof?: number) {
  let score = 0;
  const matchedTags: BourbonDnaTag[] = [];
  const avoidedTags: BourbonDnaTag[] = [];

  for (const tag of bottleProfile.tags) {
    const userWeight = userProfile.weights[tag] || 0;
    const bottleWeight = bottleProfile.weights[tag] || 0.4;
    if (userWeight > 0) {
      score += userWeight * bottleWeight * 10;
      matchedTags.push(tag);
    }
    if (userProfile.avoidTags.includes(tag)) {
      score -= bottleWeight * 4;
      avoidedTags.push(tag);
    }
  }

  const proofMatch = scoreProofMatch(userProfile, bottleProof);
  score += proofMatch.score;

  let mashBillMatch: string | undefined;
  if (bottleProfile.mashBillFamily && userProfile.mashBillWeights[bottleProfile.mashBillFamily]) {
    mashBillMatch = bottleProfile.mashBillFamily;
    score += Math.min(6, userProfile.mashBillWeights[bottleProfile.mashBillFamily] * 2.4);
  }

  const uniqueMatches = Array.from(new Set(matchedTags));

  return {
    score: Math.round(score * 10) / 10,
    matchedTags: uniqueMatches,
    avoidedTags: Array.from(new Set(avoidedTags)),
    proofMatch,
    mashBillMatch,
    explanation: uniqueMatches.length
      ? `Fits your ${uniqueMatches.slice(0, 3).join(", ").toLowerCase()} profile${mashBillMatch ? ` and your ${mashBillMatch} pattern` : ""}.`
      : mashBillMatch
        ? `Matches your ${mashBillMatch} pattern.`
        : proofMatch.score > 0
          ? "Close to your preferred proof range."
          : "Rate more bottles to sharpen this match.",
  };
}
