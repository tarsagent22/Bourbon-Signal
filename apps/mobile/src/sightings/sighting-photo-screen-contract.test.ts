import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const post = readFileSync(new URL("../../app/(app)/(tabs)/post.tsx", import.meta.url), "utf8");
const nativePhoto = readFileSync(new URL("./sighting-photo-native.ts", import.meta.url), "utf8");

test("Post offers camera and library evidence with preview replacement and removal", () => {
  for (const label of ["Photo evidence", "Take photo", "Choose photo", "Replace photo", "Remove photo"]) assert.match(post, new RegExp(label));
  assert.match(post, /<Image[^>]+source=\{\{ uri: selectedPhoto\.uri \}\}/);
  assert.match(post, /Evidence may appear publicly with this sighting/);
  assert.match(nativePhoto, /launchCameraAsync/);
  assert.match(nativePhoto, /launchImageLibraryAsync/);
  assert.match(nativePhoto, /exif: false/);
  assert.match(nativePhoto, /SaveFormat\.JPEG/);
});

test("a failed photo upload retries against the existing sighting without reposting it", () => {
  assert.match(post, /pendingPhotoAttachment/);
  assert.match(post, /if \(pendingPhotoAttachment\)[\s\S]*retryPhotoUpload/);
  assert.match(post, /journal\.resume\(api, sightingPhotoBlob\)/);
  const journal = readFileSync(new URL('./photo-journal.ts', import.meta.url), 'utf8');
  assert.match(journal, /api\.uploadSightingPhoto/);
  assert.match(journal, /result\.sighting\.id/);
  assert.match(post, /journal\.prepare\(built.payload, requestBinding.key, retained\)/);
  assert.match(post, /Retry photo/);
  assert.doesNotMatch(post, /Finish without photo|finishWithoutPhoto|api\.discardSightingPhoto/, "post-submit evidence stays in retry or recovery until one photo is attached");
});
