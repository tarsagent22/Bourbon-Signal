import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const source = read("../../app/(app)/(tabs)/hq.tsx");
const layout = read("../../app/(app)/(tabs)/_layout.tsx");
const tabs = read("../navigation/member-tabs.ts");
const referralApi = read("../../../../src/app/api/referrals/me/route.ts");
const userFacingAccountCopy = [
  read("../../app/(app)/(tabs)/cellar.tsx"),
  read("../../app/(app)/(tabs)/post.tsx"),
  read("../../app/(app)/cellar/add.tsx"),
  read("../../store/app-store-metadata.json"),
].join("\n");

test("the legacy HQ route is visibly named Account with a person icon", () => {
  assert.match(layout, /name="hq" options=\{\{ title: "Account"/);
  assert.match(tabs, /route: "hq", label: "Account", icon: "account-circle-outline"/);
  assert.match(source, /export default function AccountScreen/);
  assert.doesNotMatch(source, /MEMBER COMMAND CENTER|>HQ</);
  assert.doesNotMatch(userFacingAccountCopy, /\bHQ\b/);
});

test("Account leads with a compact member and points summary", () => {
  assert.doesNotMatch(source, /<ScreenIntro/);
  assert.match(source, /rewardCatalogSummary/);
  assert.match(source, /ready to redeem/);
  assert.match(source, /pts to/);
  assert.match(source, /ACCOUNT/);
});

test("profile and everyday account controls appear before rewards", () => {
  const profile = source.indexOf("<SectionTitle>Profile</SectionTitle>");
  const membership = source.indexOf("Manage membership");
  const shipping = source.indexOf("Shipping information");
  const rewards = source.indexOf(">Rewards</SectionTitle>");
  assert.ok(profile >= 0 && membership > profile && shipping > membership && rewards > shipping);
  assert.match(source, /Support/);
  assert.match(source, /Privacy policy/);
  assert.match(source, /Sign out/);
  assert.doesNotMatch(source, /showAccount/);
  assert.doesNotMatch(source, /Alert me about|Push notifications|Monitoring areas/);
});

test("Account previews rewards instead of rendering the whole catalog", () => {
  assert.match(source, /function FeaturedRewardCard/);
  assert.match(source, /function RewardProgressRow/);
  assert.match(source, /View all rewards/);
  assert.match(source, /Redemption history/);
  assert.match(source, /Free members can keep earning Signal Points\. A paid membership is required before rewards can be redeemed\./);
  assert.doesNotMatch(source, /orderedRewards\.filter\([\s\S]*\.map\(/);
});

test("Ways to earn loads the canonical referral program and personal invite", () => {
  assert.match(source, /ReferralSummary/);
  assert.match(source, /api\.getReferralSummary/);
  assert.match(source, /referral\.program\.pointsByTier/);
  assert.match(source, /referral\.program\.upgradeAwardsDifferenceOnly/);
  assert.match(source, /Free \(first/);
  assert.match(source, /upgrade differences only/);
  assert.match(source, /Share referral link/);
  assert.match(source, /referral\.referralLink/);
  assert.match(source, /Share\.share/);
  assert.match(source, /shareError \? <Text accessibilityRole="alert"/);
  assert.match(source, /setShareError\(caught instanceof Error/);
  assert.match(source, /ActivityIndicator accessibilityLabel="Loading referral details"/);
  assert.match(source, /retryButton: \{ minHeight: 44/);
  assert.match(referralApi, /REFERRAL_PROGRAM/);
  assert.match(referralApi, /program:\s*REFERRAL_PROGRAM/);
});

test("noncritical referrals cannot block primary Account data and stale requests cannot win", () => {
  assert.match(source, /const loadReferral = useCallback/);
  assert.match(source, /void loadReferral\(fresh\)/);
  assert.match(source, /Promise\.allSettled\(\[\s*api\.getMemberProfile\(\{ fresh \}\),\s*api\.getSignalPoints\(\{ fresh \}\),\s*\]\)/);
  assert.match(source, /referralRequestId = useRef\(0\)/);
  assert.match(source, /accountRequestId = useRef\(0\)/);
  assert.match(source, /referralRequestId\.current !== currentReferralRequestId/);
  assert.match(source, /accountRequestId\.current !== currentAccountRequestId/);
  assert.match(source, /setReferral\(null\)/);
  assert.match(source, /setProfile\(null\)/);
  assert.match(source, /setPoints\(null\)/);
  assert.match(source, /pointsResult\.reason instanceof MobileApiError && pointsResult\.reason\.status === 401/);
  assert.match(source, /onPress=\{\(\) => void loadReferral\(true\)\}/);
});

test("shipping appears only for paid members or earned referral-glass fulfillment", () => {
  assert.match(source, /canSaveShipping = Boolean\(profile\?\.membership\.paid \|\| \(referral\?\.founderGlassesEarned \|\| 0\) > 0\)/);
  assert.match(source, /\{canSaveShipping \? <LinkRow label="Shipping information"/);
});

test("featured rewards preserve physical and digital fulfillment truth", () => {
  assert.match(source, /reward\.fulfillmentType === "physical"/);
  assert.match(source, /Physical reward · shipping details confirmed before redemption/);
  assert.match(source, /Digital reward · delivery details confirmed before redemption/);
});

test("Account keeps diagnostics collapsed and destructive actions separated", () => {
  assert.match(source, /showDiagnostics/);
  assert.match(source, /accessibilityState=\{\{ expanded:/);
  assert.match(source, /Share diagnostics/);
  assert.match(source, /Data & privacy/);
  assert.match(source, /Request account deletion/);
});

test("reward progress exposes a bounded semantic accessibility value", () => {
  assert.match(source, /const percent = Math\.round\(Math\.min\(1, Math\.max\(0, ratio\)\) \* 100\)/);
  assert.match(source, /<View accessible accessibilityRole="progressbar" accessibilityLabel=\{`\$\{label\}: \$\{percent\} percent complete`\}/);
  assert.match(source, /accessibilityValue=\{\{ min: 0, max: 100, now: percent \}\}/);
  assert.match(source, /member\.redemptionEligible && !availability\.soldOut \? <ProgressBar/);
  assert.match(source, /Membership required to redeem/);
});
