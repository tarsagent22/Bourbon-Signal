export interface ScanSize { width: number; height: number }

/** One geometry definition for both the portrait overlay and the OCR crop. */
export function scanGuide(view: ScanSize) {
  const height = view.height * 0.74;
  const width = Math.min(view.width * 0.64, height * 0.58);
  return { width, height, left: (view.width - width) / 2, top: Math.max(0, (view.height - height) / 2 - 12) };
}

export function scanCrop(picture: ScanSize, view: ScanSize) {
  const guide = scanGuide(view);
  // Camera preview fills its viewport, cropping the image equally on either side.
  const scale = Math.max(view.width / picture.width, view.height / picture.height);
  const originX = Math.max(0, Math.floor((guide.left + (picture.width * scale - view.width) / 2) / scale));
  const originY = Math.max(0, Math.floor((guide.top + (picture.height * scale - view.height) / 2) / scale));
  return { originX, originY, width: Math.min(picture.width - originX, Math.floor(guide.width / scale)), height: Math.min(picture.height - originY, Math.floor(guide.height / scale)) };
}
