/**
 * Explicit, reviewable identity redirects for source IDs that describe the same bottle.
 * Variants, vintages, proofs, barrel selections, and sizes remain separate unless listed here.
 */
export const BOTTLE_IDENTITY_REDIRECTS: Readonly<Record<string, string>> = {
  "buffalo-trace": "buffalo-trace-bourbon",
  "buffalo-trace-ky-straight-bourbon": "buffalo-trace-bourbon",
  "bb_257576efcd142ce7": "1792-sweet-wheat-bourbon",
  "bb_2b5d9987117596c4": "blantons-gold-bourbon",
  "bb_5afa9241206ab963": "blantons-single-barrel",
  "colonel-e-h-taylor-small-batch-bottled-in-bond-bourbon": "eh-taylor-small-batch",
  "e-h-taylor-bottled-in-bond": "eh-taylor-small-batch",
  "e-h-taylor-jr-small-batch": "eh-taylor-small-batch",
  "e-h-taylor-jr-single-barrel-bourbon": "eh-taylor-single-barrel",
  "bb_304d5ab72ff15ab2": "eh-taylor-single-barrel",
  "bb_b575401320b1c321": "e-h-taylor-jr-straight-rye-whiskey",
  "bb_18013da36d2e4da4": "e-h-taylor-jr-barrel-proof-bourbon",
  "bb_8c124ba38652152c": "old-fitzgerald-8y-bottled-in-bond-decanter-2023",
  "bb_3566c2a0088ec99a": "elijah-craig-18-year",
  "eagle-rare-10y": "eagle-rare-10",
  "eagle-rare-10-year": "eagle-rare-10",
  "bb_b7ca7cc4ab428ba8": "henry-mckenna-10-year",
  "bb_78043ec3da926c43": "makers-mark-cellar-aged",
  "bb_ab29607e7117c93f": "michters-10y-ks-rye-whiskey",
  "bb_a66a1b8df27382e5": "russells-reserve-13-year",
  "stagg-bourbon": "stagg",
  "michters-25-year-kentucky-straight-bourbon": "michters-25y-bourbon",
  "bb_4e7a2ea067e741fd": "new-riff-8-year-bourbon",
  "bb_705e46cbfe42ad32": "new-riff-8-year-bourbon",
  "bb_1799afb0fab6e7bd": "ezra-brooks-stave-finish-spice-and-clove",
  "elijah-craig-barrel-proof-small-batch": "elijah-craig-barrel-proof",
  "rock-hill-farms-bourbon": "rock-hill-farms",
  "pappy-van-winkles-family-reserve-15y": "pappy-van-winkle-15",
  "bb_89f4f171664009c0": "pappy-van-winkle-20",
  "pappy-van-winkles-family-reserve-20y": "pappy-van-winkle-20",
  "bb_251412a45d0064c1": "pappy-van-winkle-23",
  "pappy-van-winkles-family-reserve-23y": "pappy-van-winkle-23",
};

export function canonicalBottleId(id: string) {
  let current = String(id || "").trim();
  const visited = new Set<string>();
  while (BOTTLE_IDENTITY_REDIRECTS[current]) {
    if (visited.has(current)) throw new Error(`Bottle identity redirect cycle at ${current}`);
    visited.add(current);
    current = BOTTLE_IDENTITY_REDIRECTS[current];
  }
  return current;
}

const REDIRECT_TARGETS = new Set(Object.values(BOTTLE_IDENTITY_REDIRECTS));

export function isBottleIdentityRedirectTarget(id: string) {
  return REDIRECT_TARGETS.has(id);
}

for (const id of Object.keys(BOTTLE_IDENTITY_REDIRECTS)) canonicalBottleId(id);
