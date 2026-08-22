import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const png = (path) => {
  const bytes = readFileSync(resolve(root, path));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${path} must be a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
};

const app = readJson("app.json").expo;
const eas = readJson("eas.json");
const pkg = readJson("package.json");

assert.equal(app.version, "1.0.0", "the first store candidate must use a public 1.0.0 version");
assert.equal(app.ios?.bundleIdentifier, "com.bourbonsignal.app");
assert.equal(app.ios?.config?.usesNonExemptEncryption, false);
assert.equal(app.runtimeVersion?.policy, "appVersion");
assert.equal(app.extra?.eas?.projectId, "693a1966-5bfc-4f25-9fe4-e39c009ec04a");
assert.equal(app.updates?.url, "https://u.expo.dev/693a1966-5bfc-4f25-9fe4-e39c009ec04a");
assert.equal(app.updates?.checkAutomatically, "ON_LOAD");
assert.equal(app.updates?.fallbackToCacheTimeout, 0);
assert.equal(eas.cli?.appVersionSource, "remote");
assert.equal(eas.build?.production?.autoIncrement, true);
assert.equal(eas.build?.production?.channel, "production");
assert.equal(eas.build?.production?.environment, "production");
assert.ok(eas.submit?.production, "a production EAS Submit profile must exist");
assert.ok(pkg.scripts?.["verify:release-readiness"], "release readiness must be a repeatable package gate");

for (const path of [
  "store/app-store-metadata.json",
  "store/app-privacy.md",
  "store/app-review-notes.md",
  "store/screenshot-spec.md",
  "store/release-checklist.md",
  "assets/brand-assets.json",
  "../../src/app/support/page.tsx",
  "../../src/app/legal/privacy/page.tsx",
]) assert.ok(existsSync(resolve(root, path)), `missing ${path}`);

const metadata = readJson("store/app-store-metadata.json");
assert.ok(metadata.name.length <= 30, "App Store name exceeds 30 characters");
assert.ok(metadata.subtitle.length <= 30, "App Store subtitle exceeds 30 characters");
assert.ok(metadata.promotionalText.length <= 170, "promotional text exceeds 170 characters");
assert.ok(metadata.keywords.length <= 100, "keywords exceed 100 characters");
assert.equal(metadata.privacyPolicyUrl, "https://www.bourbonsignal.com/legal/privacy");
assert.equal(metadata.supportUrl, "https://www.bourbonsignal.com/support");

const privacyInventory = read("store/app-privacy.md");
assert.match(privacyInventory, /User Content — Customer Support \| Yes/);
assert.doesNotMatch(privacyInventory, /\| User Content \| No collection/);
assert.match(read("../../src/app/legal/privacy/page.tsx"), /use the mobile app/);
assert.match(read("../../src/app/support/page.tsx"), /updated="August 21, 2026"/);

assert.deepEqual(png("assets/icon.png"), { width: 1024, height: 1024, colorType: 2 }, "iOS icon must be opaque 1024px RGB");
assert.deepEqual({ ...png("assets/splash-icon.png"), colorType: undefined }, { width: 512, height: 512, colorType: undefined });
assert.deepEqual({ ...png("assets/android-icon-foreground.png"), colorType: undefined }, { width: 512, height: 512, colorType: undefined });
assert.deepEqual({ ...png("assets/android-icon-monochrome.png"), colorType: undefined }, { width: 432, height: 432, colorType: undefined });

const brandManifest = readJson("assets/brand-assets.json");
assert.equal(brandManifest.schemaVersion, "bourbon-signal/native-brand-assets@1");
const sourceMark = readFileSync(resolve(root, "../../public/icon-512.png"));
assert.equal(createHash("sha256").update(sourceMark).digest("hex"), brandManifest.source.sha256);
for (const [name, expected] of Object.entries(brandManifest.assets)) {
  const bytes = readFileSync(resolve(root, "assets", name));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256, `${name} does not match the brand manifest`);
  const actual = png(`assets/${name}`);
  assert.deepEqual([actual.width, actual.height], [expected.width, expected.height], `${name} dimensions do not match the brand manifest`);
}

const account = read("app/(app)/(tabs)/account.tsx");
assert.match(account, /Privacy policy/);
assert.match(account, /Request account deletion/);
assert.match(account, /Support/);
assert.match(account, /Linking\.openURL/);
assert.match(account, /ScrollView/, "account controls must remain reachable on compact screens and with larger text");

const icon = readFileSync(resolve(root, "assets/icon.png"));
const templateIcon = readFileSync(resolve(root, "assets/template-icon.sha256"), "utf8").trim();
assert.notEqual(createHash("sha256").update(icon).digest("hex"), templateIcon, "Expo template icon must be replaced");

console.log("Mobile release-readiness contract passed.");
