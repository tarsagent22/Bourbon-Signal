import type { ScarcityTier, StateScarcityOverride } from "@/lib/bottle-scarcity";

/**
 * Authoritative evidence registry for scarcity classifications.
 * State systems establish local handling; they never set a national tier by themselves.
 */
export const BOTTLE_SCARCITY_SOURCE_REGISTRY = {
  "engine-verified-inventory-signals": {
    type: "verified_signal",
    label: "Bourbon Signal verified multi-state inventory observations",
    url: "https://www.bourbonsignal.com/coverage",
  },
  "official-al-master-list": {
    type: "official_state",
    label: "Alabama ABC Allocated Spirits List",
    url: "https://alabcboard.gov/stores/events/limited-releases/Allocated-Spirits-List",
  },
  "official-va-lottery": {
    type: "official_state",
    label: "Virginia ABC Limited Availability Lottery",
    url: "https://www.abc.virginia.gov/products/limited-availability/lottery",
  },
  "official-va-limited-faq": {
    type: "official_state",
    label: "Virginia ABC Limited Availability FAQ",
    url: "https://www.abc.virginia.gov/products/limited-availability/limited-availability-faqs",
  },
  "official-pa-lottery-terms": {
    type: "official_state",
    label: "Pennsylvania Limited Release Lottery Terms",
    url: "https://www.finewineandgoodspirits.com/retail-customer-limited-release-lottery-terms-and-conditions",
  },
  "official-nc-quarterly-price-list": {
    type: "official_state",
    label: "North Carolina ABC Quarterly Price List",
    url: "https://www.abc.nc.gov/spirituous-liquor-pricing",
  },
  "official-nc-supplier-allocation": {
    type: "official_state",
    label: "North Carolina ABC Supplier Allocation Information",
    url: "https://www.abc.nc.gov/pricing/information-new-suppliers",
  },
  "official-nc-board-faq": {
    type: "official_state",
    label: "North Carolina ABC Local Board FAQ",
    url: "https://www.abc.nc.gov/boards-stores/frequently-asked-boards-and-stores-questions",
  },
  "official-nabca-control-directory": {
    type: "official_state",
    label: "NABCA Control State Directory",
    url: "https://www.nabca.org/control-state-directory-and-info",
  },
  "official-wv-abca-current-barrel-selections": {
    type: "official_state",
    label: "West Virginia ABCA Current Barrel Selections",
    url: "https://abca.wv.gov/spirits/wv-bourbon-whiskey-barrel-picks",
  },
} as const;

/**
 * Reviewed exact matches from Alabama ABC's official May 2026 allocated-products PDF.
 * The source is a binary allocated list; it proves local rationing but cannot lower a
 * stronger national scarcity tier or establish a national classification.
 */
export const ALABAMA_ALLOCATED_PRODUCT_MATCHES: Readonly<Record<string, string>> = {
  "1792-12-year": "1792 AGED BOURBON 125 PR. 12 YR. 750 ML",
  "1792-bottled-in-bond": "1792 B.I.B. BOURBON 100 PR. 8 YR. 750 ML",
  "1792-full-proof": "1792 FULL PR. BOURBON 125 PR. 750 ML",
  "1792-single-barrel-bourbon": "1792 SINGLE BARREL BOURBON WHISKEY 98 PR. 750 ML",
  "1792-sweet-wheat-bourbon": "1792 SWEET WHEAT BOURBON 91 PR. 8 YR. 750 ML",
  "blantons-single-barrel": "BLANTONS BOURBON 93 PR. 750 ML",
  "blantons-gold-bourbon": "BLANTON'S GOLD BOURBON 103 PR. 750 ML",
  "blantons-straight-from-the-barrel": "BLANTON'S STRAIGHT FROM THE BARREL BOURBON 129 PR. 750 ML",
  "buffalo-trace-bourbon": "BUFFALO TRACE BOURBON 90 PR. 750 ML",
  "e-h-taylor-jr-barrel-proof-bourbon": "E.H. TAYLOR JR. BARREL PR. BOURBON 127 PR. 750 ML",
  "eh-taylor-single-barrel": "E.H. TAYLOR JR. SINGLE BARREL BOURBON 100 PR. 750 ML",
  "eh-taylor-small-batch": "E.H. TAYLOR JR. SMALL BATCH BOURBON B.I.B 100 PR. 7 YR. 750 ML",
  "e-h-taylor-jr-straight-rye-whiskey": "E.H. TAYLOR JR. STRAIGHT RYE WHISKEY 100 PR. 750 ML",
  "eagle-rare-10": "EAGLE RARE SINGLE BARREL BOURBON 90 PR. 10 YR. 750 ML",
  "eagle-rare-17-year": "EAGLE RARE SINGLE BARREL BOURBON 90 PR. 17 YR. 750 ML",
  "elijah-craig-barrel-proof": "ELIJAH CRAIG BARREL PR. BOURBON 132 PR. 12 YR. 750 ML",
  "elijah-craig-18-year": "ELIJAH CRAIG SINGLE BARREL 18 YR. 90 PR. 750 ML",
  "elijah-craig-toasted-barrel": "ELIJAH CRAIG TOASTED BARREL BOURBON 94 PR. 750 ML",
  "elmer-t-lee": "ELMER T. LEE BOURBON 90 PR. 750 ML",
  "four-roses-limited-edition-small-batch": "FOUR ROSES LE SMALL BATCH BOURBON 108 PR. 750 ML",
  "george-t-stagg": "GEORGE T. STAGG BOURBON 141 PR. 750 ML",
  "henry-mckenna-10-year": "HENRY MCKENNA SINGLE BARREL BOURBON 100 PR. 10 YR. 750 ML",
  "jack-daniels-10-year": "JACK DANIEL'S 10YR OLD BATCH 2 97 PR. 700 ML",
  "jack-daniels-12-year": "JACK DANIEL'S 12Y BATCH 1 TENN WHISKEY 107 PR. 700 ML",
  "knob-creek-12": "KNOB CREEK BOURBON 100 PR. 12 YR. 750 ML",
  "larceny-barrel-proof": "LARCENY BARREL PROOF BOURBON 100 PR. 750 ML",
  "makers-mark-cellar-aged": "MAKER'S MARK CELLAR AGED STRAIGHT BOURBON 115.70 PR. 750 ML",
  "michters-10-year-bourbon": "MICHTERS STRAIGHT BOURBON WHISKEY 94.4 PR. 10 YR. 750 ML",
  "michters-10y-ks-rye-whiskey": "MICHTERS KENTUCKY STRAIGHT RYE WHISKEY 92 PR. 10 YR. 750 ML",
  "old-fitzgerald-8y-bottled-in-bond-decanter-2023": "OLD FITZGERALD DECANTER BIB BOURBON 100 PR. 8 YR.",
  "old-forester-birthday-bourbon": "OLD FORESTER BIRTHDAY BOURBON 96 PR. 750 ML",
  "old-rip-van-winkle-10": "PAPPY VAN WINKLE BOURBON 107 PR. 10 YR. 750 ML",
  "pappy-van-winkle-15": "PAPPY VAN WINKLE BOURBON 107 PR. 15 YR. 750 ML",
  "pappy-van-winkle-20": "PAPPY VAN WINKLE BOURBON 90 PR. 20 YR. 750 ML",
  "pappy-van-winkle-23": "PAPPY VAN WINKLE BOURBON 95 PR. 23 YR. 750 ML",
  "rock-hill-farms": "ROCK HILL FARMS BOURBON 100 PR. 750 ML",
  "russells-reserve-13-year": "RUSSELL'S RESERVE BOURBON 114 PR. 13 YR. 750 ML",
  "sazerac-18": "SAZERAC RYE 90 PR. 18 YR. 750 ML",
  "stagg": "STAGG BOURBON 131 PR. 750 ML",
  "thomas-h-handy": "THOMAS H. HANDY RYE 127 PR. 750 ML",
  "weller-12-year": "WELLER 90 PR. 12 YR. 750 ML",
  "weller-antique-107": "WELLER ANTIQUE 107 BOURBON 107 PR. 7 YR. 750 ML",
  "weller-cypb": "WELLER CYPB STRAIGHT BOURBON WHISKEY 95 PR.",
  "weller-full-proof": "WELLER FULL PROOF BOURBON 114 PR. 750 ML",
  "weller-millennium": "WELLER MILLENNIUM KENTUCKY STRAIGHT BOURBON 90 PR. 750 ML",
  "weller-single-barrel": "WELLER SINGLE BARREL BOURBON 97 PR. 750 ML",
  "weller-special-reserve": "WELLER SPECIAL RESERVE 90 PR. 7 YR. 750 ML",
  "william-larue-weller": "WILLIAM L. WELLER BOURBON 127 PR. 750 ML",
};

export const BOTTLE_STATE_SCARCITY_OVERRIDES: Record<string, StateScarcityOverride[]> = {
  "ezra-brooks-stave-finish-spice-and-clove": [{
    jurisdiction: "WV",
    tier: "limited",
    confidence: "medium",
    reason: "West Virginia ABCA's current barrel-selection page lists this exact state-specific expression. The listing establishes a limited special release in West Virginia, not shelf availability or store quantity.",
    officialAllocationStatus: "special_release",
    verifiedOpportunityCount: 0,
    coverageDenominator: 0,
    evidenceWindow: { start: "2026-01-01", end: "2026-08-09" },
    sourceIds: ["official-wv-abca-current-barrel-selections"],
    lastReviewedAt: "2026-08-09",
  }],
  "weller-12-year": [{
    jurisdiction: "VA",
    tier: "highly_allocated",
    confidence: "high",
    reason: "Virginia ABC has distributed Weller 12 Year through its limited-availability lottery, with published bottle and entry counts showing extremely constrained retail access.",
    officialAllocationStatus: "lottery",
    verifiedOpportunityCount: 1882,
    coverageDenominator: 28707,
    evidenceWindow: { start: "2025-01-01", end: "2026-08-03" },
    sourceIds: ["official-va-lottery", "official-va-limited-faq"],
    lastReviewedAt: "2026-08-03",
  }],
  "old-rip-van-winkle-10": [{
    jurisdiction: "VA",
    tier: "unicorn",
    confidence: "high",
    reason: "Virginia ABC's February 2026 lottery listed 245 Old Rip Van Winkle 10 Year bottles against 59,899 entries, establishing exceptional local scarcity.",
    officialAllocationStatus: "lottery",
    verifiedOpportunityCount: 245,
    coverageDenominator: 59899,
    evidenceWindow: { start: "2026-02-16", end: "2026-02-19" },
    sourceIds: ["official-va-lottery", "official-va-limited-faq"],
    lastReviewedAt: "2026-08-03",
  }],
};

function withAllocatedFloor(tier: ScarcityTier): ScarcityTier {
  return tier === "regular" || tier === "limited" ? "allocated" : tier;
}

export function getBottleStateScarcityOverrides(bottleId: string, nationalTier: ScarcityTier): StateScarcityOverride[] {
  const overrides = [...(BOTTLE_STATE_SCARCITY_OVERRIDES[bottleId] || [])];
  const officialAlabamaName = ALABAMA_ALLOCATED_PRODUCT_MATCHES[bottleId];
  if (officialAlabamaName) {
    overrides.push({
      jurisdiction: "AL",
      tier: withAllocatedFloor(nationalTier),
      confidence: "medium",
      reason: `Alabama ABC's May 2026 allocated-products list includes ${officialAlabamaName}. The official list proves local rationing but does not set the national tier.`,
      officialAllocationStatus: "state_allocated",
      verifiedOpportunityCount: 0,
      coverageDenominator: 0,
      evidenceWindow: { start: "2026-05-01", end: "2026-08-03" },
      sourceIds: ["official-al-master-list"],
      lastReviewedAt: "2026-08-03",
    });
  }

  const jurisdictions = new Set<string>();
  for (const override of overrides) {
    if (jurisdictions.has(override.jurisdiction)) throw new Error(`Duplicate curated scarcity override for ${bottleId}/${override.jurisdiction}`);
    jurisdictions.add(override.jurisdiction);
  }
  return overrides;
}
