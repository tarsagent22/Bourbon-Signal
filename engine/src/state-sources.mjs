import { CUSTOMER_ACTIVE_STATE_IDS as CONFIG_CUSTOMER_ACTIVE_STATE_IDS } from './state-lifecycle.mjs';
import { costcoSourceForState } from './costco-eligibility.mjs';
import { GEORGIA_CITYHIVE_SOURCES, GEORGIA_GOTOLIQUOR_STORES, GEORGIA_LIGHTSPEED_STORES } from './collectors/georgia-retailer-surfaces.mjs';
import { FLORIDA_CITYHIVE_SOURCES } from './collectors/florida-retailer-surfaces.mjs';
import {
  FLORIDA_ABC_STORES,
  FLORIDA_GOTOLIQUOR_STORES,
  FLORIDA_PRIMO_SOURCE,
  FLORIDA_SHIPMENT_SHOPIFY_SOURCES,
  FLORIDA_TIVOLI_SOURCE,
} from './collectors/florida-15-20-expansion.mjs';
import { COLORADO_RETAILER_SOURCES, NEW_YORK_RETAILER_SOURCES } from './collectors/metro-retailer-surfaces.mjs';
import { MISSISSIPPI_RETAILER_SOURCES } from './collectors/mississippi-retailer-surfaces.mjs';

const GEORGIA_RETAILER_SOURCES = [
  ...GEORGIA_CITYHIVE_SOURCES.map((source) => ({ name: source.sourceLabel, label: source.sourceLabel, url: source.categoryUrl, precisionOnly: true })),
  ...GEORGIA_GOTOLIQUOR_STORES.map((store) => ({ name: store.sourceLabel, label: store.sourceLabel, url: store.categoryUrl, precisionOnly: true })),
  ...GEORGIA_LIGHTSPEED_STORES.map((store) => ({ name: store.sourceLabel, label: store.sourceLabel, url: store.categoryUrl, precisionOnly: true })),
];

function metroSourceRecord(source) {
  return {
    kind: source.platform === 'shopify' ? 'api' : 'html',
    name: source.sourceLabel,
    label: source.sourceLabel,
    url: source.productsUrl,
    precisionOnly: true,
  };
}

const BASE_STATE_SOURCES = [
  {
    id: 'OH', label: 'Ohio OHLQ', tier: 'A', strategy: 'inventory_locator', cadence: '15-60m',
    value: 'OHLQ catalog and store availability; strong bourbon-hunter value when availability map is accessible.',
    sources: [
      { kind: 'html', url: 'https://www.ohlq.com/liquor/whiskey?productsubtype=bourbon&producttype=american', label: 'OHLQ bourbon catalog' },
      { kind: 'html', url: 'https://www.ohlq.com/about-ohlq/frequently-asked-questions', label: 'OHLQ inventory FAQ' },
      { kind: 'html', url: 'https://www.ohlq.com/', label: 'OHLQ release homepage' }
    ],
    apiCandidates: [
      'https://www.ohlq.com/api/search?keyword=bourbon',
      'https://www.ohlq.com/api/products?productsubtype=bourbon&producttype=american',
      'https://www.ohlq.com/api/product-availability/{sku}?isExclusive=false&sortByAvailability=true&sku={sku}'
    ]
  },
  {
    id: 'OR', label: 'Oregon OLCC / Oregon Liquor Search', tier: 'A', strategy: 'inventory_locator', cadence: 'paused',
    active: false,
    disabledReason: 'Paused for production: Oregon Liquor Search/API currently times out and exports zero user-facing drops; keep as research-only until store-level rows are reliable again.',
    value: 'Research-only for now. State liquor search and monthly product/price list exist, but current refresh does not produce useful user-facing drops.',
    sources: [
      { kind: 'html', url: 'https://www.oregonliquorsearch.com/', label: 'Oregon Liquor Search' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/liquorstores/pages/current_month_productandpricing.aspx', label: 'Current month product/pricing' },
      { kind: 'html', url: 'https://www.oregon.gov/olcc/LIQUORSTORES/pages/special_orders.aspx', label: 'Special orders / locator guidance' }
    ],
    apiCandidates: [
      'https://www.oregonliquorsearch.com/api/search?query=bourbon',
      'https://www.oregonliquorsearch.com/servlet/FrontController?view=global&action=search&productSearch=bourbon'
    ]
  },
  {
    id: 'IA', label: 'Iowa ABD', tier: 'A', strategy: 'public_data_portal', cadence: 'daily-60m',
    value: 'Excellent public data posture: official product inventory CSV, 14-day licensee delivery snapshots, and allocated lottery distribution CSV. Delivery/allocation rows are strong store-level leads, not live shelf inventory.',
    sources: [
      { kind: 'csv', url: 'https://shop.iowaabd.com/snapshot/inventory?download', label: 'Iowa ABD product inventory/delivery CSV' },
      { kind: 'html', url: 'https://shop.iowaabd.com/snapshot/inventory', label: '14-day inventory/delivery snapshot' },
      { kind: 'csv', url: 'https://shop.iowaabd.com/snapshot/lottery?download=allocations', label: 'Highly allocated lottery allocations CSV' }
    ],
    apiCandidates: []
  },
  {
    id: 'UT', label: 'Utah DABS', tier: 'A', strategy: 'product_locator_and_drawings', cadence: 'daily-60m',
    value: 'Product locator, product lists, and rare/high-demand drawings. Useful but rare drops often lottery-based.',
    sources: [
      { kind: 'html', url: 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', label: 'DABS product locator' },
      { kind: 'html', url: 'https://abs.utah.gov/shop-products/interactive-product-list/', label: 'Interactive product lists' },
      { kind: 'html', url: 'https://abs.utah.gov/shop-products/allocatedandrare/', label: 'Allocated and rare products' },
      { kind: 'html', url: 'https://abs.utah.gov/dabs-special-barrel-selections/', label: 'Special barrel selections' }
    ],
    apiCandidates: [
      'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Products/GetItemsForTerm?term=bourbon'
    ]
  },
  {
    id: 'AL', label: 'Alabama ABC', tier: 'A', strategy: 'release_calendar_and_allocated_lists', cadence: 'daily-monthly',
    value: 'Excellent official allocated-release intelligence: monthly PDFs expose store-level release/distribution rows with date/store/address/product/price, plus allocated product and quarterly price-book references. This is scheduled release/drop intelligence, not live shelf inventory.',
    sources: [
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-release-programs/monthly', label: 'Monthly limited release' },
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-release-programs/quarterly', label: 'Quarterly limited release' },
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-releases/Allocated-Spirits-List', label: 'Allocated spirits list' },
      { kind: 'html', url: 'https://alabcboard.gov/product-management/QPL', label: 'QPL price/product list' },
      { kind: 'pdf', url: 'https://alabcboard.gov/sites/default/files/inline-files/2026%20Limited%20Release%20Schedule.pdf', label: 'Allocated delivery calendar' }
    ],
    apiCandidates: []
  },
  {
    id: 'VA', label: 'Virginia ABC', tier: 'B', strategy: 'catalog_plus_limited_availability_watch', cadence: 'daily-60m',
    value: 'Good catalog and regular inventory. Limited products intentionally hidden/randomized; still useful for product/watchlist intelligence.',
    sources: [
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/bourbon', label: 'Virginia bourbon catalog', precisionOnly: true },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/all-products', label: 'All products', precisionOnly: true },
      { kind: 'csv', url: 'https://www.abc.virginia.gov/products/products-faqs/product-downloads', label: 'Official product price/downloads with VA ABC item codes', precisionOnly: true },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/limited-availability', label: 'Limited availability list', precisionOnly: true },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/limited-availability/limited-availability-faqs', label: 'Limited availability FAQ', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'PA', label: 'Pennsylvania FWGS / PLCB', tier: 'B', strategy: 'catalog_and_store_pickup_inventory', cadence: '15-60m',
    value: 'Large statewide ecomm/catalog footprint. Bot protection likely; use browser/API discovery if direct fetch fails.',
    sources: [
      { kind: 'html', url: 'https://www.finewineandgoodspirits.com/search?Ntt=bourbon', label: 'FWGS bourbon search' },
      { kind: 'html', url: 'https://www.finewineandgoodspirits.com/faq', label: 'FWGS FAQ' },
      { kind: 'html', url: 'https://www.lcb.pa.gov/pages/search.aspx', label: 'PLCB search portal' }
    ],
    apiCandidates: [
      'https://www.finewineandgoodspirits.com/ccstoreui/v1/search?Ntt=bourbon',
      'https://www.apps.lcb.pa.gov/webapp/Product_Management/psi_ProductDefault_Inter.asp'
    ]
  },
  {
    id: 'ID', label: 'Idaho State Liquor Division', tier: 'B', strategy: 'catalog_limited_release_watch', cadence: 'daily',
    value: 'Product catalog, special releases, allocation policy, and official product availability modal rows. Store rows expose Available status/as-of date but not bottle count.',
    sources: [
      { kind: 'html', url: 'https://idaholiquor.com/products/', label: 'Idaho products' },
      { kind: 'html', url: 'https://idaholiquor.com/limited-availability-products/', label: 'Limited availability products' },
      { kind: 'html', url: 'https://idaholiquor.com/special-releases/', label: 'Special releases' },
      { kind: 'api', url: 'https://idaholiquor.com/wp-admin/admin-ajax.php', label: 'Idaho product availability AJAX', precisionOnly: true },
      { kind: 'html', url: 'https://liquor.idaho.gov/product-allocation.html', label: 'Allocation policy' }
    ],
    apiCandidates: []
  },
  {
    id: 'NC', label: 'North Carolina ABC + county boards', tier: 'B', strategy: 'warehouse_plus_county_board_inventory', cadence: '15-60m',
    value: 'State warehouse/product data plus county-board inventory where available. Fragmented, but very high user value; prioritize high-signal county boards over adding weak private-market states.',
    sources: [
      { kind: 'html', url: 'https://abc2.nc.gov/Search/Product', label: 'NC product search' },
      { kind: 'html', url: 'https://abc2.nc.gov/StoresBoards/Stocks', label: 'NC warehouse stock status' },
      { kind: 'html', url: 'https://www.abc.nc.gov/local-abc-boards/public-allocated-and-limited-distribution-list/open', label: 'Public allocated/limited distribution list' },
      { kind: 'html', url: 'https://wakeabc.com/search-our-inventory/', label: 'Wake County ABC inventory' },
      { kind: 'html', url: 'https://www.meckabc.com/store_operations/specialty_products_lottery.php', label: 'Mecklenburg specialty products lottery' },
      { kind: 'html', url: 'https://www.newhanovercountyabc.com/bourbon-blast/', label: 'New Hanover Bourbon Blast / allocated notifications' },
      { kind: 'html', url: 'https://www.newhanovercountyabc.com/barrels/', label: 'New Hanover barrel picks' },
      { kind: 'html', url: 'https://www.newhanovercountyabc.com/sales/', label: 'New Hanover monthly sale items' }
    ],
    apiCandidates: []
  },
  {
    id: 'IN', label: 'Indiana ATC + retailer inventory watch', tier: 'B', strategy: 'license_spine_plus_retailer_store_inventory', cadence: 'daily-60m',
    value: 'Indiana is a private retail market, not a control-state inventory board. Best current value is statewide active package-store coverage from the public ATC permit lookup plus identity-bound retailer inventory from Target RedSky, Kahn\'s, Big Red/Bourbon World, Cap n Cork, Wise Guys, Belmont Beverage/Chalet Party Shoppe, Cork Liquors, Holiday Liquors, 21st Amendment, Penguin Liquor, and Payless Liquors East Street. ATC permits must never be presented as bottle inventory; delivery aggregators remain watch-only.',
    sources: [
      { kind: 'html', url: 'https://mylicense.in.gov/everification/Search.aspx?facility=Y', label: 'Indiana ATC public facility permit search', precisionOnly: true },
      { kind: 'html', url: 'https://www.in.gov/atc/public-records/', label: 'Indiana ATC public records / permit search guidance', precisionOnly: true },
      { kind: 'api', url: 'https://www.kahnsfinewines.com/api/trpc/product.getAll', label: 'Kahn\'s Fine Wines & Spirits in-stock bourbon API', precisionOnly: true },
      { kind: 'api', url: 'https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1', label: 'Target Indiana exact-store pickup/orderability', precisionOnly: true },
      { kind: 'html', url: 'https://belmontbev.com/shop?subtype=bourbon', label: 'Belmont Beverage / Chalet Party Shoppe CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://shop.corkliquor.com/spirits/bourbon', label: 'Cork Liquors CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://www.paylessliquors.info/barrel-selections', label: 'Payless Liquors East Street barrel selections', precisionOnly: true },
      { kind: 'html', url: 'https://www.wiseguysliquors.com/wise-guys-events/bourbon-open-house-bourbon-lottery', label: 'Wise Guys bourbon open house / bourbon lottery', precisionOnly: true },
      { kind: 'html', url: 'https://indianaliquor.com/our-events/', label: 'Indiana Liquor Group tasting events', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'IL', label: "Illinois Binny's + retailer inventory watch", tier: 'B', strategy: 'retailer_store_inventory', cadence: '15-60m',
    value: "Illinois is a private retail market, so the highest-value public signal is retailer-specific. Binny's exposes a public Algolia product/store index with Illinois store locations plus per-store bourbon purchase availability, stock labels, prices, and aisle metadata. Treat as retailer-published availability, not guaranteed shelf possession.",
    sources: [
      { kind: 'api', url: 'https://Z25A2A928M-dsn.algolia.net/1/indexes/Products_Production/query', label: "Binny's public product/store inventory index", precisionOnly: true },
      { kind: 'api', url: 'https://Z25A2A928M-dsn.algolia.net/1/indexes/Stores_Production/query', label: "Binny's public Illinois store index", precisionOnly: true },
      { kind: 'html', url: 'https://www.binnys.com/spirits?refinementList%5BproductVarietal%5D%5B0%5D=Bourbon', label: "Binny's bourbon category", precisionOnly: true },
      { kind: 'html', url: 'https://www.binnys.com/store-locator/', label: "Binny's store locator", precisionOnly: true },
      { kind: 'html', url: 'https://www.binnys.com/whiskey-hotline/', label: "Binny's Whiskey Hotline / limited rarities", precisionOnly: true },
      { kind: 'html', url: 'https://atjewelosco.com/bourbonlovers/', label: 'Jewel Whiskey Bourbon Lovers program watch' }
    ],
    apiCandidates: []
  },
  {
    id: 'NH', label: 'New Hampshire Liquor & Wine Outlets', tier: 'B', strategy: 'catalog_and_limited_release_category', cadence: 'daily-60m',
    value: 'State outlet catalog and special/limited release categories. Good travel/cross-border value.',
    sources: [
      { kind: 'html', url: 'https://www.liquorandwineoutlets.com/product-list?search=bourbon', label: 'NH bourbon search' },
      { kind: 'html', url: 'https://www.liquorandwineoutlets.com/Product-List/Spirits-WHISKEY-BOURBONWHISKEY', label: 'NH bourbon whiskey category' },
      { kind: 'html', url: 'https://www.liquorandwineoutlets.com/product-list/Spirits/SpecialLimitedReleaseItems', label: 'Special/limited release items' },
      { kind: 'html', url: 'https://www.liquorandwineoutlets.com/Limited-Release-Drawing', label: 'Limited release drawing' },
      { kind: 'html', url: 'https://www.liquorandwineoutlets.com/store-locator', label: 'Store locator' }
    ],
    apiCandidates: []
  },
  {
    id: 'MD-MONTGOMERY', label: 'Montgomery County ABS', tier: 'B', strategy: 'county_inventory_and_HAL', cadence: 'daily-60m',
    value: 'County-only but unusually strong: open daily product inventory/pricing dataset plus monthly highly allocated liquor program.',
    sources: [
      { kind: 'json', url: 'https://data.montgomerycountymd.gov/resource/ib5t-5ncy.json?$query=select%20code%2Ccategory%2Cdescription%2Csize%2Ctotalinventory%2Cprice%2Csaleprice%2Csaleenddate%20where%20lower(category)%20like%20%27%25bourbon%25%27%20limit%20500', label: 'ABS Store Inventory and Sale Items open data' },
      { kind: 'html', url: 'https://www2.montgomerycountymd.gov/abssearch/default.aspx', label: 'ABS product search' },
      { kind: 'html', url: 'https://www.montgomerycountymd.gov/ABS/HAL/', label: 'Highly allocated liquor program' },
      { kind: 'html', url: 'https://www.montgomerycountymd.gov/ABS/Stores/', label: 'ABS stores' }
    ],
    apiCandidates: []
  },
  {
    id: 'ME', label: 'Maine Spirits', tier: 'C', strategy: 'product_finder_and_lottery_watch', cadence: 'daily-weekly',
    value: 'Product finder, specials, lottery and limited release pages. Inventory granularity uncertain.',
    sources: [
      { kind: 'html', url: 'https://www.mainespirits.com/spirits-finder', label: 'Maine spirits finder' },
      { kind: 'html', url: 'https://www.mainespirits.com/2026-limited-release-spirits-lottery', label: 'Limited release lottery' },
      { kind: 'html', url: 'https://www.mainespirits.com/maine-spirits-agent-portal/messages', label: 'Latest messages' }
    ],
    apiCandidates: []
  },
  {
    id: 'VT', label: 'Vermont 802Spirits', tier: 'C', strategy: 'product_price_and_allocated_watch', cadence: 'daily-weekly',
    value: 'Product/pricing reports and allocated-product guidance. Weak live availability.',
    sources: [
      { kind: 'html', url: 'https://www.802spirits.com/ourproducts', label: '802Spirits products' },
      { kind: 'html', url: 'https://www.802spirits.com/pricereports', label: 'Pricing reports' },
      { kind: 'pdf', url: 'https://www.802spirits.com/sites/spirits/files/documents/Pricing_Current_Sales.pdf', label: 'Current sales pricing PDF' },
      { kind: 'pdf', url: 'https://www.802spirits.com/sites/spirits/files/documents/Pricing_Next_Sales.pdf', label: 'Next sales pricing PDF' },
      { kind: 'html', url: 'https://www.802spirits.com/allocated-products', label: 'Allocated products' }
    ],
    apiCandidates: []
  },
  {
    id: 'MT', label: 'Montana Department of Revenue', tier: 'C', strategy: 'warehouse_product_and_agency_store_watch', cadence: 'weekly',
    value: 'Warehouse/product ordering info and agency store list. Public inventory is likely weak.',
    sources: [
      { kind: 'html', url: 'https://revenue.mt.gov/alcoholic-beverage-control/agency-liquor-stores/product-information', label: 'Product information' },
      { kind: 'pdf', url: 'https://revenuefiles.mt.gov/files/ABCD/Agency-Liquor-Stores/Product-Information/Price-Books/Aug-Oct-2025/Aug-Oct-2025-Price-Book.pdf', label: 'Montana liquor price book PDF' },
      { kind: 'html', url: 'https://revenue.mt.gov/alcoholic-beverage-control/agency-liquor-stores/', label: 'Agency liquor stores' }
    ],
    apiCandidates: []
  },
  {
    id: 'WV', label: 'West Virginia official purchase and barrel intelligence', tier: 'C', strategy: 'exact_store_recent_purchase_and_barrel_pick_watch', cadence: 'Daily',
    value: 'Exact-store WVABCA retailer purchases within the trailing three-month window, plus current official barrel selections and the active licensed-store directory. Purchase rows are call-first shipment leads, not live shelf inventory.', rareSignalTarget: true,
    sources: [
      {
        id: 'wv-abca-recent-purchases',
        name: 'WV ABCA exact-store recent retailer purchases',
        label: 'WV ABCA exact-store recent retailer purchases',
        url: 'https://www.wvabca.com/liquorsearch.aspx',
        collapse: { minBaseline: 20, minRatio: 0.7 },
        scheduleMetrics: { changeRate: 0.08, userValue: 0.92, failureRate: 0.08, cost: 0.35 }
      },
      { id: 'wv-abca-barrel-selections', name: 'WV ABCA current barrel selections', label: 'WV ABCA current barrel selections', url: 'https://abca.wv.gov/spirits/wv-bourbon-whiskey-barrel-picks' }
    ],
    apiCandidates: []
  },
  {
    id: 'WY', label: 'Wyoming Liquor Division', tier: 'C', strategy: 'wholesale_listing_watch', cadence: 'monthly-weekly',
    value: 'Weak consumer signal; useful as product/listing intelligence only unless retailer-facing data becomes available.',
    sources: [
      { kind: 'html', url: 'https://liquor365.wyo.gov/', label: 'Wyoming Liquor Division' },
      { kind: 'html', url: 'https://liquor365.wyo.gov/questions', label: 'Wyoming FAQ' }
    ],
    apiCandidates: []
  },
  {
    id: 'MS', label: 'Mississippi sparse exact-store retailer inventory', tier: 'B', strategy: 'hybrid_official_intelligence_private_retailer', cadence: 'inventory-60m_directory-weekly',
    value: 'Complete official Package Retailer premises directory plus ten isolated exact inventory adapters and one bounded retailer release-watch adapter. Three public Tupelo2Go merchant pages require exact permit-premise and immutable restaurant-ID binding and prove only current binary menu orderability. Fresh exact-store rows may publish on-site; release-watch rows and all outbound alerts remain disabled. Official catalog, pricing, SPA, bailment, wholesale, and policy evidence remains noninventory; runtime health determines current storefront usability.',
    active: true,
    rareSignalTarget: true,
    sources: [
      { kind: 'html', url: 'https://tap.dor.ms.gov/_/', label: 'Mississippi DOR TAP Package Retailer directory', sourceLayer: 'directory', precisionOnly: true, inventoryAuthoritative: false, sourcePolicyStatus: 'source_policy_blocked', autonomousFetchAllowed: false, captureMode: 'operator_supplied_authorized_capture_only' },
      { kind: 'html', url: 'https://www.dor.ms.gov/abc/sales-distribution/past-price-changes-spas', label: 'Past price changes and SPAs', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      { kind: 'html', url: 'https://www.dor.ms.gov/abc/sales-distribution/vendor-information', label: 'ABC vendor information', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/July%202026%20SPAs.pdf', label: 'July 2026 SPA price list PDF', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/July%202026%20Bailment%20Price%20Changes.pdf', label: 'July 2026 bailment price changes PDF', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/August%202026%20SPAs.pdf', label: 'August 2026 SPA price list PDF', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/August%202026%20Bailment%20Price%20Changes.pdf', label: 'August 2026 bailment price changes PDF', sourceLayer: 'official_intelligence', inventoryAuthoritative: false },
      ...MISSISSIPPI_RETAILER_SOURCES.map((source) => ({
        kind: source.platform === 'godaddy_release_watch' ? 'api' : 'html',
        name: source.sourceLabel,
        label: source.sourceLabel,
        url: source.categoryUrl,
        precisionOnly: true,
        sourceLayer: source.autonomousFetchAllowed === false
          ? 'storefront_probe'
          : source.platform === 'godaddy_release_watch' ? 'retailer_release_watch' : 'private_retailer_inventory',
        autonomousFetchAllowed: source.autonomousFetchAllowed !== false,
        sourcePolicyStatus: source.sourcePolicyStatus,
        sourceRuntimeId: source.sourceRuntimeId,
        permitNumber: source.permitNumber,
      }))
    ],
    apiCandidates: []
  },
  {
    id: 'KY', label: 'Kentucky official distillery drops + release watch', tier: 'B', strategy: 'official_distillery_drop_and_release_watch', cadence: 'daily-60m',
    value: 'Kentucky is the distillery Mecca. Customer-facing value comes from Buffalo Trace gift-shop availability plus official release-watch pages from major Kentucky distilleries, explicitly separated from retailer store inventory.',
    rareSignalTarget: true,
    sources: [
      { kind: 'html', url: 'https://abc.ky.gov/', label: 'Kentucky ABC homepage' },
      { kind: 'html', url: 'https://abc.ky.gov/Licensing/Pages/default.aspx', label: 'Kentucky ABC licensing / active brands portal' },
      { kind: 'html', url: 'https://abc.ky.gov/new_docs.aspx?cat=80', label: 'Kentucky ABC forms and guidance' },
      { kind: 'html', url: 'https://www.buffalotracedistillery.com/visit-us/product-availability/', label: 'Buffalo Trace Distillery daily gift-shop product availability', precisionOnly: true },
      { kind: 'html', url: 'https://www.oldforester.com/birthday-bourbon-faqs/', label: 'Old Forester Birthday Bourbon official release FAQ', precisionOnly: true },
      { kind: 'html', url: 'https://www.fourrosesbourbon.com/bourbon/2025-limited-edition-small-batch', label: 'Four Roses Limited Edition official release page', precisionOnly: true },
      { kind: 'html', url: 'https://heavenhilldistillery.com/heavenhill-heritage-collection.php', label: 'Heaven Hill Heritage Collection official release page', precisionOnly: true },
      { kind: 'html', url: 'https://www.makersmark.com/bourbons/greats-of-the-gate', label: "Maker's Mark Greats of the Gate official release page", precisionOnly: true },
      { kind: 'html', url: 'https://www.makersmark.com/bourbons/makers-mark-cellar-aged', label: "Maker's Mark Cellar Aged official limited-release page", precisionOnly: true },
      { kind: 'html', url: 'https://www.makersmark.com/bourbons/makers-mark-wood-finishing-series-collection', label: "Maker's Mark Wood Finishing Series official limited-release page", precisionOnly: true },
      { kind: 'html', url: 'https://www.wildturkeybourbon.com/en-us/products/masters-keep-beacon/', label: "Wild Turkey Master's Keep Beacon official release page", precisionOnly: true },
      { kind: 'html', url: 'https://www.wildturkeybourbon.com/en-us/products/austin-nichols-archives-bourbons/', label: 'Wild Turkey Austin Nichols Archives official release page', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'TN', label: 'Tennessee retailer inventory watch', tier: 'B', strategy: 'retailer_store_inventory', cadence: 'daily-60m',
    value: 'Private retail market. Official ABC pages are policy/license context only; selected public retailer e-commerce pages and Shopify storefront JSON expose store-level bourbon inventory with verify-before-driving caveats across Nashville, Memphis, Knoxville, Chattanooga, Johnson City, Franklin, Brentwood, Germantown, Mount Pleasant, Maryville, Smyrna, Hendersonville, Crossville, and Murfreesboro.',
    sources: [
      { kind: 'html', url: 'https://www.tn.gov/abc.html', label: 'Tennessee ABC homepage' },
      { kind: 'html', url: 'https://www.tn.gov/abc/licensing.html', label: 'Tennessee ABC licensing' },
      { kind: 'html', url: 'https://www.tn.gov/abc/public-information-and-forms.html', label: 'Tennessee ABC public information and forms' },
      { kind: 'html', url: 'https://www.frugalmacdoogal.com/shop/?subtype=bourbon', label: 'Frugal MacDoogal CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://corkdorkswine.com/shop/?subtype=bourbon', label: 'Corkdorks CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://bustersliquors.com/shop/?subtype=bourbon', label: "Buster's Memphis CityHive bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://kimbroughwines.com/shop/?subtype=bourbon', label: 'Kimbrough Memphis CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://cristysliquorstore.com/shop/?subtype=bourbon', label: "Cristy's Brentwood CityHive bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://shop.reddogwineandspirits.com/shop/?subtype=bourbon', label: 'Red Dog Franklin CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://moonwineandspirits.com/shop/?subtype=bourbon', label: 'Moon Wine & Spirits CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://westsidewineandspirits.com/shop/?subtype=bourbon', label: 'Westside Wine & Spirits CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://lakedistrictwineandliquor.com/shop/?subtype=bourbon', label: 'Lake District Wine and Liquor Lakeland CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://liquorvault.com/shop/?subtype=bourbon', label: 'Liquor Vault Knoxville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://foursixesliquors.com/shop/?subtype=bourbon', label: 'Four Sixes Liquors & Wines Mount Pleasant CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://happyour0c3f6e1f.sites.cityhive.app/shop/?subtype=bourbon', label: 'Happy Ours Wine & Spirits Franklin CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://germanto0f24660d.sites.cityhive.app/shop/?subtype=bourbon', label: 'Germantown Wine & Liquor CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://lakeshorewineandspirit.com/shop/?subtype=bourbon', label: 'Lakeshore Wine & Spirits Knoxville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://kirbywina689aaf8.sites.cityhive.app/shop/?subtype=bourbon', label: 'Kirby Wines & Liquors Memphis CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://greenmea1758acc7.sites.cityhive.app/shop/?subtype=bourbon', label: 'Green Meadow Wine & Spirits Maryville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://junction-liquors.com/shop/?subtype=bourbon', label: 'Junction Liquors Smyrna CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://pourvous.us/shop/?subtype=bourbon', label: 'Pour Vous Wine Spirits & Beer Hendersonville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://goodtime438b8d5d.sites.cityhive.app/shop/?subtype=bourbon', label: 'Good Times Wine Spirits & Brew Crossville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://campbellstationwine.com/shop/?subtype=bourbon', label: 'Campbell Station Wine & Spirits Knoxville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://shopredspirits.com/shop/?subtype=bourbon', label: 'RED Spirits & Wine Nashville CityHive bourbon inventory', precisionOnly: true },
      { kind: 'json', url: 'https://thebottleshopfranklin.com/collections/bourbon/products.json?limit=250', label: 'The Bottle Shop at McEwen Shopify bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://mnjliquor.com/shop/?subtype=bourbon', label: 'M&J Chattanooga CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://redbankliquor.com/shop/?subtype=bourbon', label: 'Red Bank Chattanooga CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://chattliquor.com/shop/?subtype=bourbon', label: 'Discount Liquor Chattanooga CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://northshorews.com/shop/?subtype=bourbon', label: 'Northshore Wine & Spirits Chattanooga CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://onestopwines.net/shop/?subtype=bourbon', label: 'One Stop Johnson City CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://shop.coolspringswine.com/s/1000-1057/c/spirits/bourbon', label: 'Cool Springs Wine & Spirits retailer bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://backend-prod.grabbl.io/api/v1/product/search', label: 'Gateway Wine & Spirits Grabbl public store API', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'TX', label: "Texas retailer inventory + TABC watch", tier: 'B', strategy: 'retailer_store_inventory_candidate', cadence: '30-60m',
    value: "Texas is a private retail market. Guarded first-party CityHive sources provide exact-store retailer availability across DFW, Houston, Central Texas, San Antonio, and the Gulf Coast. TABC and Spec's event/catalog pages remain non-inventory context.",
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://comptroller.texas.gov/taxes/alcohol/', label: 'Texas Comptroller alcohol reporting' },
      { kind: 'html', url: 'https://www.tabc.texas.gov/public-information/tabc-public-inquiry/', label: 'TABC public inquiry / license search' },
      { kind: 'html', url: 'https://twinliquors.com/shop/?subtype=bourbon', label: 'Twin Liquors CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://www.zippsliquor.com/shop/?subtype=Bourbon', label: 'Zipps Liquor CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://www.pelicanliquor.com/shop/?subtype=Bourbon', label: 'Pelican Liquor McKinney CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://tipsyliquorroundrock.com/shop/?subtype=Bourbon', label: 'Tipsy Liquor Round Rock CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://wbliquors.com/shop/?subtype=whiskey', label: 'WB Liquors & Wine Texas CityHive whiskey inventory', precisionOnly: true },
      { kind: 'html', url: 'https://shop.maverickbevtx.com/shop/?subtype=Whiskey', label: 'JB Maverick of Texas CityHive whiskey inventory', precisionOnly: true },
      { kind: 'html', url: 'https://oakliquorcabinet.com/shop/?subtype=Bourbon', label: 'Oak Liquor Cabinet Austin CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://liquorpedia.us/shop/?subtype=Bourbon', label: 'Liquorpedia Riverstone CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://spankysliquor.com/shop/?subtype=Bourbon', label: "Spanky's Liquor Texas CityHive bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://specsonline.com/shop/spirits/?s=bourbon', label: "Spec's public bourbon product search", precisionOnly: true },
      { kind: 'html', url: 'https://specsonline.com/bourbonday2024/', label: "Spec's Bourbon Drop / rare-release event page", precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'SC', label: 'South Carolina retailer inventory mesh', tier: 'B', strategy: 'retailer_store_inventory', cadence: 'daily-60m',
    value: 'South Carolina is a private retail market. Customer-facing value comes from whitelisted public retailer sources that expose store-level rows across major and secondary SC markets: Green\'s Beverage, Wine & Bourbon Barn, O\'Darby\'s, Beach Discount, Surf Beverage, Palmetto Liquor, DEV Liquors, Moss Creek, Rollers, Da Brown Bag Clover stock counts, Southern Spirits Shopify availability, and All American Liquor WooCommerce in-store availability. Official DOR ABL pages remain licensing/regulatory context only.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://dor.sc.gov/alcohol-beverage-licensing-abl/liquor-licensing', label: 'South Carolina liquor licensing' },
      { kind: 'html', url: 'https://dor.sc.gov/alcohol-beverage-licensing-abl', label: 'South Carolina alcohol beverage licensing' },
      { kind: 'html', url: 'https://www.greensbeverages.com/shop/?subtype=bourbon', label: "Green's Beverage SC CityHive merchant-id bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://winebarnsc.com/shop/?subtype=bourbon', label: 'Wine & Bourbon Barn CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://odarbysliquorbarn.com/shop/?subtype=bourbon', label: "O'Darby's Liquor Barn CityHive bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://beachdiscountbeverages.com/shop/?subtype=bourbon', label: 'Beach Discount Beverages CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://surfbeverages.com/shop/?subtype=bourbon', label: 'Surf Beverage Myrtle Beach CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://palmettoliquor.com/shop/?subtype=bourbon', label: 'Palmetto Liquor CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://devliquors.com/shop/?subtype=bourbon', label: 'DEV Liquors CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://www.mosscreekvillagespiritsandwine.com/shop/?subtype=bourbon', label: 'Moss Creek Village Spirits & Wine CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://rollerswineandspirits.com/shop/?subtype=bourbon', label: 'Rollers Wine & Spirits CityHive bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://dabrownbag.com/wp-json/moo-clover/v1/search/bourbon', label: 'Da Brown Bag Clover bourbon stockCount API', precisionOnly: true },
      { kind: 'json', url: 'https://southernspirits.com/products.json?limit=250', label: 'Southern Spirits Shopify product availability feed', precisionOnly: true },
      { kind: 'api', url: 'https://www.aalmauldin.com/wp-json/wc/store/v1/products?search=blanton&per_page=20', label: 'All American Liquor Mauldin WooCommerce in-store availability', precisionOnly: true },
      { kind: 'api', url: 'https://www.yourliquorlibrary.com/shop/whisky/2', label: 'Liquor Library North Myrtle Beach Square exact-store inventory', precisionOnly: true },
      { kind: 'api', url: 'https://discountliquorfm.square.site/s/shop', label: 'Discount Liquor Fort Mill Square exact-store inventory', precisionOnly: true },
      { kind: 'api', url: 'https://liquorstorenearmemyrtlebeach.com/wp-json/wc/store/products?search=bourbon&per_page=20', label: 'Liquor Store Near Me Myrtle Beach WooCommerce catalog', precisionOnly: true },
      { kind: 'api', url: 'https://burntbarrelwineandspirits.com/wp-json/tribe/events/v1/events?search=bourbon&per_page=5', label: 'Burnt Barrel Wine & Spirits events watch', precisionOnly: true },
      { kind: 'html', url: 'https://www.owensliquors.com/shop/product/1792-small-batch-bourbon/573141c869702d067c152900', label: 'Owens Liquors guarded CityHive discovery', precisionOnly: true }
    ],
    apiCandidates: []
  },

  {
    id: 'AZ', label: 'Arizona retailer inventory + Costco watch', tier: 'B', strategy: 'retailer_store_inventory_and_costco_watch', cadence: '30-60m',
    value: 'Arizona is a private retail market. Public CityHive inventory from selected Phoenix retailers provides store-level bottle, quantity, price, and address signals; Costco remains a separate warehouse watch. Retailer availability is fast-moving and must be verified before driving.',
    rareSignalTarget: true,
    sources: [
      { kind: 'html', url: 'https://paradiseliquoraz.com/shop/?subtype=bourbon', label: 'Paradise Liquor Mini Mart Phoenix CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://paradiseliquoraz.com/shop/?subtype=whiskey', label: 'Paradise Liquor Mini Mart Phoenix CityHive whiskey inventory', precisionOnly: true },
      { kind: 'html', url: 'https://azliquorvault.com/shop/?subtype=bourbon', label: 'Liquor Vault Scottsdale CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://skylinebroadway.com/shop/?subtype=bourbon', label: 'Skyline Liquor Mesa and Casa Grande CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://chandlerliquorsaz.com/shop/?subtype=Bourbon', label: 'Chandler Liquors CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://luckysliquor.com/shop/?search=bourbon', label: "Lucky's Liquor Phoenix CityHive bourbon inventory", precisionOnly: true },
      { kind: 'html', url: 'https://onestopdrivethruliquor.com/shop/?search=bourbon', label: 'One Stop Drive Thru Liquor Phoenix CityHive bourbon inventory', precisionOnly: true },
      { kind: 'html', url: 'https://liquorexpresstempe.store/shop/?subtype=bourbon', label: 'Liquor Express Tempe CityHive bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://mesaliquorstore.com/wp-json/wc/store/v1/products?search=bourbon&per_page=100&page=1', label: 'Mesa Liquor WooCommerce in-stock bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://bestliquortempe.com/wp-json/wc/store/v1/products?search=bourbon&per_page=100&page=1', label: 'Best Liquor Tempe WooCommerce in-stock bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://flagstaffliquor.com/products.json?limit=250', label: 'Flagstaff Liquor Shopify available bourbon inventory', precisionOnly: true },
      { kind: 'api', url: 'https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=85001&radius=50&size=100', label: 'Safeway and Albertsons Arizona XAPI store inventory', precisionOnly: true },
      { kind: 'api', url: 'https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2', label: 'Target Arizona RedSky store fulfillment', precisionOnly: true },
      { kind: 'xml', url: 'https://www.totalwine.com/Store-en-USD.xml', label: 'Total Wine Arizona authoritative store discovery', precisionOnly: true },
      { kind: 'api', url: 'https://api.kroger.com/v1/locations?filter.zipCode.near=85001&filter.radiusInMiles=25&filter.limit=50', label: "Fry's official Kroger Locations API", precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'CA', label: 'California first-party retailer availability + Costco warehouse watch', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: 'San Diego first-party retailer pickup availability with exact premises identity and binary orderability semantics; online catalog-only sources remain watch-only. Costco stays a separate warehouse lane.',
    rareSignalTarget: true,
    sources: [
      { kind: 'api', url: 'https://www.delmesaliquor.com/products.json?limit=250', label: 'Del Mesa Liquor Shopify San Diego pickup availability', precisionOnly: true },
      { kind: 'api', url: 'https://missiontrailswineandspirits.com/products.json?limit=250', label: 'Mission Trails Wine & Spirits Shopify San Diego pickup availability', precisionOnly: true },
      { kind: 'api', url: 'https://chipsliquor.com/products.json?limit=250', label: 'Chips Liquor Shopify online catalog watch', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'NY', label: 'New York City + Nassau County first-party retailer inventory', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: 'Exact-premises New York City and Nassau County retailer inventory from configured CityHive and Shopify storefronts. Coverage is intentionally limited to the named premises; binary availability is never projected as an exact count.',
    rareSignalTarget: true,
    sources: NEW_YORK_RETAILER_SOURCES.map(metroSourceRecord),
    apiCandidates: []
  },
  {
    id: 'CO', label: 'Denver Metro first-party retailer inventory', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: "Exact-premises Denver Metro CityHive inventory from Bonnie Brae Liquor, Molly's Spirits, and Total Beverage. Only allowlisted merchant/store pickup rows qualify, and CityHive sentinel quantities remain binary rather than exact.",
    rareSignalTarget: true,
    sources: COLORADO_RETAILER_SOURCES.map(metroSourceRecord),
    apiCandidates: []
  },
  {
    id: 'MI', label: 'Michigan Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',
    value: 'Costco-only expansion state. Michigan Costco spirits access can produce useful bourbon warehouse signals where verified.',
    sources: [],
    apiCandidates: []
  },
  {
    id: 'MN', label: 'Minnesota Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',
    value: 'Costco-only expansion state. Minnesota Costco spirits access can produce useful bourbon warehouse signals where verified.',
    rareSignalTarget: false,
    sources: [],
    apiCandidates: []
  },
  {
    id: 'MO', label: 'Missouri Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',
    value: 'Costco-only expansion state. Missouri Costco warehouses are useful private-market bourbon signals where verified.',
    rareSignalTarget: false,
    sources: [],
    apiCandidates: []
  },
  {
    id: 'NV', label: 'Nevada first-party retailer inventory and Costco watch', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: 'Exact-store first-party pickup/orderability from Liquor World, Liquor Box, Albertsons, Vons, and Safeway across Las Vegas Valley and Reno–Sparks. Binary availability remains distinct from exact quantity; Costco stays a separate warehouse watch lane.',
    rareSignalTarget: true,
    sources: [
      { kind: 'retailer', url: 'https://liquorworldlv.com/shop/?subtype=Bourbon', label: 'Liquor World CityHive Las Vegas store orderability', precisionOnly: true },
      { kind: 'retailer', url: 'https://theliquorboxlv.com/collections/1000-plus-whiskey-varieties', label: 'Liquor Box POS360 Las Vegas pickup orderability', precisionOnly: true },
      { kind: 'api', url: 'https://www.albertsons.com/abs/pub/xapi/search/substitute', label: 'Albertsons Nevada XAPI store inventory', precisionOnly: true },
      { kind: 'api', url: 'https://www.vons.com/abs/pub/xapi/search/substitute', label: 'Vons Nevada XAPI store inventory', precisionOnly: true },
      { kind: 'api', url: 'https://www.safeway.com/abs/pub/xapi/search/substitute', label: 'Safeway Nevada XAPI store inventory', precisionOnly: true },
      { kind: 'retailer', url: 'https://liquorlineup.com/products.json?limit=250', label: 'Liquor Lineup Shopify Nevada catalog watch', precisionOnly: true },
      { kind: 'retailer', url: 'https://crystalliquor.com/wp-json/wc/store/v1/products?search=bourbon&per_page=100', label: 'Crystal Liquor WooCommerce Nevada catalog watch', precisionOnly: true }
    ],
    apiCandidates: []
  },
  {
    id: 'WA', label: 'Washington Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',
    value: 'Costco-only expansion state. Washington is a high-signal Costco spirits market and should be monitored through warehouse/app observations.',
    rareSignalTarget: false,
    sources: [],
    apiCandidates: []
  },
  {
    id: 'WI', label: 'Wisconsin Costco warehouse bourbon watch', tier: 'B', strategy: 'costco_warehouse_inventory_watch', cadence: '15-60m',
    value: 'Costco-only expansion state. Wisconsin Costco spirits access can produce useful bourbon warehouse signals where verified.',
    rareSignalTarget: false,
    sources: [],
    apiCandidates: []
  },
  {
    id: 'GA', label: 'Georgia retailer inventory + Costco warehouse watch', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: 'Exact-identity first-party Georgia retailer inventory plus Costco warehouse observations where verified. Binary Add to Cart/orderability is distinct from exact CityHive quantity, and every store signal carries a verify-before-driving caveat.',
    rareSignalTarget: true,
    sources: GEORGIA_RETAILER_SOURCES,
    apiCandidates: []
  },
  {
    id: 'FL', label: 'Florida retailer inventory + Costco warehouse watch', tier: 'B', strategy: 'retailer_store_inventory', cadence: '30-60m',
    value: 'Whitelisted Florida retailer storefront and store-fulfillment inventory, with Costco warehouse observations where verified. Store availability is retailer-published and must carry verify-before-driving caveats.',
    rareSignalTarget: true,
    sources: [
      { name: 'MDP Liquor Kissimmee Shopify inventory', label: 'MDP Liquor Kissimmee Shopify inventory', url: 'https://mdpliquorfl.com/products.json?limit=250&page=1', precisionOnly: true },
      { name: 'Target Florida RedSky fulfillment', label: 'Target Florida RedSky fulfillment', url: 'https://www.target.com/sl/orlando-millenia/1518', precisionOnly: true },
      { name: 'ABC Fine Wine & Spirits public bourbon search', label: 'ABC Fine Wine & Spirits public bourbon search', url: 'https://abcfws.com/spirits/shop-by-type/bourbon/', precisionOnly: true },
      { name: 'Luekens Wine & Spirits Shopify store pickup inventory', label: 'Luekens Wine & Spirits Shopify store pickup inventory', url: 'https://www.luekensliquors.com/collections/bourbon', precisionOnly: true },
      { name: "Jensen's Liquors Shopify pickup inventory", label: "Jensen's Liquors Shopify pickup inventory", url: 'https://jensensliquors.com/collections/american-bourbons', precisionOnly: true },
      { name: 'Total Wine Florida store inventory discovery', label: 'Total Wine Florida store inventory discovery', url: 'https://www.totalwine.com/store-finder/browse/FL', precisionOnly: true },
      ...FLORIDA_CITYHIVE_SOURCES.map((source) => ({ name: source.sourceLabel, label: source.sourceLabel, url: source.categoryUrl, precisionOnly: true })),
      { name: FLORIDA_PRIMO_SOURCE.sourceLabel, label: FLORIDA_PRIMO_SOURCE.sourceLabel, url: FLORIDA_PRIMO_SOURCE.productsUrl, precisionOnly: true },
      ...FLORIDA_SHIPMENT_SHOPIFY_SOURCES.map((source) => ({ name: source.sourceLabel, label: source.sourceLabel, url: source.productsUrl, precisionOnly: true })),
      ...FLORIDA_ABC_STORES.slice(0, 1).map((source) => ({ name: source.sourceLabel, label: source.sourceLabel, url: source.searchUrl, precisionOnly: true })),
      ...FLORIDA_GOTOLIQUOR_STORES.map((source) => ({ name: source.sourceLabel, label: source.sourceLabel, url: source.categoryUrl, precisionOnly: true })),
      { name: FLORIDA_TIVOLI_SOURCE.sourceLabel, label: FLORIDA_TIVOLI_SOURCE.sourceLabel, url: FLORIDA_TIVOLI_SOURCE.productUrl, precisionOnly: true },
      { name: 'Florida Plaza Liquors bourbon catalog', label: 'Florida Plaza Liquors bourbon catalog', url: 'https://www.floridaplazaliquors.com/s-11422/c-2/buy-liquor/t-11/buy-bourbon-whiskey' },
      { name: 'Liquor Depot Tampa online quantity watch', label: 'Liquor Depot Tampa online quantity watch', url: 'https://www.liquordepottampa.com/shop-picks', precisionOnly: true },
      { name: "Gaspar's Liquor Shoppe Lightspeed store inventory", label: "Gaspar's Liquor Shoppe Lightspeed store inventory", url: 'https://www.gasparsliquorshoppe.com/bourbon/', precisionOnly: true }
    ],
    apiCandidates: []
  }
];

export const ALL_STATE_SOURCES = BASE_STATE_SOURCES.map((source) => {
  const costcoSource = costcoSourceForState(source.id);
  return costcoSource ? { ...source, sources: [...source.sources, costcoSource] } : source;
});

export const CUSTOMER_ACTIVE_STATE_IDS = CONFIG_CUSTOMER_ACTIVE_STATE_IDS;

export const STATE_SOURCES = ALL_STATE_SOURCES.filter((source) => source.active !== false && CUSTOMER_ACTIVE_STATE_IDS.has(source.id));
export const DISABLED_STATE_SOURCES = ALL_STATE_SOURCES.filter((source) => source.active === false || !CUSTOMER_ACTIVE_STATE_IDS.has(source.id));
