export const STATE_LIFECYCLE_CONFIG = {
  "activeStates": [
    "NC",
    "VA",
    "PA",
    "OH",
    "IA",
    "ID",
    "AL",
    "IL",
    "IN",
    "TN",
    "SC",
    "UT",
    "MD-MONTGOMERY"
  ],
  "states": {
    "NC": {
      "customerLabel": "North Carolina",
      "sourceLabel": "North Carolina ABC + county boards",
      "publicStatus": "active",
      "lifecycle": "store_inventory_and_board_leads",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "board",
      "customerSummary": "ABC board, warehouse, and selected county-board store signals where public sources support them. Board-level rows are leads, not exact shelf inventory."
    },
    "VA": {
      "customerLabel": "Virginia",
      "sourceLabel": "Virginia ABC",
      "publicStatus": "active",
      "lifecycle": "store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "city",
      "customerSummary": "Virginia ABC store availability for normal products, with limited-availability caveats."
    },
    "PA": {
      "customerLabel": "Pennsylvania",
      "sourceLabel": "Pennsylvania FWGS / PLCB",
      "publicStatus": "active",
      "lifecycle": "store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "city_store",
      "customerSummary": "FWGS pickup/store inventory where public browser extraction confirms current store rows."
    },
    "OH": {
      "customerLabel": "Ohio",
      "sourceLabel": "Ohio OHLQ",
      "publicStatus": "active",
      "lifecycle": "store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "city",
      "customerSummary": "OHLQ browser-assisted store availability where the public source is reachable."
    },
    "IA": {
      "customerLabel": "Iowa",
      "sourceLabel": "Iowa ABD",
      "publicStatus": "active",
      "lifecycle": "store_delivery_leads",
      "coverageTier": "store_delivery_leads",
      "refinementLevel": "city",
      "inventoryAlertable": false,
      "watchAlertable": true,
      "customerSummary": "Official Iowa ABD delivery and allocation rows. These are strong store-level leads, not live shelf inventory."
    },
    "ID": {
      "customerLabel": "Idaho",
      "sourceLabel": "Idaho State Liquor Division",
      "publicStatus": "active",
      "lifecycle": "store_availability_status",
      "coverageTier": "store_availability_status",
      "refinementLevel": "city",
      "customerSummary": "Official Idaho Liquor store availability status and as-of-date rows by store/city. No bottle-count or reservation guarantee; verify before driving."
    },
    "AL": {
      "customerLabel": "Alabama",
      "sourceLabel": "Alabama ABC",
      "publicStatus": "active",
      "lifecycle": "scheduled_release_leads",
      "coverageTier": "shipment_drop_intelligence",
      "refinementLevel": "statewide",
      "customerSummary": "Official limited-release schedule and store/drop intelligence. Scheduled release leads, not live shelf inventory."
    },
    "IL": {
      "customerLabel": "Illinois",
      "sourceLabel": "Illinois Binny's + retailer inventory watch",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Whitelisted public retailer inventory rows with strict bourbon matching and verify-before-driving caveats."
    },
    "IN": {
      "customerLabel": "Indiana",
      "sourceLabel": "Indiana ATC + retailer inventory watch",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Retailer-specific store inventory/watch surfaces plus ATC store-spine context. ATC rows are not bottle availability."
    },
    "TN": {
      "customerLabel": "Tennessee",
      "sourceLabel": "Tennessee ABC + retailer inventory watch",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Whitelisted Tennessee retailer e-commerce inventory with verify-before-driving caveats; official ABC pages are policy context only."
    },
    "UT": {
      "customerLabel": "Utah",
      "sourceLabel": "Utah DABS",
      "publicStatus": "active",
      "lifecycle": "aggregate_inventory_watch",
      "coverageTier": "aggregate_inventory_watch",
      "refinementLevel": "statewide",
      "inventoryAlertable": false,
      "watchAlertable": false,
      "customerSummary": "DABS product locator, warehouse/store aggregate, allocated, and barrel-selection watch data. Not exact per-store shelf inventory yet."
    },
    "MD-MONTGOMERY": {
      "customerLabel": "Maryland",
      "sourceLabel": "Montgomery County ABS",
      "customerAreaLabel": "Montgomery County",
      "areaOptions": [
        "Montgomery County"
      ],
      "publicStatus": "active",
      "lifecycle": "county_aggregate_inventory_watch",
      "coverageTier": "aggregate_inventory_watch",
      "refinementLevel": "area",
      "inventoryAlertable": false,
      "watchAlertable": false,
      "customerSummary": "Maryland coverage currently starts with Montgomery County ABS aggregate inventory and HAL program data. Exact per-store drilldown is a hardening target."
    },
    "OR": {
      "customerLabel": "Oregon",
      "sourceLabel": "Oregon OLCC / Oregon Liquor Search",
      "publicStatus": "research_only",
      "lifecycle": "blocked_store_inventory_research",
      "coverageTier": "blocked",
      "refinementLevel": "store",
      "customerSummary": "Research-only until Oregon Liquor Search browser/session collection reliably produces current store rows."
    },
    "NH": {
      "customerLabel": "New Hampshire",
      "sourceLabel": "New Hampshire Liquor & Wine Outlets",
      "publicStatus": "research_only",
      "lifecycle": "blocked_catalog_research",
      "coverageTier": "blocked",
      "refinementLevel": "store",
      "customerSummary": "Research-only until NHLC outlet/product data can be accessed reliably without Cloudflare/Turnstile failures."
    },
    "FL": {
      "customerLabel": "Florida",
      "sourceLabel": "Florida ABT + retailer mesh target",
      "publicStatus": "research_only",
      "lifecycle": "retailer_mesh_candidate",
      "coverageTier": "policy_source_discovery",
      "refinementLevel": "statewide",
      "customerSummary": "Retailer-mesh candidate. Official ABT sources are regulatory/licensing context, not bottle availability."
    },
    "GA": {
      "customerLabel": "Georgia",
      "sourceLabel": "Georgia DOR + retailer mesh target",
      "publicStatus": "research_only",
      "lifecycle": "retailer_mesh_candidate",
      "coverageTier": "catalog_watch",
      "refinementLevel": "statewide",
      "customerSummary": "Retailer-mesh candidate. Official DOR sources are registration/license context, not consumer bottle availability."
    },
    "KY": {
      "customerLabel": "Kentucky",
      "sourceLabel": "Kentucky ABC + retailer/event target",
      "publicStatus": "research_only",
      "lifecycle": "retailer_event_candidate",
      "coverageTier": "catalog_watch",
      "refinementLevel": "statewide",
      "customerSummary": "High-value bourbon market, but active customer coverage needs retailer/distillery/event sources rather than weak official licensing pages."
    },
    "SC": {
      "customerLabel": "South Carolina",
      "sourceLabel": "South Carolina retailer inventory mesh",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Whitelisted public South Carolina retailer inventory rows with verify-before-driving caveats. DOR ABL pages remain licensing/regulatory context only."
    }
  }
} as const;

export type StateLifecycleConfig = typeof STATE_LIFECYCLE_CONFIG;
export type ActiveStateCode = typeof STATE_LIFECYCLE_CONFIG.activeStates[number];
export type StateLifecycleEntry = StateLifecycleConfig["states"][keyof StateLifecycleConfig["states"]];
