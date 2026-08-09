export type CheckoutSyncPayload = {
  ok?: unknown;
  tier?: unknown;
  plan?: unknown;
};

export function shouldOfferFounderGlassClaim(payload: CheckoutSyncPayload | null | undefined) {
  return payload?.ok === true
    && payload.tier === "bottled-in-bond"
    && payload.plan === "bib_lifetime";
}
