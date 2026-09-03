export const MAX_NATIVE_SIGHTING_PHOTO_BYTES = 3 * 1024 * 1024;
export const JPEG_NORMALIZATION_QUALITY = 0.72;

export interface SightingPhotoAsset {
  uri: string;
  width: number;
  height: number;
  fileName: string;
  mimeType: "image/jpeg";
  byteSize?: number;
}

export interface PendingPhotoAttachment {
  sightingId: string;
  photo: SightingPhotoAsset;
  blob?: { url?: string; pathname: string };
}

export function nextPhotoNormalizationPass({ width, byteSize, attempt }: { width: number; byteSize: number; attempt: number }) {
  if (attempt === 0) return { width: Math.min(width, 1600), quality: JPEG_NORMALIZATION_QUALITY };
  if (attempt === 1 && byteSize > MAX_NATIVE_SIGHTING_PHOTO_BYTES) return { width: Math.min(width, 1200), quality: 0.55 };
  return null;
}

export function createPendingPhotoAttachment(sightingId: string, photo: SightingPhotoAsset): PendingPhotoAttachment {
  return { sightingId, photo };
}

export function stagePendingPhotoUpload(attachment: PendingPhotoAttachment, timestamp = Date.now()): PendingPhotoAttachment {
  return {
    ...attachment,
    blob: { pathname: `sighting-proofs/${attachment.sightingId}/${timestamp}.jpg` },
  };
}

export function photoSubmitMode(pending: PendingPhotoAttachment | null) {
  return pending ? "upload-only" as const : "submit-sighting" as const;
}
