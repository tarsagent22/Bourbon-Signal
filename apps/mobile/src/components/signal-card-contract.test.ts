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
  assert.match(styleBlock("price"), /fontFamily: "Fraunces_700Bold"/);
});

test("Signal cards use designed store and location rows with a concise anchored footer", () => {
  assert.match(card, /name="storefront-outline"/);
  assert.match(card, /name="map-marker-outline"/);
  assert.match(card, /styles\.footer/);
  assert.match(card, /styles\.metricDot/);
  assert.doesNotMatch(card, /signalCardSummary|styles\.note/);
});

test("Signal cards separate with spacing and a quiet surface instead of divider lines", () => {
  assert.match(styleBlock("card"), /backgroundColor: "#14110E"/);
  assert.match(styleBlock("card"), /borderRadius: 10/);
  assert.match(styleBlock("card"), /marginBottom: 10/);
  assert.doesNotMatch(styleBlock("card"), /borderTopWidth|borderBottomWidth/);
  assert.doesNotMatch(styleBlock("footer"), /borderTopWidth|borderTopColor/);
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
