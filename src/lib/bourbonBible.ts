import inventoryBottles from "@/data/bourbonBibleInventory.json";
import { readSiteExport } from "@/lib/site-engine-contract";

export type AvailabilityTier = "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";
export type BuyerVerdict = "safe_to_pass" | "fair_buy" | "good_buy" | "grab_at_msrp" | "special_find" | "unknown";

export interface BibleBottle {
  id: string;
  canonicalName: string;
  brand: string;
  producer?: string;
  category: "bourbon" | "rye" | "american_whiskey";
  proof?: number;
  ageStatement?: string | null;
  msrp?: number | null;
  availability: AvailabilityTier;
  buyerVerdict: BuyerVerdict;
  aliases: string[];
  isSignalTracked?: boolean;
  isAlertEligible?: boolean;
  summary: string;
  guidance: string;
}

export interface BibleSearchResult extends BibleBottle {
  matchScore: number;
  matchReason: "exact" | "alias" | "fuzzy" | "engine";
}

const SEED_BOTTLES: BibleBottle[] = [
  commonBottle("buffalo-trace-bourbon", "Buffalo Trace Bourbon", "Buffalo Trace", ["buffalo trace", "bt", "buffalo trace kentucky straight bourbon"], "Popular and sometimes unevenly distributed, but not truly rare nationally.", "Good buy around MSRP if you like the profile. Do not chase secondary pricing."),
  commonBottle("makers-mark", "Maker's Mark", "Maker's Mark", ["makers", "maker's", "makers mark bourbon", "maker mark"], "A widely available wheated bourbon and a dependable shelf bottle.", "Safe to pass unless you specifically need it."),
  commonBottle("makers-mark-46", "Maker's Mark 46", "Maker's Mark", ["makers 46", "maker's 46"], "A common Maker's Mark expression with extra oak influence.", "Worth considering if priced normally and you want a richer wheated profile."),
  commonBottle("makers-mark-cask-strength", "Maker's Mark Cask Strength", "Maker's Mark", ["makers cask", "maker's cask strength"], "A higher-proof Maker's Mark that is usually findable, though not always everywhere.", "Good buy if you enjoy proof and the price is near MSRP."),
  commonBottle("woodford-reserve", "Woodford Reserve Bourbon", "Woodford Reserve", ["woodford", "woodford reserve kentucky straight bourbon"], "A common premium shelf bourbon.", "Safe to pass unless you need a reliable everyday bottle."),
  commonBottle("woodford-double-oaked", "Woodford Reserve Double Oaked", "Woodford Reserve", ["woodford double oaked", "double oaked", "woodford do"], "A popular but generally obtainable dessert-leaning bourbon.", "Good buy near MSRP if you like sweet oak; not something to overpay for."),
  commonBottle("knob-creek-9", "Knob Creek 9 Year", "Knob Creek", ["knob creek", "kc9", "knob creek bourbon"], "A widely available 9-year bourbon with strong value.", "Good buy if priced fairly; safe to pass if you already have it."),
  commonBottle("knob-creek-12", "Knob Creek 12 Year", "Knob Creek", ["kc12", "knob creek twelve"], "A sought-after age-stated Knob Creek that may be less common than the 9 year.", "Worth considering near MSRP, especially if your local shelves rarely carry it.", "regional"),
  commonBottle("wild-turkey-101", "Wild Turkey 101 Bourbon", "Wild Turkey", ["wt101", "wild turkey", "wild turkey 101"], "A classic, widely available high-value bourbon.", "Safe to pass unless you want a staple."),
  commonBottle("wild-turkey-rare-breed", "Wild Turkey Rare Breed", "Wild Turkey", ["rare breed", "wt rare breed", "wild turkey barrel proof"], "A popular barrel-proof bourbon that is usually findable but highly respected.", "Good buy near MSRP; not rare enough to panic-buy in most markets.", "regional"),
  commonBottle("four-roses-single-barrel", "Four Roses Single Barrel", "Four Roses", ["four roses sib", "4 roses single barrel", "fr single barrel"], "A commonly respected single barrel bourbon.", "Good buy if you like higher-rye profiles."),
  commonBottle("four-roses-small-batch-select", "Four Roses Small Batch Select", "Four Roses", ["small batch select", "four roses sbs", "4 roses small batch select"], "A higher-proof Four Roses blend that can vary by market.", "Worth considering near MSRP if it is not always on your local shelf.", "regional"),
  commonBottle("old-forester-100", "Old Forester 100 Proof", "Old Forester", ["of100", "old forester 100", "old forester signature"], "A common high-value Brown-Forman shelf bourbon.", "Safe to pass unless you need a dependable daily pour."),
  commonBottle("old-forester-1920", "Old Forester 1920 Prohibition Style", "Old Forester", ["of1920", "1920", "old forester prohibition"], "A popular higher-proof shelf bourbon.", "Good buy near MSRP; usually not rare enough to chase."),
  commonBottle("old-forester-1910", "Old Forester 1910 Old Fine Whisky", "Old Forester", ["of1910", "1910", "old forester 1910"], "A sweeter, double-barreled Old Forester expression.", "Good buy if priced normally and you like dessert-style bourbon."),
  commonBottle("elijah-craig-small-batch", "Elijah Craig Small Batch", "Elijah Craig", ["ec small batch", "elijah craig"], "A widely available Heaven Hill small batch bourbon.", "Safe to pass unless you need a reliable shelf bottle."),
  signalBottle("elijah-craig-barrel-proof", "Elijah Craig Barrel Proof", "Elijah Craig", ["ecbp", "elijah craig bp", "elijah craig barrel proof"], "limited", "A batch-released barrel-proof bourbon with strong hunter interest.", "Grab near MSRP if the batch is one you want; it may come and go quickly."),
  commonBottle("evan-williams-bottled-in-bond", "Evan Williams Bottled-in-Bond", "Evan Williams", ["ew bib", "evan williams white label"], "A widely available value bottle.", "Safe to pass unless you need a budget staple."),
  commonBottle("russells-reserve-10", "Russell's Reserve 10 Year", "Russell's Reserve", ["russells 10", "russell reserve 10"], "A generally available age-stated Wild Turkey bourbon.", "Fair buy near MSRP; usually not rare."),
  commonBottle("russells-reserve-single-barrel", "Russell's Reserve Single Barrel", "Russell's Reserve", ["russells single barrel", "rr sib", "russell's reserve sib"], "A respected single barrel that can be regional or store-pick dependent.", "Good buy if the price and barrel details appeal to you.", "regional"),
  commonBottle("1792-small-batch", "1792 Small Batch", "1792", ["1792", "barton 1792"], "A common-to-regional Barton bourbon depending on market.", "Fair buy at normal shelf price; not usually worth overpaying."),
  signalBottle("1792-full-proof", "1792 Full Proof", "1792", ["1792 fp", "full proof 1792"], "limited", "A higher-proof 1792 expression with stronger hunter interest.", "Worth grabbing near MSRP if your area does not see it often."),
  signalBottle("1792-bottled-in-bond", "1792 Bottled in Bond", "1792", ["1792 bib", "1792 bottled-in-bond"], "limited", "A less-common 1792 expression.", "Worth considering near MSRP; check local signal before chasing."),
  commonBottle("new-riff-single-barrel", "New Riff Single Barrel Bourbon", "New Riff", ["new riff sib", "new riff single barrel"], "A quality single barrel that is common in some regions and scarce in others.", "Good buy if you like high-rye profiles and the price is fair.", "regional"),
  commonBottle("redwood-empire-pipe-dream", "Redwood Empire Pipe Dream", "Redwood Empire", ["pipe dream", "redwood pipe dream"], "A generally findable bourbon in many markets.", "Fair buy if priced normally; not a panic buy."),
  commonBottle("smoke-wagon-small-batch", "Smoke Wagon Small Batch", "Smoke Wagon", ["smoke wagon", "smoke wagon bourbon"], "A sourced bourbon that varies by market availability.", "Worth considering if local shelves do not regularly carry it.", "regional"),
  commonBottle("michter-us1-bourbon", "Michter's US*1 Bourbon", "Michter's", ["michters bourbon", "michter's bourbon", "michters us1"], "A popular premium shelf bourbon that can be unevenly distributed.", "Fair buy near MSRP; check local signal if it feels scarce."),
  signalBottle("michters-10-year-bourbon", "Michter's 10 Year Bourbon", "Michter's", ["m10 bourbon", "michters 10", "michter's 10 bourbon"], "highly_allocated", "A highly sought-after age-stated Michter's release.", "Special find near MSRP."),
  commonBottle("angels-envy-bourbon", "Angel's Envy Bourbon", "Angel's Envy", ["angels envy", "angel envy bourbon"], "A widely distributed finished bourbon.", "Safe to pass unless you want that port-finished profile."),
  commonBottle("larceny-small-batch", "Larceny Small Batch", "Larceny", ["larceny", "larceny bourbon"], "A common wheated bourbon from Heaven Hill.", "Safe to pass unless you need a wheated shelf bottle."),
  signalBottle("larceny-barrel-proof", "Larceny Barrel Proof", "Larceny", ["larceny bp", "lbp", "larceny barrel proof"], "limited", "A batch-released barrel-proof wheated bourbon with hunter interest.", "Grab near MSRP if the batch interests you."),
  signalBottle("blantons-single-barrel", "Blanton's Single Barrel", "Blanton's", ["blantons", "blanton", "blanton's", "blantons single barrel"], "allocated", "A famous allocated single barrel bourbon that often disappears quickly.", "Grab near MSRP if you want it; avoid inflated pricing."),
  signalBottle("eagle-rare-10", "Eagle Rare 10 Year", "Eagle Rare", ["eagle rare", "er10", "eagle rare 10"], "allocated", "An allocated 10-year Buffalo Trace bourbon in many markets.", "Good grab near MSRP, especially where local sightings are low."),
  signalBottle("eh-taylor-small-batch", "E.H. Taylor Small Batch", "E.H. Taylor", ["eh taylor", "eht small batch", "colonel taylor", "e.h. taylor small batch"], "allocated", "A sought-after bottled-in-bond Buffalo Trace bourbon.", "Grab near MSRP if you find it."),
  signalBottle("eh-taylor-single-barrel", "E.H. Taylor Single Barrel", "E.H. Taylor", ["eht single barrel", "e.h. taylor single barrel", "colonel taylor single barrel"], "highly_allocated", "A harder-to-find E.H. Taylor expression.", "Special find near MSRP."),
  signalBottle("weller-special-reserve", "W.L. Weller Special Reserve", "Weller", ["weller green", "weller sr", "special reserve", "weller special reserve"], "allocated", "A wheated Buffalo Trace bourbon that is common in some states and scarce in others.", "Good buy near MSRP if local shelves rarely show it."),
  signalBottle("weller-antique-107", "W.L. Weller Antique 107", "Weller", ["weller red", "weller 107", "oWA", "old weller antique", "weller antique"], "highly_allocated", "A sought-after higher-proof wheated bourbon.", "Grab near MSRP."),
  signalBottle("weller-12-year", "W.L. Weller 12 Year", "Weller", ["weller 12", "w12", "weller twelve"], "highly_allocated", "A highly sought-after 12-year wheated bourbon.", "Special find near MSRP."),
  signalBottle("weller-full-proof", "W.L. Weller Full Proof", "Weller", ["weller fp", "weller full proof"], "highly_allocated", "A highly allocated full-proof Weller expression.", "Special find near MSRP."),
  signalBottle("stagg", "Stagg", "Stagg", ["stag jr", "stagg jr", "stagg junior", "george t stagg jr"], "highly_allocated", "A barrel-proof Buffalo Trace release with heavy hunter demand.", "Special find near MSRP."),
  signalBottle("george-t-stagg", "George T. Stagg", "Buffalo Trace Antique Collection", ["gts", "george stagg", "george t stagg"], "unicorn", "A Buffalo Trace Antique Collection unicorn bottle.", "Extremely rare at retail."),
  signalBottle("william-larue-weller", "William Larue Weller", "Buffalo Trace Antique Collection", ["wlw", "william larue", "william larue weller"], "unicorn", "A Buffalo Trace Antique Collection wheated unicorn bottle.", "Extremely rare at retail."),
  signalBottle("thomas-h-handy", "Thomas H. Handy Sazerac Rye", "Buffalo Trace Antique Collection", ["thh", "thomas handy", "handy rye"], "unicorn", "A Buffalo Trace Antique Collection barrel-proof rye.", "Extremely rare at retail."),
  signalBottle("sazerac-18", "Sazerac 18 Year Rye", "Buffalo Trace Antique Collection", ["saz 18", "sazerac 18"], "unicorn", "A Buffalo Trace Antique Collection rye.", "Extremely rare at retail."),
  signalBottle("pappy-van-winkle-15", "Pappy Van Winkle 15 Year", "Old Rip Van Winkle", ["pappy 15", "pappy", "van winkle 15"], "unicorn", "One of the most famous unicorn bourbons.", "Extremely rare at retail."),
  signalBottle("old-rip-van-winkle-10", "Old Rip Van Winkle 10 Year", "Old Rip Van Winkle", ["old rip", "orvw", "van winkle 10"], "unicorn", "A highly allocated Van Winkle wheated bourbon.", "Extremely rare at retail."),
  signalBottle("bookers", "Booker's Bourbon", "Booker's", ["bookers", "booker's", "booker bourbon"], "limited", "A batch-released barrel-proof bourbon.", "Good buy near MSRP if the batch profile appeals to you."),
  signalBottle("little-book", "Little Book", "Little Book", ["little book whiskey", "little book"], "limited", "A limited annual blended whiskey release.", "Worth considering near MSRP if the chapter interests you."),
  signalBottle("four-roses-limited-edition-small-batch", "Four Roses Limited Edition Small Batch", "Four Roses", ["four roses le", "4 roses limited", "four roses limited edition"], "highly_allocated", "A highly sought-after annual Four Roses release.", "Special find near MSRP."),
  signalBottle("old-forester-birthday-bourbon", "Old Forester Birthday Bourbon", "Old Forester", ["birthday bourbon", "ofbb", "old forester birthday"], "unicorn", "A famous annual limited Old Forester release.", "Extremely rare at retail."),
  signalBottle("parker-heritage", "Parker's Heritage Collection", "Heaven Hill", ["parkers", "parker heritage", "parker's heritage"], "highly_allocated", "A limited annual Heaven Hill release.", "Special find near MSRP."),
  signalBottle("heaven-hill-grain-to-glass", "Heaven Hill Grain to Glass", "Heaven Hill", ["grain to glass", "heaven hill g2g"], "limited", "A limited Heaven Hill release.", "Worth considering near MSRP."),
  signalBottle("heaven-hill-bottled-in-bond", "Heaven Hill 7 Year Bottled-in-Bond", "Heaven Hill", ["heaven hill bib", "heaven hill 7", "hh bib"], "regional", "A respected bottled-in-bond bourbon with uneven distribution.", "Good buy if fairly priced and not common locally."),
  signalBottle("jack-daniels-10-year", "Jack Daniel's 10 Year Tennessee Whiskey", "Jack Daniel's", ["jack 10", "jd10", "jack daniels 10"], "limited", "A limited age-stated Jack Daniel's release.", "Worth grabbing near MSRP if your market rarely sees it."),
  signalBottle("jack-daniels-12-year", "Jack Daniel's 12 Year Tennessee Whiskey", "Jack Daniel's", ["jack 12", "jd12", "jack daniels 12"], "limited", "A limited age-stated Jack Daniel's release with strong demand.", "Grab near MSRP."),
  signalBottle("remus-repeal-reserve", "Remus Repeal Reserve", "Remus", ["remus repeal", "remus reserve"], "limited", "An annual MGP bourbon release.", "Worth considering near MSRP depending on batch and local availability."),
  signalBottle("blood-oath-pact", "Blood Oath Pact", "Blood Oath", ["blood oath", "blood oath pact"], "limited", "A limited annual blended bourbon release.", "Worth considering near MSRP if you like the blend profile."),
  signalBottle("old-fitzgerald-bottled-in-bond", "Old Fitzgerald Bottled-in-Bond", "Old Fitzgerald", ["old fitz", "old fitzgerald bib", "old fitz bib"], "highly_allocated", "A highly allocated decanter series from Heaven Hill.", "Special find near MSRP."),
  signalBottle("rock-hill-farms", "Rock Hill Farms Single Barrel", "Rock Hill Farms", ["rock hill farms", "rhf"], "highly_allocated", "A scarce Buffalo Trace single barrel bourbon.", "Special find near MSRP."),
  signalBottle("elmer-t-lee", "Elmer T. Lee Single Barrel", "Elmer T. Lee", ["elmer t lee", "etl", "elmer lee"], "highly_allocated", "A scarce Buffalo Trace single barrel bourbon.", "Special find near MSRP."),
];

function commonBottle(id: string, canonicalName: string, brand: string, aliases: string[], summary: string, guidance: string, availability: AvailabilityTier = "common"): BibleBottle {
  return {
    id,
    canonicalName,
    brand,
    category: "bourbon",
    availability,
    buyerVerdict: availability === "common" ? "safe_to_pass" : "fair_buy",
    aliases,
    isSignalTracked: false,
    isAlertEligible: false,
    summary,
    guidance,
  };
}

function signalBottle(id: string, canonicalName: string, brand: string, aliases: string[], availability: AvailabilityTier, summary: string, guidance: string): BibleBottle {
  return {
    id,
    canonicalName,
    brand,
    category: canonicalName.toLowerCase().includes("rye") ? "rye" : "bourbon",
    availability,
    buyerVerdict: availability === "unicorn" || availability === "highly_allocated" ? "special_find" : "grab_at_msrp",
    aliases,
    isSignalTracked: true,
    isAlertEligible: availability !== "common",
    summary,
    guidance,
  };
}

export function normalizeBottleKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(kentucky|straight|bourbon|whiskey|whisky|single|barrel|small|batch)\b/g, (word) => word)
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyBottle(value: string) {
  return normalizeBottleKey(value).replace(/\s+/g, "-");
}

function scoreBottleMatch(bottle: BibleBottle, query: string): { score: number; reason: BibleSearchResult["matchReason"] } {
  const q = normalizeBottleKey(query);
  const name = normalizeBottleKey(bottle.canonicalName);
  const brand = normalizeBottleKey(bottle.brand);
  const aliases = bottle.aliases.map(normalizeBottleKey);

  if (!q) return { score: 0, reason: "fuzzy" };
  if (q === name) return { score: 120, reason: "exact" };
  if (aliases.includes(q)) return { score: 115, reason: "alias" };
  if (name.includes(q)) return { score: 92 - Math.max(0, name.length - q.length) / 6, reason: "fuzzy" };
  if (aliases.some((alias) => alias.includes(q))) return { score: 88, reason: "alias" };
  if (q.includes(name)) return { score: 84, reason: "fuzzy" };
  if (brand && q === brand) return { score: 70, reason: "fuzzy" };

  const qTokens = new Set(q.split(" ").filter((token) => token.length > 1));
  const candidates = [name, brand, ...aliases].join(" ").split(" ").filter((token) => token.length > 1);
  const hits = candidates.filter((token) => qTokens.has(token)).length;
  if (hits) return { score: Math.min(74, hits * 24), reason: bottle.isSignalTracked ? "engine" : "fuzzy" };
  return { score: 0, reason: "fuzzy" };
}

function dedupeBottles(bottles: BibleBottle[]) {
  const byKey = new Map<string, BibleBottle>();
  for (const bottle of bottles) {
    const key = bottle.id || slugifyBottle(bottle.canonicalName);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...bottle, aliases: Array.from(new Set([...(bottle.aliases || []), bottle.canonicalName])) });
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...bottle,
      aliases: Array.from(new Set([...(existing.aliases || []), ...(bottle.aliases || []), existing.canonicalName, bottle.canonicalName])),
      isSignalTracked: existing.isSignalTracked || bottle.isSignalTracked,
      isAlertEligible: existing.isAlertEligible || bottle.isAlertEligible,
    });
  }
  return Array.from(byKey.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

function tierFromEngine(value: unknown): AvailabilityTier {
  const tier = String(value || "").toLowerCase();
  if (tier === "unicorn") return "unicorn";
  if (tier === "allocated") return "allocated";
  if (tier === "limited") return "limited";
  return "limited";
}

function readEngineBibleBottles(): BibleBottle[] {
  try {
    const payload = readSiteExport("bottles");
    const raw = Array.isArray(payload?.bottles) ? payload.bottles : [];
    return raw
      .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : null)
      .filter(Boolean)
      .map((item) => {
        const canonicalName = String(item!.canonical_name || item!.name || item!.bottleName || "").trim();
        if (!canonicalName) return null;
        const id = String(item!.canonical_id || item!.id || slugifyBottle(canonicalName));
        const tier = tierFromEngine(item!.tier);
        const aliases = Array.isArray(item!.aliases) ? item!.aliases.map(String) : [];
        return {
          id,
          canonicalName,
          brand: canonicalName.split(/\s+/).slice(0, 2).join(" "),
          producer: typeof item!.producer === "string" ? item!.producer : undefined,
          category: canonicalName.toLowerCase().includes("rye") ? "rye" : "bourbon",
          msrp: typeof item!.msrp === "number" ? item!.msrp : null,
          availability: tier,
          buyerVerdict: tier === "unicorn" ? "special_find" : "grab_at_msrp",
          aliases: [canonicalName, ...aliases],
          isSignalTracked: true,
          isAlertEligible: tier !== "common",
          summary: "This bottle appears in Bourbon Signal's live signal data.",
          guidance: "Use the local signal below to decide whether this is worth grabbing in your area.",
        } satisfies BibleBottle;
      })
      .filter(Boolean) as BibleBottle[];
  } catch {
    return [];
  }
}

function readInventoryBibleBottles(): BibleBottle[] {
  return (inventoryBottles as unknown as BibleBottle[]).map((bottle) => ({
    ...bottle,
    aliases: Array.isArray(bottle.aliases) ? bottle.aliases : [],
    isSignalTracked: false,
    isAlertEligible: Boolean(bottle.isAlertEligible),
  }));
}

export function getBourbonBible() {
  // Inventory bottles are broad lookup context. Curated seed + engine records come after
  // so allocated/drop-aware metadata wins when the same canonical id appears twice.
  return dedupeBottles([...readInventoryBibleBottles(), ...SEED_BOTTLES, ...readEngineBibleBottles()]);
}

export function searchBourbonBible(query: string, limit = 8): BibleSearchResult[] {
  return getBourbonBible()
    .map((bottle) => {
      const match = scoreBottleMatch(bottle, query);
      return { ...bottle, matchScore: match.score, matchReason: match.reason };
    })
    .filter((bottle) => bottle.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || a.canonicalName.localeCompare(b.canonicalName))
    .slice(0, limit);
}

export function getBottleById(id: string) {
  return getBourbonBible().find((bottle) => bottle.id === id) || null;
}
