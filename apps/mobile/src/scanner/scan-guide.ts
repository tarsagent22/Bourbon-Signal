export interface ScanSize { width: number; height: number }

/** Bottle framing guide. Native OCR reads the wider visible preview area. */
export function scanGuide(view: ScanSize) {
  const height = view.height * 0.74;
  const width = Math.min(view.width * 0.64, height * 0.58);
  return { width, height, left: (view.width - width) / 2, top: Math.max(0, (view.height - height) / 2 - 12) };
}
