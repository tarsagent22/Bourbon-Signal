import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const CAMERA_PERMISSION_MESSAGE = "Allow Bourbon Signal to use your camera for optional sighting evidence that may appear publicly with your Signal.";
const PHOTO_LIBRARY_PERMISSION_MESSAGE = "Allow Bourbon Signal to access only photos you choose as optional sighting evidence that may appear publicly with your Signal.";

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

assert.equal(app.version, "1.1.0", "the camera and push native candidate must use a fresh public runtime version");
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

for (const dependency of ["expo-image-picker", "expo-image-manipulator", "expo-file-system"]) {
  assert.match(pkg.dependencies?.[dependency] || "", /^~57\./, `${dependency} must use the Expo SDK-compatible release`);
}
assert.equal(pkg.dependencies?.["expo-camera"], undefined, "the unused custom camera/barcode module must not ship");
assert.equal(pkg.dependencies?.["expo-location"], undefined, "unused location code and permission declarations must not ship");

const pluginEntry = (name) => app.plugins?.find((plugin) => plugin === name || (Array.isArray(plugin) && plugin[0] === name));
const pluginOptions = (name) => {
  const plugin = pluginEntry(name);
  assert.ok(plugin, `${name} must be configured as an Expo config plugin`);
  assert.ok(Array.isArray(plugin), `${name} must declare explicit native permission options`);
  return plugin[1];
};

assert.equal(pluginEntry("expo-camera"), undefined);
assert.equal(pluginEntry("expo-location"), undefined);
assert.deepEqual(pluginOptions("expo-notifications"), {
  icon: "./assets/notification-icon.png",
  color: "#C48A4A",
  defaultChannel: "radar",
});
assert.deepEqual(pluginOptions("expo-image-picker"), {
  photosPermission: PHOTO_LIBRARY_PERMISSION_MESSAGE,
  cameraPermission: CAMERA_PERMISSION_MESSAGE,
  microphonePermission: false,
});
assert.deepEqual(app.android?.permissions, [
  "android.permission.CAMERA",
]);
assert.deepEqual(app.android?.blockedPermissions, [
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
]);

for (const launchPath of ["app/_layout.tsx", "app/index.tsx", "app/(app)/_layout.tsx"]) {
  const launchSource = read(launchPath);
  assert.doesNotMatch(launchSource, /request(?:Camera|MediaLibrary|Foreground|Background)?PermissionsAsync/,
    `native permissions must never be requested from ${launchPath}`);
  assert.doesNotMatch(launchSource, /from ["']expo-(?:camera|image-picker|location)["']/,
    `native capabilities must not initialize from ${launchPath}`);
}

const expoCli = resolve(root, "node_modules/expo/bin/cli");
assert.ok(existsSync(expoCli), "Expo must be installed before native config inspection");
const configResult = spawnSync(process.execPath, [expoCli, "config", "--type", "introspect", "--json"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 10 * 1024 * 1024,
});
assert.equal(configResult.status, 0, `Expo native config inspection failed:\n${configResult.stderr || configResult.stdout}`);
const configStart = configResult.stdout.indexOf("{");
const configEnd = configResult.stdout.lastIndexOf("}");
assert.ok(configStart >= 0 && configEnd > configStart, "Expo native config inspection did not return JSON");
const resolvedNativeConfig = JSON.parse(configResult.stdout.slice(configStart, configEnd + 1));

const infoPlist = resolvedNativeConfig._internal?.modResults?.ios?.infoPlist || {};
assert.equal(infoPlist.NSCameraUsageDescription, CAMERA_PERMISSION_MESSAGE);
assert.equal(infoPlist.NSPhotoLibraryUsageDescription, PHOTO_LIBRARY_PERMISSION_MESSAGE);
for (const forbiddenKey of [
  "NSMicrophoneUsageDescription",
  "NSLocationWhenInUseUsageDescription",
  "NSLocationAlwaysAndWhenInUseUsageDescription",
  "NSLocationAlwaysUsageDescription",
  "NSMotionUsageDescription",
]) assert.equal(forbiddenKey in infoPlist, false, `${forbiddenKey} must not be emitted`);
assert.equal(infoPlist.UIBackgroundModes?.includes("location") || false, false, "iOS background location must stay disabled");

const manifestPermissions = resolvedNativeConfig._internal?.modResults?.android?.manifest?.manifest?.["uses-permission"] || [];
const activeAndroidPermissions = manifestPermissions
  .filter((entry) => entry?.$?.["tools:node"] !== "remove")
  .map((entry) => entry?.$?.["android:name"]);
const blockedAndroidPermissions = manifestPermissions
  .filter((entry) => entry?.$?.["tools:node"] === "remove")
  .map((entry) => entry?.$?.["android:name"]);
for (const requiredPermission of app.android.permissions) {
  assert.ok(activeAndroidPermissions.includes(requiredPermission), `${requiredPermission} must be present in the resolved Android manifest`);
}
for (const blockedPermission of app.android.blockedPermissions) {
  assert.ok(blockedAndroidPermissions.includes(blockedPermission), `${blockedPermission} must be removed from the resolved Android manifest`);
}
for (const forbiddenPermission of [
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.ACTIVITY_RECOGNITION",
  "com.google.android.gms.permission.ACTIVITY_RECOGNITION",
]) assert.equal(activeAndroidPermissions.includes(forbiddenPermission), false, `${forbiddenPermission} must not be active`);

assert.deepEqual(png("assets/notification-icon.png"), { width: 96, height: 96, colorType: 6 }, "Android notification icon must be a transparent 96px RGBA PNG");

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
assert.match(privacyInventory, /prompts only after an explicit member action/i);
assert.match(privacyInventory, /optional sighting evidence/i);
assert.match(privacyInventory, /resized.*metadata/i);
assert.match(privacyInventory, /microphone and all location permissions remain disabled/i);
assert.doesNotMatch(privacyInventory, /No camera, photo library, contacts, microphone, Bluetooth, or device-location permission/);
const reviewNotes = read("store/app-review-notes.md");
assert.doesNotMatch(`${JSON.stringify(app)}\n${privacyInventory}\n${reviewNotes}`, /Trip Mode|trip_mode|trip-mode/i,
  "release-facing configuration and documentation must not advertise removed Trip Mode behavior");
assert.equal(existsSync(resolve(root, "src/home/trip-mode.ts")), false, "removed Trip Mode implementation must not ship");
assert.equal(existsSync(resolve(root, "src/home/trip-mode.test.ts")), false, "removed Trip Mode tests must not ship");
assert.doesNotMatch(pkg.scripts?.test || "", /trip-mode/i, "the mobile test command must not reference removed Trip Mode tests");
assert.match(reviewNotes, /Review the Home tab/);
assert.match(reviewNotes, /open a Signal's Bottle Profile/);
assert.match(reviewNotes, /Account → Privacy & Support → Account deletion help/);
assert.doesNotMatch(reviewNotes, /Signals tab|Open HQ|HQ → Request account deletion/);
assert.match(reviewNotes, /no permission prompt runs at app launch/i);
assert.match(reviewNotes, /optional sighting evidence/i);
assert.match(reviewNotes, /does not expose barcode matching/i);
assert.match(reviewNotes, /does not request microphone or location/i);
const releaseChecklist = read("store/release-checklist.md");
assert.match(releaseChecklist, /camera and selected-photo evidence/i);
assert.match(releaseChecklist, /manual posting without a photo/i);
const mobileReadme = read("README.md");
assert.match(mobileReadme, /optional sighting evidence/i);
assert.doesNotMatch(mobileReadme, /destination-entry|Trip Mode|trip_mode|trip-mode/i);
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

const hq = read("app/(app)/(tabs)/hq.tsx");
const appLayout = read("app/(app)/_layout.tsx");
const nativeSupport = read("app/(app)/account/support.tsx");
const nativePrivacy = read("app/(app)/account/privacy.tsx");
assert.match(hq, /Privacy policy/);
assert.match(hq, /Account deletion help/);
assert.match(hq, /Support/);
assert.match(hq, /router\.push\("\/\(app\)\/account\/support"\)/);
assert.match(hq, /router\.push\("\/\(app\)\/account\/privacy"\)/);
assert.doesNotMatch(hq, /Linking|openExternal|https?:\/\//);
assert.match(appLayout, /name="account\/support"/);
assert.match(appLayout, /name="account\/privacy"/);
assert.match(nativeSupport, /support@bourbonsignal\.com/);
assert.match(nativePrivacy, /12\. Changes to this policy/);
assert.match(hq, /ScrollView/, "HQ account controls must remain reachable on compact screens and with larger text");
assert.equal(existsSync(resolve(root, "app/(app)/(tabs)/account.tsx")), false, "HQ must replace the duplicate Account tab");

const tabs = read("app/(app)/(tabs)/_layout.tsx");
for (const route of ["index", "radar", "post", "cellar", "hq"]) assert.match(tabs, new RegExp(`name=[\"']${route}[\"']`), `missing native ${route} tab`);
const memberTabContract = read("src/navigation/member-tabs.ts");
assert.match(memberTabContract, /bottle-soda-classic-outline/);
assert.doesNotMatch(memberTabContract, /wine-glass/);

const icon = readFileSync(resolve(root, "assets/icon.png"));
const templateIcon = readFileSync(resolve(root, "assets/template-icon.sha256"), "utf8").trim();
assert.notEqual(createHash("sha256").update(icon).digest("hex"), templateIcon, "Expo template icon must be replaced");

console.log("Mobile release-readiness contract passed.");
