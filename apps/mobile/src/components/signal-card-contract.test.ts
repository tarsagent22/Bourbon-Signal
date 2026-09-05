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
  assert.match(card, /relativeSignalTime/);
  assert.match(card, /presentBottleIdentity\(signal\.bottle\.name\)/);
  assert.match(card, /styles\.bottleSubtitle/);
  assert.match(styleBlock("bottle"), /fontFamily: "Fraunces_700Bold"/);
  assert.match(styleBlock("price"), /fontSize: 13/);
});

test("Signal cards use compact borderless rows with inline price and reported quantity", () => {
  assert.match(card, /name="storefront-outline"/);
  assert.match(card, /name="map-marker-outline"/);
  assert.match(card, /styles\.factsRow/);
  assert.doesNotMatch(card, /styles\.footer|styles\.metricDot/);
  assert.match(styleBlock("card"), /minHeight: 120/);
  assert.doesNotMatch(styleBlock("card"), /borderWidth|borderRadius|backgroundColor/);
  assert.match(styleBlock("bottle"), /fontSize: 18/);
  assert.doesNotMatch(card, /signalCardSummary|styles\.note/);
  assert.doesNotMatch(card, /"Available now"/);
  assert.match(detail, /<Detail label="Location" value=\{presented\?\.address \|\|/);
});

test("Intel cards always state availability in text rather than relying on color", () => {
  assert.match(card, /const showStatus = !community \|\|/);
  assert.match(card, /styles\.status/);
  assert.match(card, /signalCardStatusLabel/);
});

test("Community cards preserve chosen-name attribution and always render the immutable member tag separately", () => {
  assert.match(card, /signalReporterAttribution/);
  assert.match(card, /signalMemberTagLabel/);
  assert.match(card, /memberTag \? <View style=\{styles\.memberTag\}/);
  assert.match(card, /showStatus \? <View style=\{styles\.statusRow\}/);
  assert.match(card, /styles\.authorRow/);
  assert.match(detail, /signalMemberTagLabel\(signal\)/);
  assert.match(detail, /presented\?\.reporter \? <Text style=\{styles\.reporter\}>Reported by \{presented\.reporter\}/);
  assert.match(detail, /memberTag \? <View style=\{styles\.memberTag\}/);
  assert.doesNotMatch(detail, /presented\?\.reporter \? `Reported by/);
});
