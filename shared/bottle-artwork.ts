export interface ReviewedBottleArtwork {
  url: string;
  sha256: string;
  reviewedAt: string;
  description: string;
}
export function validateReviewedBottleArtwork(value: unknown): ReviewedBottleArtwork | undefined {
  if (value == null) return undefined;
  const art = value as Partial<ReviewedBottleArtwork>;
  const url = new URL(String(art.url || ""));
  if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com") || url.username || url.password || !url.pathname.startsWith("/bottle-artwork/") || !/^[a-f0-9]{64}$/.test(art.sha256 || "") || !Number.isFinite(Date.parse(art.reviewedAt || "")) || !art.description?.trim()) throw new Error("Use reviewed, original bottle artwork from the artwork workflow.");
  return {url:url.href,sha256:art.sha256!,reviewedAt:art.reviewedAt!,description:art.description!.trim().slice(0,500)};
}
