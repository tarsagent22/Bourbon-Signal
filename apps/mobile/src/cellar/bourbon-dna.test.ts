import assert from "node:assert/strict";
import test from "node:test";
import type { MemberCollectionBottle } from "../api/types";
import { buildBourbonDna } from "./bourbon-dna";

function bottle(overrides: Partial<MemberCollectionBottle> & Pick<MemberCollectionBottle, "bottleId" | "bottleName">): MemberCollectionBottle {
  return {
    canonicalKey: overrides.bottleId,
    rating: 0,
    isRated: false,
    sealedQuantity: 0,
    openedQuantity: 0,
    finishedCount: 0,
    tastedOnly: true,
    addedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("Bourbon DNA traits come only from taste tags on strongly rated collection bottles", () => {
  const dna = buildBourbonDna([
    bottle({ bottleId: "a", bottleName: "Favorite A", isRated: true, rating: 92, tasteTags: ["Caramel", "Oak"] }),
    bottle({ bottleId: "b", bottleName: "Favorite B", isRated: true, rating: 86, tasteTags: ["Caramel", "Vanilla"] }),
    bottle({ bottleId: "c", bottleName: "Not a favorite", isRated: true, rating: 72, tasteTags: ["Smoke"] }),
    bottle({ bottleId: "d", bottleName: "Unrated", tasteTags: ["Cherry"] }),
  ]);

  assert.deepEqual(dna.supportedTraits, [
    { name: "Caramel", ratingCount: 2, averageRating: 8.9 },
  ]);
  assert.equal(dna.favoriteCount, 2);
  assert.equal(dna.ratedCount, 3);
  assert.equal(dna.taggedRatingCount, 3);
  assert.doesNotMatch(JSON.stringify(dna), /mash|proof|chemistry/i);
});

test("Bourbon DNA states its data sufficiency without overstating a small sample", () => {
  const building = buildBourbonDna([
    bottle({ bottleId: "a", bottleName: "Only rating", isRated: true, rating: 88, tasteTags: ["Caramel"] }),
  ]);
  assert.equal(building.confidence.level, "building");
  assert.equal(building.confidence.label, "Building confidence");
  assert.match(building.confidence.detail, /1 strong rating/);
  assert.match(building.confidence.detail, /1 with taste cues/);

  const established = buildBourbonDna(Array.from({ length: 8 }, (_, index) => bottle({
    bottleId: String(index),
    bottleName: `Rated ${index}`,
    isRated: true,
    rating: 80 + index,
    tasteTags: index < 5 ? ["Caramel"] : [],
  })));
  assert.equal(established.confidence.level, "established");
  assert.equal(established.confidence.label, "Established confidence");
});

test("Bourbon DNA confidence requires positive taste evidence, not ratings alone", () => {
  const dna = buildBourbonDna(Array.from({ length: 8 }, (_, index) => bottle({
    bottleId: `low-${index}`,
    bottleName: `Low rating ${index}`,
    isRated: true,
    rating: 60 + index,
    tasteTags: index < 5 ? ["Smoke"] : [],
  })));

  assert.equal(dna.supportedTraits.length, 0);
  assert.equal(dna.confidence.level, "building");
  assert.match(dna.confidence.detail, /0 strong ratings/);
  assert.equal(dna.nextAction.kind, "rate_another");
});

test("Bourbon DNA confidence requires repeated traits rather than unrelated favorite cues", () => {
  const dna = buildBourbonDna(Array.from({ length: 8 }, (_, index) => bottle({
    bottleId: `unique-${index}`,
    bottleName: `Unique favorite ${index}`,
    isRated: true,
    rating: 85,
    tasteTags: index < 5 ? [`Cue ${index}`] : [],
  })));

  assert.equal(dna.supportedTraits.length, 0);
  assert.equal(dna.confidence.level, "building");
  assert.doesNotMatch(dna.confidence.detail, /Repeated evidence/);
});

test("Bourbon DNA recommends one specific existing-bottle action before asking for more collection data", () => {
  const unrated = bottle({ bottleId: "next", bottleName: "Wild Turkey 101", sealedQuantity: 1, tastedOnly: false });
  const dna = buildBourbonDna([
    bottle({ bottleId: "rated", bottleName: "Rated bottle", isRated: true, rating: 85, tasteTags: ["Oak"] }),
    unrated,
  ]);

  assert.deepEqual(dna.nextAction, {
    kind: "rate_bottle",
    bottleId: "next",
    label: "Rate Wild Turkey 101",
    detail: "A saved bottle without a score is the clearest next data point.",
  });
});

test("Bourbon DNA asks for taste cues when every saved bottle already has a rating", () => {
  const dna = buildBourbonDna([
    bottle({ bottleId: "cues", bottleName: "Four Roses", isRated: true, rating: 84 }),
  ]);

  assert.equal(dna.nextAction.kind, "add_taste_cues");
  assert.equal(dna.nextAction.bottleId, "cues");
  assert.equal(dna.nextAction.label, "Add cues to Four Roses");
});
