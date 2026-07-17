export const MAX_SIGHTING_PHOTO_BYTES = 10 * 1024 * 1024;
export const SIGHTING_PHOTO_MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_SIGHTING_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function validSightingPhotoId(value: unknown) {
  const sightingId = String(value || "").slice(0, 160);
  return /^sighting_[-_a-zA-Z0-9]{1,150}$/.test(sightingId) ? sightingId : null;
}

export function sightingPhotoPathPrefix(sightingId: string) {
  return `sighting-proofs/${sightingId}/`;
}

export function buildSightingPhotoPath(sightingId: string, fileName: string, contentType: string, timestamp = Date.now()) {
  const validatedId = validSightingPhotoId(sightingId);
  if (!validatedId) throw new Error("Invalid sighting photo ID");
  const fileExtension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const extension = EXTENSION_BY_TYPE[contentType.toLowerCase()] || fileExtension || "jpg";
  return `${sightingPhotoPathPrefix(validatedId)}${timestamp}.${extension}`;
}

export function validateSightingPhotoPath(sightingId: string, pathname: string) {
  const validatedId = validSightingPhotoId(sightingId);
  if (!validatedId || !pathname.startsWith(sightingPhotoPathPrefix(validatedId))) return false;
  return /^sighting-proofs\/sighting_[-_a-zA-Z0-9]+\/\d+\.[a-z0-9]{2,8}$/i.test(pathname);
}

export function parseSightingPhotoClientPayload(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { sightingId?: unknown };
    const sightingId = validSightingPhotoId(parsed.sightingId);
    return sightingId ? { sightingId } : null;
  } catch {
    return null;
  }
}

type CompletedSightingPhotoInput = {
  sightingId?: unknown;
  blob?: { url?: unknown; pathname?: unknown };
} | null;

type UploadedBlobMetadata = {
  url: string;
  pathname: string;
  size: number;
  contentType?: string;
};

export function validateCompletedSightingPhoto(input: CompletedSightingPhotoInput, uploaded: UploadedBlobMetadata) {
  const sightingId = validSightingPhotoId(input?.sightingId);
  const requestedUrl = typeof input?.blob?.url === "string" ? input.blob.url : "";
  const requestedPathname = typeof input?.blob?.pathname === "string" ? input.blob.pathname : "";
  if (!sightingId || !requestedUrl || !validateSightingPhotoPath(sightingId, requestedPathname)) return null;
  if (uploaded.url !== requestedUrl || uploaded.pathname !== requestedPathname) return null;
  if (!Number.isFinite(uploaded.size) || uploaded.size <= 0 || uploaded.size > MAX_SIGHTING_PHOTO_BYTES) return null;
  if (!ALLOWED_SIGHTING_PHOTO_TYPES.includes((uploaded.contentType || "") as typeof ALLOWED_SIGHTING_PHOTO_TYPES[number])) return null;
  return { sightingId, url: uploaded.url, pathname: uploaded.pathname };
}
