export interface BottleSubmissionResearch {
  canonicalName: string;
  brand: string;
  category: "bourbon" | "rye" | "american_whiskey";
  availability: string | null;
  confidence: "low" | "medium" | "high";
  summary: string;
  researchedAt: string;
  sources: Array<{title: string; url: string}>;
  artwork?: import("./bottle-artwork").ReviewedBottleArtwork;
}
export function validateBottleSubmissionResearch(input: unknown): BottleSubmissionResearch {
  const r = input as Partial<BottleSubmissionResearch>;
  if (!r || !r.canonicalName?.trim() || !r.brand?.trim() || !["bourbon","rye","american_whiskey"].includes(r.category || "") || !["low","medium","high"].includes(r.confidence || "") || !r.summary?.trim() || !Number.isFinite(Date.parse(r.researchedAt || ""))) throw new Error("Research must include exact identity, confidence, explanation and date.");
  if (r.availability != null && !["common","regional","seasonal","limited","allocated","highly_allocated","unicorn"].includes(r.availability)) throw new Error("Invalid recommended national rarity.");
  if (!Array.isArray(r.sources) || r.sources.length < 1 || r.sources.length > 8) throw new Error("Research needs one to eight source links.");
  const sources = r.sources.map(source => {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password || !source.title?.trim()) throw new Error("Use named HTTPS research sources.");
    return {title:source.title.trim().slice(0,180),url:url.href};
  });
  return { canonicalName:r.canonicalName.trim().slice(0,160),brand:r.brand.trim().slice(0,160),category:r.category!,availability:r.confidence === "low" ? null : r.availability || null,confidence:r.confidence!,summary:r.summary.trim().slice(0,1200),researchedAt:r.researchedAt!,sources };
}
