import type { BourbonDnaTag } from "@/lib/bourbon-dna";

export interface BourbonKnowledgeProfile {
  family: string;
  mashBill: string;
  mashBillConfidence: "known" | "reported" | "family" | "undisclosed";
  tags: Partial<Record<BourbonDnaTag, number>>;
  noteKeywords: string[];
  sourceNotes: string[];
}

const FAMILY_PROFILES: Record<string, BourbonKnowledgeProfile> = {
  buffalo_trace_low_rye: {
    family: "Buffalo Trace Mash Bill #1",
    mashBill: "Low-rye bourbon recipe; exact percentages undisclosed publicly.",
    mashBillConfidence: "family",
    tags: { Caramel: 0.78, Vanilla: 0.7, Cherry: 0.62, Grape: 0.6, Sweet: 0.56, Balanced: 0.52 },
    noteKeywords: ["caramel", "vanilla", "cherry", "light oak", "brown sugar", "soft spice"],
    sourceNotes: ["Buffalo Trace Mash Bill #1 is broadly identified by whiskey reference sources as the low-rye bourbon family used for Buffalo Trace/Eagle Rare/E.H. Taylor/Stagg-style bourbons; exact percentages are not official."],
  },
  buffalo_trace_high_rye: {
    family: "Buffalo Trace Mash Bill #2",
    mashBill: "Higher-rye bourbon recipe; exact percentages undisclosed publicly, commonly reported around the low-to-mid teens rye.",
    mashBillConfidence: "family",
    tags: { Caramel: 0.68, Vanilla: 0.64, Spice: 0.74, Cherry: 0.58, Grape: 0.54, Balanced: 0.48 },
    noteKeywords: ["caramel", "vanilla", "rye spice", "citrus", "cherry", "baking spice"],
    sourceNotes: ["Whisky Advocate and other reference guides identify Blanton's-style Buffalo Trace bottles as Mash Bill #2, a spicier higher-rye family than Mash Bill #1."],
  },
  buffalo_trace_wheated: {
    family: "Buffalo Trace wheated bourbon mash bill",
    mashBill: "Wheated bourbon recipe; rye is replaced by wheat, exact percentages undisclosed publicly.",
    mashBillConfidence: "family",
    tags: { Sweet: 0.84, Vanilla: 0.76, Caramel: 0.74, Honey: 0.66, Dessert: 0.62, Oak: 0.5 },
    noteKeywords: ["soft wheat", "honey", "vanilla", "caramel", "cinnamon", "sweet oak"],
    sourceNotes: ["Buffalo Trace's wheated family covers Weller and Van Winkle style bourbons; public references agree wheat replaces rye, while exact percentages are not officially published."],
  },
  buffalo_trace_rye: {
    family: "Buffalo Trace straight rye family",
    mashBill: "Kentucky straight rye recipe; exact percentages undisclosed publicly.",
    mashBillConfidence: "family",
    tags: { Spice: 0.9, Cherry: 0.62, Caramel: 0.58, "Proof heat": 0.58, Balanced: 0.44 },
    noteKeywords: ["rye spice", "cinnamon", "clove", "cherry", "mint", "caramel"],
    sourceNotes: ["Sazerac/Handy-style ryes are a separate Buffalo Trace rye family; exact percentages are not officially published."],
  },
  heaven_hill_bourbon: {
    family: "Heaven Hill traditional bourbon",
    mashBill: "78% corn, 10% rye, 12% malted barley.",
    mashBillConfidence: "reported",
    tags: { Caramel: 0.72, Oak: 0.7, Nutty: 0.62, Vanilla: 0.58, Spice: 0.48, Balanced: 0.46 },
    noteKeywords: ["caramel", "peanut", "oak", "vanilla", "brown sugar", "cocoa"],
    sourceNotes: ["Heaven Hill bourbon references commonly report 78/10/12 for Elijah Craig, Henry McKenna, Evan Williams, and Heaven Hill bourbon lines."],
  },
  heaven_hill_wheated: {
    family: "Heaven Hill wheated bourbon",
    mashBill: "68% corn, 20% wheat, 12% malted barley.",
    mashBillConfidence: "reported",
    tags: { Sweet: 0.8, Honey: 0.68, Vanilla: 0.64, Caramel: 0.62, Dessert: 0.58, Oak: 0.42 },
    noteKeywords: ["honey", "caramel", "soft wheat", "vanilla", "butterscotch", "gentle oak"],
    sourceNotes: ["VinePair and Heaven Hill guides identify Old Fitzgerald/Larceny style wheated bourbon as 68/20/12 corn/wheat/malted barley."],
  },
  makers_mark_wheated: {
    family: "Maker's Mark wheated bourbon",
    mashBill: "70% corn, 16% red winter wheat, 14% malted barley.",
    mashBillConfidence: "known",
    tags: { Sweet: 0.78, Vanilla: 0.72, Caramel: 0.68, Honey: 0.62, Dessert: 0.56, Oak: 0.42 },
    noteKeywords: ["soft red winter wheat", "vanilla", "caramel", "baking spice", "honey", "sweet oak"],
    sourceNotes: ["Maker's Mark official materials identify soft red winter wheat as the flavoring grain; public distillery profiles list 70/16/14 corn/wheat/malted barley."],
  },
  four_roses_high_rye: {
    family: "Four Roses high-rye recipes",
    mashBill: "Two high-rye mash bills combined with five yeast strains; limited releases may mingle multiple OBS*/OES* recipes.",
    mashBillConfidence: "known",
    tags: { Spice: 0.82, Cherry: 0.68, Balanced: 0.62, Vanilla: 0.56, Oak: 0.5, Caramel: 0.48 },
    noteKeywords: ["rye spice", "red fruit", "floral", "baking spice", "vanilla", "delicate fruit"],
    sourceNotes: ["Four Roses official recipe materials describe two mash bills and five yeast strains making ten recipes; OBSV is a high-rye spicy/full-bodied recipe with delicate fruit from V yeast."],
  },
  wild_turkey_bourbon: {
    family: "Wild Turkey bourbon",
    mashBill: "75% corn, 13% rye, 12% malted barley.",
    mashBillConfidence: "reported",
    tags: { Oak: 0.78, Spice: 0.66, Caramel: 0.62, Vanilla: 0.58, Nutty: 0.5, "Proof heat": 0.46 },
    noteKeywords: ["oak", "rye spice", "vanilla", "caramel", "tobacco", "orange peel"],
    sourceNotes: ["Wild Turkey/Russell's public reviews and reference sources consistently report the 75/13/12 bourbon mash bill."],
  },
  jim_beam_bourbon: {
    family: "Jim Beam small batch bourbon",
    mashBill: "77% corn, 13% rye, 10% malted barley.",
    mashBillConfidence: "reported",
    tags: { Nutty: 0.82, "Proof heat": 0.7, Oak: 0.62, Caramel: 0.58, Vanilla: 0.5, Spice: 0.48 },
    noteKeywords: ["peanut", "nutty", "oak", "vanilla", "barrel proof heat", "brown spice"],
    sourceNotes: ["Booker's/Jim Beam small batch references commonly report a 77/13/10 bourbon mash bill and nutty Beam profile."],
  },
  woodford_bourbon: {
    family: "Woodford Reserve bourbon",
    mashBill: "72% corn, 18% rye, 10% malted barley.",
    mashBillConfidence: "reported",
    tags: { Vanilla: 0.72, Oak: 0.7, Sweet: 0.62, Spice: 0.58, Balanced: 0.56, Caramel: 0.52 },
    noteKeywords: ["vanilla", "toasted oak", "grain", "baking spice", "cocoa", "balanced"],
    sourceNotes: ["Woodford official materials emphasize a broad flavor wheel and Batch Proof using the same grain bill/process as Woodford Reserve; public references commonly list 72/18/10."],
  },
  michters_bourbon: {
    family: "Michter's bourbon / toasted bourbon family",
    mashBill: "Undisclosed bourbon recipe; toasted releases add second-barrel sweet oak influence.",
    mashBillConfidence: "undisclosed",
    tags: { Caramel: 0.66, Oak: 0.62, Sweet: 0.58, "Dark fruit": 0.5, Nutty: 0.44, Balanced: 0.44 },
    noteKeywords: ["caramel", "toasted oak", "brown sugar", "dried fruit", "nutty", "spice"],
    sourceNotes: ["Michter's does not publish a bourbon mash bill; official product materials identify toasted-barrel variants and limited 10/20 year bourbon families."],
  },
  willett_family: {
    family: "Willett Family Estate bourbon",
    mashBill: "Single-barrel sourced/proprietary family; mash bill varies by barrel and release.",
    mashBillConfidence: "undisclosed",
    tags: { Oak: 0.64, Spice: 0.58, "Dark fruit": 0.54, Caramel: 0.52, "Proof heat": 0.48, Balanced: 0.38 },
    noteKeywords: ["single barrel", "oak", "spice", "dark fruit", "caramel", "varies by barrel"],
    sourceNotes: ["Willett Family Estate single-barrel profiles vary; treat bottle-specific notes as higher priority than a fixed mash bill."],
  },
};

const SPECIFIC_FAMILY_RULES: Array<{ match: RegExp; family: keyof typeof FAMILY_PROFILES; notes?: string[]; tags?: Partial<Record<BourbonDnaTag, number>> }> = [
  { match: /william larue weller|weller|van winkle|pappy|old rip/i, family: "buffalo_trace_wheated" },
  { match: /blanton/i, family: "buffalo_trace_high_rye" },
  { match: /thomas h handy|sazerac 18|sazerac rye/i, family: "buffalo_trace_rye" },
  { match: /buffalo trace|eagle rare|stagg|e\.?h\.? taylor/i, family: "buffalo_trace_low_rye" },
  { match: /old fitzgerald/i, family: "heaven_hill_wheated" },
  { match: /elijah craig|henry mckenna/i, family: "heaven_hill_bourbon" },
  { match: /maker'?s mark/i, family: "makers_mark_wheated" },
  { match: /four roses/i, family: "four_roses_high_rye" },
  { match: /russell|wild turkey/i, family: "wild_turkey_bourbon" },
  { match: /booker/i, family: "jim_beam_bourbon" },
  { match: /woodford/i, family: "woodford_bourbon" },
  { match: /michter/i, family: "michters_bourbon" },
  { match: /willett/i, family: "willett_family" },
];

export function lookupBourbonKnowledge(input: { name: string; brand?: string; producer?: string; aliases?: string[]; category?: string }): BourbonKnowledgeProfile | null {
  const text = [input.name, input.brand, input.producer, input.category, ...(input.aliases || [])].filter(Boolean).join(" ");
  const rule = SPECIFIC_FAMILY_RULES.find((candidate) => candidate.match.test(text));
  if (!rule) return null;
  const base = FAMILY_PROFILES[rule.family];
  return {
    ...base,
    tags: { ...base.tags, ...(rule.tags || {}) },
    sourceNotes: [...base.sourceNotes, ...(rule.notes || [])],
  };
}

export function mergeNoteKeywords(existing: string[] | undefined, next: string[]) {
  return Array.from(new Set([...(existing || []), ...next].map((item) => item.trim()).filter(Boolean))).slice(0, 16);
}
