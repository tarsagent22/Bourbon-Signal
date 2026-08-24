function cityToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const MONTGOMERY_COUNTY_MD_COMMUNITIES = new Set([
  "bethesda",
  "burtonsville",
  "cabin john",
  "chevy chase",
  "clarksburg",
  "damascus",
  "derwood",
  "gaithersburg",
  "garrett park",
  "germantown",
  "glen echo",
  "kensington",
  "montgomery village",
  "north bethesda",
  "north potomac",
  "olney",
  "poolesville",
  "potomac",
  "rockville",
  "silver spring",
  "takoma park",
  "washington grove",
  "wheaton",
]);

export function cityIsInMontgomeryCountyMaryland(value: string) {
  return MONTGOMERY_COUNTY_MD_COMMUNITIES.has(cityToken(value));
}
