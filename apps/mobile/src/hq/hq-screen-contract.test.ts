import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../../app/(app)/(tabs)/hq.tsx", import.meta.url)), "utf8");

test("HQ leads with a member command summary instead of a repeated page intro", () => {
  assert.doesNotMatch(source, /<ScreenIntro/);
  assert.match(source, /MEMBER COMMAND CENTER/);
  assert.match(source, /rewardCatalogSummary/);
  assert.match(source, /ready to redeem/);
  assert.match(source, /pts to/);
});

test("HQ keeps secondary settings and diagnostics collapsed until requested", () => {
  assert.match(source, /Edit public name/);
  assert.match(source, /setDisplayNameDraft\(profile\.customDisplayName \|\| ""\)/);
  assert.match(source, /showAccount/);
  assert.match(source, /showDiagnostics/);
  assert.match(source, /accessibilityState=\{\{ expanded:/);
  assert.match(source, /Share diagnostics/);
  assert.doesNotMatch(source, /How to earn points<\/Text><\/Pressable><\/MemberCard>/);
});

test("HQ reward progress exposes a bounded semantic accessibility value", () => {
  assert.match(source, /const percent = Math\.round\(Math\.min\(1, Math\.max\(0, ratio\)\) \* 100\)/);
  assert.match(source, /<View accessible accessibilityRole="progressbar" accessibilityLabel=\{`\$\{label\}: \$\{percent\} percent complete`\}/);
  assert.match(source, /accessibilityValue=\{\{ min: 0, max: 100, now: percent \}\}/);
  assert.match(source, /member\.redemptionEligible && !availability\.soldOut \? <ProgressBar/);
  assert.match(source, /return <View style=\{styles\.rewardRow\}>[\s\S]*<Pressable accessibilityRole="link"/);
  assert.match(source, /Membership required to redeem/);
});

test("HQ distinguishes an unlocked reward from compact locked progress rows", () => {
  assert.match(source, /function FeaturedRewardCard/);
  assert.match(source, /function RewardProgressRow/);
  assert.match(source, /Redeem reward/);
  assert.match(source, /progressTrack/);
});
