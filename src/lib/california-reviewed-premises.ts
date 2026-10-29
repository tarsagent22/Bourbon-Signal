import { CALIFORNIA_GROCERY_SOURCES } from "../../engine/src/collectors/california-grocery-premises.mjs";

// These exact premises were reviewed from current first-party local pages and
// store resolvers. They supplement the license directory, never its stock data.
export const CALIFORNIA_REVIEWED_PREMISES = CALIFORNIA_GROCERY_SOURCES.map((source) => ({
  id: source.storeId,
  state: "CA",
  name: source.name,
  address: source.address,
  city: source.city,
  zip: source.zip,
  source: "Reviewed first-party California grocery premises",
  sourceUrl: source.premiseUrl,
}));
