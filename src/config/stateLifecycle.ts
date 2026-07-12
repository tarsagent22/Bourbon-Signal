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
    "MD-MONTGOMERY",
    "KY",
    "AZ",
    "CA",
    "FL",
    "GA",
    "MI",
    "MN",
    "MO",
    "NV",
    "WA",
    "WI"
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
      "sourceLabel": "Iowa ABD + Costco warehouse watch",
      "publicStatus": "active",
      "lifecycle": "store_delivery_leads",
      "coverageTier": "store_delivery_leads",
      "refinementLevel": "city",
      "inventoryAlertable": false,
      "watchAlertable": true,
      "customerSummary": "Official Iowa ABD delivery and allocation rows. These are strong store-level leads, not live shelf inventory. Costco warehouse bourbon signals are included where verified for Iowa warehouses."
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
      "sourceLabel": "Alabama ABC + Costco warehouse watch",
      "publicStatus": "active",
      "lifecycle": "scheduled_release_leads",
      "coverageTier": "shipment_drop_intelligence",
      "refinementLevel": "statewide",
      "customerSummary": "Official limited-release schedule and store/drop intelligence. Scheduled release leads, not live shelf inventory. Costco warehouse bourbon signals are included where verified for Alabama warehouses."
    },
    "IL": {
      "customerLabel": "Illinois",
      "sourceLabel": "Illinois Binny's + Costco + retailer inventory watch",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Whitelisted public retailer inventory rows with strict bourbon matching and verify-before-driving caveats. Costco warehouse bourbon signals are included alongside Illinois retailer inventory where verified."
    },
    "IN": {
      "customerLabel": "Indiana",
      "sourceLabel": "Indiana ATC + Costco + retailer inventory watch",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "statewide",
      "customerSummary": "Retailer-specific store inventory/watch surfaces plus ATC store-spine context. ATC rows are not bottle availability. Costco warehouse bourbon signals are included alongside Indiana retailer inventory where verified."
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
      "publicStatus": "research_only",
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
      "sourceLabel": "Florida Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Florida warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "GA": {
      "customerLabel": "Georgia",
      "sourceLabel": "Georgia Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Georgia warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "KY": {
      "customerLabel": "Kentucky",
      "sourceLabel": "Kentucky distillery drops + Costco warehouse watch",
      "publicStatus": "active",
      "lifecycle": "distillery_drop_release_watch",
      "coverageTier": "distillery_release_watch",
      "refinementLevel": "distillery",
      "customerSummary": "Official Kentucky distillery gift-shop/drop and release-watch signals from Buffalo Trace, Old Forester, Four Roses, Heaven Hill, Maker's Mark, and Wild Turkey. Distillery pickup/release leads are clearly separated from retailer store shipment or inventory alerts. Costco warehouse bourbon signals are included where verified for Kentucky warehouses."
    },
    "SC": {
      "customerLabel": "South Carolina",
      "sourceLabel": "South Carolina Costco + retailer inventory mesh",
      "publicStatus": "active",
      "lifecycle": "retailer_store_inventory",
      "coverageTier": "live_store_inventory",
      "refinementLevel": "area",
      "customerAreaLabel": "South Carolina retailer areas",
      "areaOptions": [
        "Myrtle Beach",
        "North Myrtle Beach",
        "Conway",
        "Carolina Forest",
        "Surfside Beach",
        "Murrells Inlet",
        "Columbia",
        "Greenville",
        "Mauldin",
        "Simpsonville",
        "Taylors",
        "Landrum",
        "Spartanburg",
        "Charleston",
        "Mount Pleasant",
        "North Charleston",
        "Summerville",
        "Hilton Head Island",
        "Bluffton",
        "Indian Land",
        "Rock Hill"
      ],
      "customerSummary": "Whitelisted public South Carolina retailer inventory rows with verify-before-driving caveats. DOR ABL pages remain licensing/regulatory context only. Costco warehouse bourbon signals are included alongside South Carolina retailer inventory where verified."
    },
    "AZ": {
      "customerLabel": "Arizona",
      "sourceLabel": "Arizona Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Arizona warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "CA": {
      "customerLabel": "California",
      "sourceLabel": "California Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for California warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "MI": {
      "customerLabel": "Michigan",
      "sourceLabel": "Michigan Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Michigan warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "MN": {
      "customerLabel": "Minnesota",
      "sourceLabel": "Minnesota Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Minnesota warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "MO": {
      "customerLabel": "Missouri",
      "sourceLabel": "Missouri Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Missouri warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "NV": {
      "customerLabel": "Nevada",
      "sourceLabel": "Nevada Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Nevada warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "WA": {
      "customerLabel": "Washington",
      "sourceLabel": "Washington Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Washington warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    },
    "WI": {
      "customerLabel": "Wisconsin",
      "sourceLabel": "Wisconsin Costco warehouse bourbon watch",
      "publicStatus": "active",
      "lifecycle": "costco_warehouse_inventory_watch",
      "coverageTier": "retailer_warehouse_inventory",
      "refinementLevel": "warehouse",
      "customerSummary": "Costco warehouse bourbon signals for Wisconsin warehouses where verified. Costco is treated as an in-state retailer source with fast-moving inventory caveats."
    }
  }
} as const;

export type StateLifecycleConfig = typeof STATE_LIFECYCLE_CONFIG;
export type ActiveStateCode = typeof STATE_LIFECYCLE_CONFIG.activeStates[number];
export type StateLifecycleEntry = StateLifecycleConfig["states"][keyof StateLifecycleConfig["states"]];
