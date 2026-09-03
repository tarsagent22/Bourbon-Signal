import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_PERMISSION_MESSAGE,
  NATIVE_CAPABILITY_PURPOSES,
  PHOTO_LIBRARY_PERMISSION_MESSAGE,
  nativeCapabilityPolicyFor,
  permissionDenialFallbackFor,
} from "./permission-policy";

test("native capability purposes are explicit, lazy, and limited to real product uses", () => {
  assert.deepEqual(NATIVE_CAPABILITY_PURPOSES, [
    "capture_bottle_or_shelf_evidence",
    "choose_bottle_or_shelf_evidence",
  ]);
  for (const purpose of NATIVE_CAPABILITY_PURPOSES) {
    const policy = nativeCapabilityPolicyFor(purpose);
    assert.equal(policy.requestTiming, "after_explicit_user_action");
    assert.equal(policy.allowsBarcodeCatalogMatch, false);
    assert.equal(policy.allowsPhotoUpload, true);
    assert.equal(policy.photoHandling, "normalized_public_evidence_upload");
    assert.equal(policy.locationScope, "not_applicable");
  }
  assert.doesNotMatch(NATIVE_CAPABILITY_PURPOSES.join(" "), /barcode|upc|location|nearby/i);
});

test("camera and photo-library copy explains the bounded public-evidence action", () => {
  assert.equal(CAMERA_PERMISSION_MESSAGE,
    "Allow Bourbon Signal to use your camera for optional sighting evidence that may appear publicly with your Signal.");
  assert.equal(PHOTO_LIBRARY_PERMISSION_MESSAGE,
    "Allow Bourbon Signal to access only photos you choose as optional sighting evidence that may appear publicly with your Signal.");
  assert.equal(nativeCapabilityPolicyFor("capture_bottle_or_shelf_evidence").rationale.ios, CAMERA_PERMISSION_MESSAGE);
  assert.equal(nativeCapabilityPolicyFor("choose_bottle_or_shelf_evidence").rationale.ios, PHOTO_LIBRARY_PERMISSION_MESSAGE);
  assert.match(nativeCapabilityPolicyFor("capture_bottle_or_shelf_evidence").rationale.android, /resized.*metadata.*public/i);
  assert.match(nativeCapabilityPolicyFor("choose_bottle_or_shelf_evidence").rationale.android, /resized.*metadata.*public/i);
});

test("camera and photo-library denials preserve a complete manual post", () => {
  for (const purpose of NATIVE_CAPABILITY_PURPOSES) {
    const policy = nativeCapabilityPolicyFor(purpose);
    assert.equal(policy.manualFallback, "manual_post_without_photo");
    const denied = permissionDenialFallbackFor(purpose, "denied");
    assert.equal(denied.manualEntryAvailable, true);
    assert.equal(denied.actionLabel, "Continue without a photo");
    assert.match(denied.message, /keep posting manually without a photo/i);
  }
});

test("blocked and unavailable permissions return safe, non-blocking fallback copy", () => {
  const blocked = permissionDenialFallbackFor("capture_bottle_or_shelf_evidence", "blocked");
  assert.equal(blocked.manualEntryAvailable, true);
  assert.match(blocked.message, /Settings/);
  assert.doesNotMatch(blocked.message, /required|must|cannot continue/i);

  const unavailable = permissionDenialFallbackFor("choose_bottle_or_shelf_evidence", "unavailable");
  assert.equal(unavailable.manualEntryAvailable, true);
  assert.match(unavailable.message, /without a photo/i);
  assert.doesNotMatch(unavailable.message, /required|must|cannot continue/i);
});
