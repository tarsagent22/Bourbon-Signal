export const BOURBON_DNA_TAGS = [
  "Caramel",
  "Vanilla",
  "Oak",
  "Cherry",
  "Spice",
  "Proof heat",
  "Sweet",
  "Dark fruit",
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
}

export interface CollectionTasteInput {
  canonicalKey: string;
  bottleName: string;
  rating: number;
  tasteTags?: string[];
  wouldBuyAgain?: boolean;
}

export interface UserTasteProfile {
  weights: Partial<Record<BourbonDnaTag, number>>;
  favoriteTags: BourbonDnaTag[];
  avoidTags: BourbonDnaTag[];
  bottleCount: number;
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

export function createBourbonDnaProfile(input: BourbonDnaInput): BourbonDnaProfile {
  const text = [input.name, input.brand, input.producer, input.category, ...(input.aliases || [])].filter(Boolean).join(" ").toLowerCase();
  const profile: BourbonDnaProfile = { tags: [], weights: {}, method: "inferred", confidence: "medium", signals: [] };

  for (const rawTag of input.userTags || []) {
    const tag = normalizeTag(rawTag);
    if (tag) addTag(profile, tag, 1, "user taste cue");
  }

  if (input.category === "rye" || /\brye\b/.test(text)) addTag(profile, "Spice", 0.78, "rye/high-spice style");
  if ((input.proof || 0) >= 105 || /barrel proof|full proof|cask strength|single barrel|bond|bottled.?in.?bond|101/.test(text)) addTag(profile, "Proof heat", 0.72, "proof/style signal");
  if (/double oak|double oaked|toasted|1910|woodford|old forester|brown.?forman|elijah craig|knob creek|russell|wild turkey/.test(text)) addTag(profile, "Oak", 0.72, "oak/producer pattern");
  if (/maker|weller|larceny|wheated|rebel|old fitzgerald/.test(text)) addTag(profile, "Sweet", 0.7, "wheated/sweet profile");
  if (/buffalo trace|eagle rare|e\.h\.? taylor|stagg|blanton|benchmark|sazerac|1792|barton/.test(text)) addTag(profile, "Caramel", 0.66, "brand family pattern");
  if (/four roses|high rye|redemption|bulleit|new riff|rye/.test(text)) addTag(profile, "Spice", 0.74, "high-rye pattern");
  if (/michter|angel|finished|port|sherry|rum|cognac|amburana|redwood|casey jones|jefferson/.test(text)) addTag(profile, "Dark fruit", 0.62, "finish/producer pattern");
  if (/old forester|woodford|buffalo trace|eagle rare|blanton|weller|maker|four roses|russell|wild turkey|knob creek|elijah craig|1792/.test(text)) addTag(profile, "Vanilla", 0.6, "classic bourbon profile");
  if (/1910|double oak|toasted|woodford|angel|honey|maple|sweet|dessert/.test(text)) addTag(profile, "Sweet", 0.75, "dessert/sweet-oak signal");
  if (/booker|baker|knob creek|jim beam|beam|basil hayden/.test(text)) addTag(profile, "Nutty", 0.62, "Beam/nutty profile");
  if (/jack daniel|charcoal|smoke|smoky/.test(text)) addTag(profile, "Smoky", 0.58, "charcoal/smoke signal");
  if (/cherry|red fruit|fruit/.test(text)) addTag(profile, "Cherry", 0.58, "fruit descriptor signal");

  if (!profile.tags.length) addTag(profile, "Balanced", 0.45, "fallback balanced profile");
  if (profile.tags.length < 2 && !profile.tags.includes("Balanced")) addTag(profile, "Balanced", 0.4, "secondary balance signal");

  if ((input.userTags || []).some((tag) => TAG_SET.has(tag))) profile.method = "user_augmented";
  profile.confidence = profile.signals.length >= 4 ? "high" : profile.signals.length >= 2 ? "medium" : "low";
  return profile;
}

export function buildUserTasteProfile(collection: CollectionTasteInput[]): UserTasteProfile {
  const weights: Partial<Record<BourbonDnaTag, number>> = {};
  const avoid: Partial<Record<BourbonDnaTag, number>> = {};

  for (const entry of collection) {
    const rating = Math.max(0, Math.min(100, entry.rating || 0));
    const likedWeight = rating >= 80 ? (rating - 75) / 25 : rating >= 65 ? 0.25 : 0;
    const avoidWeight = rating < 50 ? (50 - rating) / 50 : 0;
    const tags = (entry.tasteTags || []).map((tag) => normalizeTag(tag)).filter((tag): tag is BourbonDnaTag => Boolean(tag));
    for (const tag of tags) {
      if (likedWeight) weights[tag] = (weights[tag] || 0) + likedWeight * (entry.wouldBuyAgain === false ? 0.45 : 1);
      if (avoidWeight) avoid[tag] = (avoid[tag] || 0) + avoidWeight;
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

  return { weights, favoriteTags, avoidTags, bottleCount: collection.length };
}

export function scoreBourbonDnaMatch(userProfile: UserTasteProfile, bottleProfile: BourbonDnaProfile) {
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

  return {
    score: Math.round(score * 10) / 10,
    matchedTags: Array.from(new Set(matchedTags)),
    avoidedTags: Array.from(new Set(avoidedTags)),
    explanation: matchedTags.length
      ? `Matches your ${Array.from(new Set(matchedTags)).slice(0, 3).join(" + ")} preference signals.`
      : "Needs more collection taste signals before this is a strong match.",
  };
}
