import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  MAX_NATIVE_SIGHTING_PHOTO_BYTES,
  nextPhotoNormalizationPass,
  type SightingPhotoAsset,
} from "./sighting-photo";

export type SightingPhotoSource = "camera" | "library";

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
