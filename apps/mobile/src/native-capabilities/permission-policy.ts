export const CAMERA_PERMISSION_MESSAGE =
  "Allow Bourbon Signal to scan bottle labels and barcodes on your device, or take optional sighting photos you choose to post.";

export const PHOTO_LIBRARY_PERMISSION_MESSAGE =
  "Allow Bourbon Signal to access only photos you choose as optional sighting evidence that may appear publicly with your Signal.";

export const NATIVE_CAPABILITY_PURPOSES = [
  "capture_bottle_or_shelf_evidence",
  "choose_bottle_or_shelf_evidence",
  "scan_bottle_label",
] as const;

export type NativeCapabilityPurpose = (typeof NATIVE_CAPABILITY_PURPOSES)[number];
export type NativePermission = "camera" | "photo_library";
export type PermissionDenial = "denied" | "blocked" | "unavailable";
export type ManualCapabilityFallback = "manual_post_without_photo" | "manual_bottle_search";

export interface NativeCapabilityPolicy {
  readonly permission: NativePermission;
  readonly requestTiming: "after_explicit_user_action";
  readonly rationale: Readonly<{ ios: string; android: string }>;
  readonly manualFallback: ManualCapabilityFallback;
  readonly photoHandling: "normalized_public_evidence_upload" | "temporary_on_device_frames";
  readonly locationScope: "not_applicable";
  readonly allowsPhotoUpload: boolean;
  readonly allowsBarcodeCatalogMatch: boolean;
}

export interface PermissionDenialFallback {
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly manualEntryAvailable: true;
}

const CAMERA_RATIONALE = {
  ios: CAMERA_PERMISSION_MESSAGE,
  android: "Use the camera only after you choose optional evidence. Attached photos are resized, re-encoded without embedded metadata, and may appear publicly with the Signal.",
} as const;

const PHOTO_LIBRARY_RATIONALE = {
  ios: PHOTO_LIBRARY_PERMISSION_MESSAGE,
  android: "Choose only a photo you want to attach as optional evidence. Attached photos are resized, re-encoded without embedded metadata, and may appear publicly with the Signal.",
} as const;

const POLICIES = Object.freeze({
  scan_bottle_label: {
    permission: "camera", requestTiming: "after_explicit_user_action",
    rationale: { ios: CAMERA_PERMISSION_MESSAGE, android: "Read a bottle label or barcode on your device. Scan frames are temporary and are not uploaded or posted." },
    manualFallback: "manual_bottle_search", photoHandling: "temporary_on_device_frames",
    locationScope: "not_applicable", allowsPhotoUpload: false, allowsBarcodeCatalogMatch: true,
  },
  capture_bottle_or_shelf_evidence: {
    permission: "camera",
    requestTiming: "after_explicit_user_action",
    rationale: CAMERA_RATIONALE,
    manualFallback: "manual_post_without_photo",
    photoHandling: "normalized_public_evidence_upload",
    locationScope: "not_applicable",
    allowsPhotoUpload: true,
    allowsBarcodeCatalogMatch: false,
  },
  choose_bottle_or_shelf_evidence: {
    permission: "photo_library",
    requestTiming: "after_explicit_user_action",
    rationale: PHOTO_LIBRARY_RATIONALE,
    manualFallback: "manual_post_without_photo",
    photoHandling: "normalized_public_evidence_upload",
    locationScope: "not_applicable",
    allowsPhotoUpload: true,
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

export function nativeCapabilityPolicyFor(purpose: NativeCapabilityPurpose): NativeCapabilityPolicy {
  return POLICIES[purpose];
}

export function permissionDenialFallbackFor(purpose: NativeCapabilityPurpose, denial: PermissionDenial): PermissionDenialFallback {
  if (purpose === "scan_bottle_label") return { title: "Search by name", message: "Camera access is off. You can still find a bottle by name.", actionLabel: "Search by name", manualEntryAvailable: true };
  if (purpose === "capture_bottle_or_shelf_evidence") {
    return { title: "Camera access is off", message: EVIDENCE_DENIAL_COPY[denial], actionLabel: "Continue without a photo", manualEntryAvailable: true };
  }
  return { title: "Photo access is off", message: PHOTO_LIBRARY_DENIAL_COPY[denial], actionLabel: "Continue without a photo", manualEntryAvailable: true };
}
