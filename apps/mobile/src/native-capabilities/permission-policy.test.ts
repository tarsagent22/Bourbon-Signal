import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_PERMISSION_MESSAGE,
  LOCATION_PERMISSION_MESSAGE,
  NATIVE_CAPABILITY_PURPOSES,
  PHOTO_LIBRARY_PERMISSION_MESSAGE,
  nativeCapabilityPolicyFor,
  permissionDenialFallbackFor,
} from "./permission-policy";

test("native capability purposes are explicit, lazy, and limited to real product uses", () => {
  assert.deepEqual(NATIVE_CAPABILITY_PURPOSES, [
    "capture_bottle_or_shelf_evidence",
    "choose_bottle_or_shelf_evidence",
    "suggest_nearby_retailers",
    "start_trip_mode_from_current_location",
  ]);

  for (const purpose of NATIVE_CAPABILITY_PURPOSES) {
    const policy = nativeCapabilityPolicyFor(purpose);
    assert.equal(policy.requestTiming, "after_explicit_user_action");
    assert.equal(policy.allowsBarcodeCatalogMatch, false);
    assert.equal(policy.allowsPhotoUpload, false);
  }

  assert.doesNotMatch(NATIVE_CAPABILITY_PURPOSES.join(" "), /barcode|upc/i);
});

test("iOS purpose strings and Android rationale copy describe the bounded action", () => {
  assert.equal(CAMERA_PERMISSION_MESSAGE,
    "Allow Bourbon Signal to use your camera to photograph a bottle or shelf as evidence for a manual post.");
  assert.equal(PHOTO_LIBRARY_PERMISSION_MESSAGE,
    "Allow Bourbon Signal to access photos you choose as bottle or shelf evidence for a manual post.");
  assert.equal(LOCATION_PERMISSION_MESSAGE,
    "Allow Bourbon Signal to use your current location to suggest nearby retailers or start Trip Mode. You can always enter a destination manually.");

  assert.equal(nativeCapabilityPolicyFor("capture_bottle_or_shelf_evidence").rationale.ios, CAMERA_PERMISSION_MESSAGE);
  assert.equal(nativeCapabilityPolicyFor("choose_bottle_or_shelf_evidence").rationale.ios, PHOTO_LIBRARY_PERMISSION_MESSAGE);
  assert.equal(nativeCapabilityPolicyFor("suggest_nearby_retailers").rationale.ios, LOCATION_PERMISSION_MESSAGE);
  assert.equal(nativeCapabilityPolicyFor("start_trip_mode_from_current_location").rationale.ios, LOCATION_PERMISSION_MESSAGE);

  assert.equal(nativeCapabilityPolicyFor("capture_bottle_or_shelf_evidence").rationale.android,
    "Use the camera only after you choose to photograph a bottle or shelf as evidence for a manual post. You can keep posting manually without a photo.");
  assert.equal(nativeCapabilityPolicyFor("choose_bottle_or_shelf_evidence").rationale.android,
    "Choose a bottle or shelf photo as evidence for a manual post. The photo stays on this device because native photo upload is not supported.");
  assert.equal(nativeCapabilityPolicyFor("suggest_nearby_retailers").rationale.android,
    "Use your current location only after you ask for nearby retailer suggestions or Trip Mode. Bourbon Signal does not use background location, and you can always enter a destination manually.");
});

test("camera and photo-library denials preserve a complete manual post", () => {
  for (const purpose of [
    "capture_bottle_or_shelf_evidence",
    "choose_bottle_or_shelf_evidence",
  ] as const) {
    const policy = nativeCapabilityPolicyFor(purpose);
    assert.equal(policy.manualFallback, "manual_post_without_photo");
    assert.equal(policy.photoHandling, "device_only_no_upload");
    assert.equal(policy.locationScope, "not_applicable");

    const denied = permissionDenialFallbackFor(purpose, "denied");
    assert.equal(denied.manualEntryAvailable, true);
    assert.equal(denied.actionLabel, "Continue without a photo");
    assert.match(denied.message, /keep posting manually without a photo/i);
  }
});

test("location uses foreground access only and manual destinations remain available", () => {
  for (const purpose of [
    "suggest_nearby_retailers",
    "start_trip_mode_from_current_location",
  ] as const) {
    const policy = nativeCapabilityPolicyFor(purpose);
    assert.equal(policy.permission, "foreground_location");
    assert.equal(policy.locationScope, "foreground_only");
    assert.equal(policy.manualFallback, "manual_destination_entry");
    assert.equal(policy.photoHandling, "not_applicable");
    assert.match(policy.rationale.ios, /current location/i);
    assert.match(policy.rationale.android, /current location/i);

    const denied = permissionDenialFallbackFor(purpose, "denied");
    assert.equal(denied.manualEntryAvailable, true);
    assert.match(denied.actionLabel, /enter .* manually/i);
    assert.match(denied.message, /manually/i);
  }
});

test("blocked and unavailable permissions return safe, non-blocking fallback copy", () => {
  const blocked = permissionDenialFallbackFor("capture_bottle_or_shelf_evidence", "blocked");
  assert.equal(blocked.manualEntryAvailable, true);
  assert.match(blocked.message, /Settings/);
  assert.doesNotMatch(blocked.message, /required|must|cannot continue/i);

  const unavailable = permissionDenialFallbackFor("start_trip_mode_from_current_location", "unavailable");
  assert.equal(unavailable.manualEntryAvailable, true);
  assert.match(unavailable.message, /destination manually/i);
  assert.doesNotMatch(unavailable.message, /required|must|cannot continue/i);
});
