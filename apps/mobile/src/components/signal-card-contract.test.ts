import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const card = readFileSync(resolve(process.cwd(), "src/components/SignalCard.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/(app)/signal/[id].tsx"), "utf8");

function styleBlock(name: string) {
  return card.match(new RegExp(`${name}: \\{[^}]+\\}`))?.[0] || "";
}

test("Signal cards use an editorial rarity-time-title hierarchy without the legacy Market label", () => {
  assert.match(card, /appearance\.rarityLabel/);
  assert.doesNotMatch(card, /appearance\.sourceLabel|sourceLabel|labelKeyline/);
  assert.match(card, /reportAge\(signal, now\)/);
  assert.match(card, /signalRowBottleIdentity\(signal\.bottle\.name\)/);
  assert.match(card, /styles\.bottleSubtitle/);
  assert.match(styleBlock("bottle"), /fontFamily: fonts\.heading/);
  assert.match(styleBlock("price"), /fontSize: typeScale\.small/);
});

test("Intel uses open illustrated rows with inline price and reported quantity", () => {
  assert.match(card, /name="storefront-outline"/);
  assert.match(card, /name="map-marker-outline"/);
  assert.match(card, /styles\.factsRow/);
  assert.doesNotMatch(card, /styles\.footer/);
  assert.match(styleBlock("card"), /minHeight: 120/);
  assert.ok(card.indexOf('styles.details') < card.indexOf('styles.factsRow'), 'store/location precede compact hunting footer');
  assert.match(card, /styles\.factsRow[\s\S]*styles\.metricText/);
  assert.match(card, /<CellarBottleArtwork[\s\S]*size="feed"/);
  assert.match(card, /name="chevron-right"/);
  assert.doesNotMatch(styleBlock("card"), /backgroundColor|borderWidth|borderRadius/);
  const feed = readFileSync(resolve(process.cwd(), "app/(app)/(tabs)/index.tsx"), "utf8");
  assert.match(feed, /ItemSeparatorComponent=/);
  assert.match(feed, /separator: \{ height: StyleSheet\.hairlineWidth/);
  assert.match(styleBlock("bottle"), /fontSize: typeScale\.subheading/);
  assert.doesNotMatch(card, /signalCardSummary|styles\.note/);
  assert.doesNotMatch(card, /"Available now"/);
  assert.match(detail, /<Detail label="Location" value=\{presented\?\.address \|\|/);
});

test("Intel cards always state availability in text rather than relying on color", () => {
  assert.match(card, /signalRowFacts\(signal, now\)/);
  assert.match(card, /styles\.status/);
  assert.match(card, /signalAccessibilityLabel\(signal, now\)/);
});

test("Community cards preserve chosen-name attribution and always render the immutable member tag separately", () => {
  const community = readFileSync(resolve(process.cwd(), "src/components/CommunityPostCard.tsx"), "utf8");
  assert.match(card, /<CommunityPostCard signal=\{signal\}/);
  assert.match(community, /signalMemberTagLabel\(signal\)/);
  assert.match(community, /signal\.source\.actor\?\.displayName \|\| member/);
  assert.match(community, /name !== member/);
  assert.match(detail, /signalMemberTagLabel\(signal\)/);
  assert.match(detail, /presented\?\.reporter \? <Text style=\{styles\.reporter\}>Reported by \{presented\.reporter\}/);
  assert.match(detail, /memberTag \? <View style=\{styles\.memberTag\}/);
  assert.doesNotMatch(detail, /presented\?\.reporter \? `Reported by/);
});
