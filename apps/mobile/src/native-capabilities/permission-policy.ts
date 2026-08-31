export const CAMERA_PERMISSION_MESSAGE =
  "Allow Bourbon Signal to use your camera to photograph a bottle or shelf as evidence for a manual post.";

export const PHOTO_LIBRARY_PERMISSION_MESSAGE =
  "Allow Bourbon Signal to access photos you choose as bottle or shelf evidence for a manual post.";

export const LOCATION_PERMISSION_MESSAGE =
  "Allow Bourbon Signal to use your current location to suggest nearby retailers or start Trip Mode. You can always enter a destination manually.";

export const NATIVE_CAPABILITY_PURPOSES = [
  "capture_bottle_or_shelf_evidence",
  "choose_bottle_or_shelf_evidence",
  "suggest_nearby_retailers",
  "start_trip_mode_from_current_location",
] as const;

export type NativeCapabilityPurpose = (typeof NATIVE_CAPABILITY_PURPOSES)[number];
export type NativePermission = "camera" | "photo_library" | "foreground_location";
export type PermissionDenial = "denied" | "blocked" | "unavailable";
export type ManualCapabilityFallback = "manual_post_without_photo" | "manual_destination_entry";

export interface NativeCapabilityPolicy {
  readonly permission: NativePermission;
  readonly requestTiming: "after_explicit_user_action";
  readonly rationale: Readonly<{ ios: string; android: string }>;
  readonly manualFallback: ManualCapabilityFallback;
  readonly photoHandling: "device_only_no_upload" | "not_applicable";
  readonly locationScope: "foreground_only" | "not_applicable";
  readonly allowsPhotoUpload: false;
  readonly allowsBarcodeCatalogMatch: false;
}

export interface PermissionDenialFallback {
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly manualEntryAvailable: true;
}

const CAMERA_RATIONALE = {
  ios: CAMERA_PERMISSION_MESSAGE,
  android:
    "Use the camera only after you choose to photograph a bottle or shelf as evidence for a manual post. You can keep posting manually without a photo.",
} as const;

const PHOTO_LIBRARY_RATIONALE = {
  ios: PHOTO_LIBRARY_PERMISSION_MESSAGE,
  android:
    "Choose a bottle or shelf photo as evidence for a manual post. The photo stays on this device because native photo upload is not supported.",
} as const;

const LOCATION_RATIONALE = {
  ios: LOCATION_PERMISSION_MESSAGE,
  android:
    "Use your current location only after you ask for nearby retailer suggestions or Trip Mode. Bourbon Signal does not use background location, and you can always enter a destination manually.",
} as const;

const POLICIES = Object.freeze({
  capture_bottle_or_shelf_evidence: {
    permission: "camera",
    requestTiming: "after_explicit_user_action",
    rationale: CAMERA_RATIONALE,
    manualFallback: "manual_post_without_photo",
    photoHandling: "device_only_no_upload",
    locationScope: "not_applicable",
    allowsPhotoUpload: false,
    allowsBarcodeCatalogMatch: false,
  },
  choose_bottle_or_shelf_evidence: {
    permission: "photo_library",
    requestTiming: "after_explicit_user_action",
    rationale: PHOTO_LIBRARY_RATIONALE,
    manualFallback: "manual_post_without_photo",
    photoHandling: "device_only_no_upload",
    locationScope: "not_applicable",
    allowsPhotoUpload: false,
    allowsBarcodeCatalogMatch: false,
  },
  suggest_nearby_retailers: {
    permission: "foreground_location",
    requestTiming: "after_explicit_user_action",
    rationale: LOCATION_RATIONALE,
    manualFallback: "manual_destination_entry",
    photoHandling: "not_applicable",
    locationScope: "foreground_only",
    allowsPhotoUpload: false,
    allowsBarcodeCatalogMatch: false,
  },
  start_trip_mode_from_current_location: {
    permission: "foreground_location",
    requestTiming: "after_explicit_user_action",
    rationale: LOCATION_RATIONALE,
    manualFallback: "manual_destination_entry",
    photoHandling: "not_applicable",
    locationScope: "foreground_only",
    allowsPhotoUpload: false,
    allowsBarcodeCatalogMatch: false,
  },
} satisfies Record<NativeCapabilityPurpose, NativeCapabilityPolicy>);

const EVIDENCE_DENIAL_COPY = {
  denied: "Camera access is off. You can keep posting manually without a photo.",
  blocked: "Camera access is off in Settings. You can keep posting manually without a photo.",
  unavailable: "A camera is not available on this device. You can keep posting manually without a photo.",
} as const;

const PHOTO_LIBRARY_DENIAL_COPY = {
  denied: "Photo access is off. You can keep posting manually without a photo.",
  blocked: "Photo access is off in Settings. You can keep posting manually without a photo.",
  unavailable: "Photo selection is not available on this device. You can keep posting manually without a photo.",
} as const;

const NEARBY_RETAILER_DENIAL_COPY = {
  denied: "Location access is off. Enter a retailer or destination manually to continue.",
  blocked: "Location access is off in Settings. Enter a retailer or destination manually to continue.",
  unavailable: "Current location is not available. Enter a retailer or destination manually to continue.",
} as const;

const TRIP_MODE_DENIAL_COPY = {
  denied: "Location access is off. Enter your Trip Mode destination manually to continue.",
  blocked: "Location access is off in Settings. Enter your Trip Mode destination manually to continue.",
  unavailable: "Current location is not available. Enter your Trip Mode destination manually to continue.",
} as const;

export function nativeCapabilityPolicyFor(purpose: NativeCapabilityPurpose): NativeCapabilityPolicy {
  return POLICIES[purpose];
}

export function permissionDenialFallbackFor(
  purpose: NativeCapabilityPurpose,
  denial: PermissionDenial,
): PermissionDenialFallback {
  switch (purpose) {
    case "capture_bottle_or_shelf_evidence":
      return {
        title: "Camera access is off",
        message: EVIDENCE_DENIAL_COPY[denial],
        actionLabel: "Continue without a photo",
        manualEntryAvailable: true,
      };
    case "choose_bottle_or_shelf_evidence":
      return {
        title: "Photo access is off",
        message: PHOTO_LIBRARY_DENIAL_COPY[denial],
        actionLabel: "Continue without a photo",
        manualEntryAvailable: true,
      };
    case "suggest_nearby_retailers":
      return {
        title: "Location access is off",
        message: NEARBY_RETAILER_DENIAL_COPY[denial],
        actionLabel: "Enter retailer manually",
        manualEntryAvailable: true,
      };
    case "start_trip_mode_from_current_location":
      return {
        title: "Location access is off",
        message: TRIP_MODE_DENIAL_COPY[denial],
        actionLabel: "Enter destination manually",
        manualEntryAvailable: true,
      };
  }
}
