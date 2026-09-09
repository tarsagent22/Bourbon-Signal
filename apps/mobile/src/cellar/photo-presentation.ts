// Presentation only, never real-world bottle dimensions or identity resolution.
export function photoPresentationScale(sha256?: string): number {
  // Reviewed source-pixel proportions: 1792 Small Batch, Woodford Double Oaked,
  // Woodford Reserve. A replacement photo never inherits another asset's fit.
  switch (sha256) {
    case 'f0ea7ac8d8abde55fee08ba57de7daf5768b6978f8d13675db9e8130e437e09b': return .84;
    case 'ad8017ffb3efb40f3ac06ac015260fd9ae1219125a4b69d65c64a90f634257b8': return .90;
    case 'e08b9f5e00e953eba6b2bb39eb16a82f5f94cc75d3dc8aca5165ae971fd65139': return .94;
    default: return 1;
  }
}
export function groundedPhotoFrame(width: number, height: number, scale: number) {
  // Approved 400x600 packshots share alpha baseline 584; keep that point fixed.
  return { position: 'absolute' as const, width: width*scale, height: height*scale, left: width*(1-scale)/2, bottom: height*(16/600)*(1-scale) };
}
