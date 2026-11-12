const signal = (id: string, name: string, price: number) => ({
  id,
  contractVersion: "bourbon-signal/signal@1",
  kind: "availability",
  source: { type: "trusted_source", label: "Fixture retailer" },
  bottle: { name, rarity: "allocated" },
  location: { scope: "exact_store", label: "Gilbert, AZ" },
  evidence: {
    photo: false,
    corroborationCount: 0,
    helpfulCount: 0,
    retailerReported: true,
    sourceBacked: true,
  },
  strength: "best",
  alertEligibility: { inventory: true, watch: true },
  actions: [],
  availability: { status: "reported", label: "Retailer reported", price },
  timing: { displayAt: "2026-11-05T02:00:00Z" },
});
const stores = [
  {
    id: "fixture-one",
    name: "Native fixture store",
    address: "750 N Gilbert Road",
    city: "Gilbert",
    state: "AZ",
    latitude: 33.364,
    longitude: -111.79,
    distance: 1.2,
    approximateLocation: true,
    signals: [
      signal("a", "Buffalo Trace Bourbon", 23.99),
      signal("b", "W.L. Weller Full Proof", 69.99),
    ],
  },
  {
    id: "fixture-two",
    name: "Second fixture store",
    address: "100 Main Street",
    city: "Gilbert",
    state: "AZ",
    latitude: 33.33,
    longitude: -111.76,
    distance: 3.2,
    signals: [signal("c", "Eagle Rare 10 Year", 49.99)],
  },
];
const api = {
  nearby: async () => ({
    stores,
    boards: [{id: "fixture-board", kind: "board", name: "Example ABC Board", address: "Shipment reported", city: "", state: "NC", latitude:33.37, longitude:-111.83, distance:3,
      signals: [{...signal("shipment", "Henry McKenna 10 Year", 64.95), shipment: {boardId:"fixture-board", reportedAt:"2026-11-05T12:00:00Z", quantity:414, unit:"units"}, location:{scope:"board",state:"NC",label:"Example ABC Board"}}],
      members: [{id:"member1",name:"Example ABC Store",address:"100 Example Road",city:"Example City",state:"NC",latitude:33.37,longitude:-111.83,distance:3},{id:"member2",name:"Example ABC Store",address:"200 Example Avenue",city:"Example City",state:"NC",latitude:33.39,longitude:-111.81,distance:4},{id:"member3",name:"Example ABC Store",address:"300 Example Street",city:"Example City",state:"NC"}]
    }],
    partial: false,
    unmapped: 1,
    unlocated: [
      {
        ...signal("unlocated", "Eagle Rare 10 Year", 49.99),
        location: {
          scope: "exact_store",
          label: "Gilbert, AZ",
          store: {
            id: "fixture-unlocated",
            name: "Unlocated fixture store",
            address: "200 Example Street",
            city: "Gilbert",
            state: "AZ",
          },
        },
      },
    ],
    previewLocked: false,
  }),
  getMemberPreferences: async () => ({
    bottleAlertPreferences: { bottleNames: ["Eagle Rare 10 Year"] },
  }),
};
export const useMobileApi = () => api;

export async function getItemAsync() {
  return JSON.stringify({
    latitude: 33.3528,
    longitude: -111.789,
    label: "Gilbert, AZ",
  });
}
export async function setItemAsync() {}
