import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { File, Directory, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { createPhotoJournal } from './photo-journal';
import {
  MAX_NATIVE_SIGHTING_PHOTO_BYTES,
  nextPhotoNormalizationPass,
  type SightingPhotoAsset,
} from "./sighting-photo";

export type SightingPhotoSource = "camera" | "library";

function photoDirectory(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(owner)) throw new Error('Sign in before attaching a photo.');
  const directory = new Directory(Paths.document, 'sighting-photo-retry', owner);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}
export function nativePhotoJournal(owner: string) {
  const directory = photoDirectory(owner);
  return createPhotoJournal({ owner, storage: SecureStore, ownedRoot: `${directory.uri.replace(/\/$/, '')}/`,
    removeFile: uri => { try { const file = new File(uri); if (file.exists) file.delete(); } catch {} } });
}
export function retainSightingPhoto(owner: string, photo: SightingPhotoAsset): SightingPhotoAsset {
  const directory = photoDirectory(owner);
  // One pending attachment per account; caller checks the journal before retention.
  const target = new File(directory, 'pending.jpg');
  const source = new File(photo.uri);
  if (source.uri !== target.uri) { if (target.exists) target.delete(); source.copy(target); }
  return { ...photo, uri: target.uri, fileName: 'pending.jpg', byteSize: target.size };
}

export async function chooseSightingPhoto(source: SightingPhotoSource): Promise<{ photo?: SightingPhotoAsset; error?: string }> {
  const permission = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { error: source === "camera" ? "Camera access was not granted. You can still post without a photo." : "Photo access was not granted. You can still post without a photo." };
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1, exif: false })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1, exif: false, allowsMultipleSelection: false });
  if (result.canceled || !result.assets[0]) return {};
  return { photo: await normalizeSightingPhoto(result.assets[0]) };
}

export async function normalizeSightingPhoto(asset: Pick<ImagePicker.ImagePickerAsset, "uri" | "width" | "height" | "fileSize">): Promise<SightingPhotoAsset> {
  let current = { uri: asset.uri, width: asset.width, height: asset.height };
  let byteSize = asset.fileSize || 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pass = nextPhotoNormalizationPass({ width: current.width, byteSize, attempt });
    if (!pass) break;
    current = await manipulateAsync(
      current.uri,
      current.width > pass.width ? [{ resize: { width: pass.width } }] : [],
      { compress: pass.quality, format: SaveFormat.JPEG, base64: false },
    );
    const blob = await fetch(current.uri).then((response) => response.blob());
    byteSize = blob.size;
    if (byteSize <= MAX_NATIVE_SIGHTING_PHOTO_BYTES) break;
  }
  if (!byteSize || byteSize > MAX_NATIVE_SIGHTING_PHOTO_BYTES) {
    throw new Error("That photo is still too large after processing. Choose a different photo or post without it.");
  }
  return {
    uri: current.uri,
    width: current.width,
    height: current.height,
    fileName: `sighting-proof-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    byteSize,
  };
}

export function sightingPhotoBlob(photo: SightingPhotoAsset): Blob {
  return new File(photo.uri);
}

export function discardSightingPhoto(photo: SightingPhotoAsset | null | undefined) {
  if (!photo) return;
  try {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never block posting or photo replacement.
  }
}
