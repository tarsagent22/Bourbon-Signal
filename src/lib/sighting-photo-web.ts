// A fresh canvas encoding drops EXIF/GPS before anything reaches public storage.
export async function normalizeWebSightingPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This photo could not be opened. Choose a JPEG, PNG, or WebP image.'); });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 80_000_000) throw new Error('Choose a smaller photo.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable. You can post without a photo.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to process this photo.')), 'image/jpeg', 0.8));
    return new File([blob], 'sighting-photo.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}
