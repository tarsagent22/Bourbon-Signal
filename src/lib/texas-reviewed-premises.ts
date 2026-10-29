import reviewed from "../../engine/data/texas-shopify-pickup-retailers.json";

// This closed mapping reconciles the published pickup suite spelling with the
// already known TABC premise. It grants directory selection, never stock proof.
export const TEXAS_REVIEWED_PICKUP_PREMISES = reviewed.source.stores;

export function reconcileReviewedTexasPremises(rows: readonly Record<string, unknown>[]) {
  return rows.map(row => {
    const store = TEXAS_REVIEWED_PICKUP_PREMISES.find(store => row.state === "TX"
      && row.id === store.officialDirectoryProof.id && row.name === store.officialDirectoryProof.name
      && row.address === store.officialDirectoryProof.address && row.city === store.city
      && row.zip === store.zip && row.county === store.county
      && row.sourceUrl === store.officialDirectoryProof.sourceUrl);
    if (!store) return row;
    return {...row,address:store.address,aliases:[...(Array.isArray(row.aliases)?row.aliases:[]),...store.aliases,store.name]};
  });
}
