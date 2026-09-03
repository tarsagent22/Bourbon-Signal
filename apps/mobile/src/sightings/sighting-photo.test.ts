import assert from "node:assert/strict";
import test from "node:test";
import {
  JPEG_NORMALIZATION_QUALITY,
  MAX_NATIVE_SIGHTING_PHOTO_BYTES,
  createPendingPhotoAttachment,
  nextPhotoNormalizationPass,
  photoSubmitMode,
  stagePendingPhotoUpload,
} from "./sighting-photo";

const photo = { uri: "file:///proof.jpg", width: 3024, height: 4032, fileName: "proof.jpg", mimeType: "image/jpeg" } as const;

test("normalizes camera evidence to privacy-safe JPEG dimensions and quality", () => {
  assert.equal(JPEG_NORMALIZATION_QUALITY, 0.72);
  assert.deepEqual(nextPhotoNormalizationPass({ width: 3024, byteSize: 8_000_000, attempt: 0 }), { width: 1600, quality: 0.72 });
  assert.deepEqual(nextPhotoNormalizationPass({ width: 1600, byteSize: MAX_NATIVE_SIGHTING_PHOTO_BYTES + 1, attempt: 1 }), { width: 1200, quality: 0.55 });
  assert.equal(nextPhotoNormalizationPass({ width: 1200, byteSize: MAX_NATIVE_SIGHTING_PHOTO_BYTES + 1, attempt: 2 }), null);
});

test("pending attachment switches posting to upload-only retry", () => {
  const pending = createPendingPhotoAttachment("sighting_abc", photo);
  assert.equal(pending.sightingId, "sighting_abc");
  assert.equal(photoSubmitMode(null), "submit-sighting");
  assert.equal(photoSubmitMode(pending), "upload-only");
});

test("stages a deterministic pathname before public bytes are uploaded", () => {
  const pending = createPendingPhotoAttachment("sighting_abc", photo);
  assert.deepEqual(stagePendingPhotoUpload(pending, 1234).blob, {
    pathname: "sighting-proofs/sighting_abc/1234.jpg",
  });
});
