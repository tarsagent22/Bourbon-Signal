import "server-only";

import { unstable_cache } from "next/cache";

import { getRetailerRepository } from "@/lib/retailer-repository";

export const readCachedPublicRetailerSubmissions = unstable_cache(
  async () => getRetailerRepository().listPublicSubmissions(),
  ["public-retailer-submissions-v3"],
  { revalidate: 15 },
);
