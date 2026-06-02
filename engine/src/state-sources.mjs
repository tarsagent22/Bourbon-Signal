export const ALL_STATE_SOURCES = [
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
    value: 'Excellent public data posture: product catalog and 14-day inventory/delivery snapshot.',
    sources: [
      { kind: 'json', url: 'https://data.iowa.gov/resource/gckp-fe7r.json?$limit=50000', label: 'Iowa Liquor Products Socrata' },
      { kind: 'html', url: 'https://abd.iowa.gov/alcohol/snapshot', label: '14-day inventory/delivery snapshot' },
      { kind: 'html', url: 'https://abd.iowa.gov/alcohol/lottery', label: 'Highly allocated lottery' }
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
      'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Product/Search?search=bourbon'
    ]
  },
  {
    id: 'AL', label: 'Alabama ABC', tier: 'A', strategy: 'release_calendar_and_allocated_lists', cadence: 'daily-monthly',
    value: 'Excellent drop calendar and allocated product pages; more event intelligence than live inventory.',
    sources: [
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-release-programs/monthly', label: 'Monthly limited release' },
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-release-programs/quarterly', label: 'Quarterly limited release' },
      { kind: 'html', url: 'https://alabcboard.gov/stores/events/limited-releases/Allocated-Spirits-List', label: 'Allocated spirits list' },
      { kind: 'html', url: 'https://alabcboard.gov/product-management/QPL', label: 'QPL price/product list' }
    ],
    apiCandidates: []
  },
  {
    id: 'VA', label: 'Virginia ABC', tier: 'B', strategy: 'catalog_plus_limited_availability_watch', cadence: 'daily-60m',
    value: 'Good catalog and regular inventory. Limited products intentionally hidden/randomized; still useful for product/watchlist intelligence.',
    sources: [
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/bourbon', label: 'Virginia bourbon catalog' },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/all-products', label: 'All products' },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/limited-availability', label: 'Limited availability list' },
      { kind: 'html', url: 'https://www.abc.virginia.gov/products/limited-availability/limited-availability-faqs', label: 'Limited availability FAQ' }
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
    value: 'Product catalog, special releases, and allocation policy. Inventory depth may lag or be centralized.',
    sources: [
      { kind: 'html', url: 'https://idaholiquor.com/products/', label: 'Idaho products' },
      { kind: 'html', url: 'https://idaholiquor.com/limited-availability-products/', label: 'Limited availability products' },
      { kind: 'html', url: 'https://idaholiquor.com/special-releases/', label: 'Special releases' },
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
    value: 'Indiana is a private retail market, not a control-state inventory board. Best current value is statewide active package-store coverage from the public ATC permit lookup plus CityHive retailer store inventory/watch surfaces from Big Red/Bourbon World, Cap n Cork, and Wise Guys. ATC permits must never be presented as bottle inventory.',
    sources: [
      { kind: 'html', url: 'https://mylicense.in.gov/everification/Search.aspx?facility=Y', label: 'Indiana ATC public facility permit search' },
      { kind: 'html', url: 'https://www.in.gov/atc/public-records/', label: 'Indiana ATC public records / permit search guidance' },
      { kind: 'html', url: 'https://shop.wiseguysliquors.com/shop/?subtype=bourbon', label: 'Wise Guys CityHive bourbon inventory' },
      { kind: 'html', url: 'https://www.wiseguysliquors.com/wise-guys-events/bourbon-open-house-bourbon-lottery', label: 'Wise Guys bourbon open house / bourbon lottery' },
      { kind: 'html', url: 'https://indianaliquor.com/our-events/', label: 'Indiana Liquor Group tasting events' }
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
    id: 'MI', label: 'Michigan MLCC', tier: 'C', strategy: 'price_book_and_new_item_watch', cadence: 'monthly-weekly',
    value: 'Price book/new-item intelligence, not consumer availability. Useful for product bible and release awareness.',
    sources: [
      { kind: 'html', url: 'https://www.michigan.gov/lara/bureau-list/lcc/spirits-price-book-info', label: 'Spirits price book info' },
      { kind: 'pdf', url: 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/lcc/Price-Book/2-1-26-RETAIL-PRICE-CHANGES-PDF.pdf', label: 'Retail price changes PDF' },
      { kind: 'pdf', url: 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/lcc/Price-Book/11-2-25-NEW-ITEM-PRICE-LIST-PDF.pdf', label: 'New item price list PDF' },
      { kind: 'html', url: 'https://customers.mlcc.michigan.gov/SoM_ProductRegistration/s/search-pricebook', label: 'SIPS pricebook search' }
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
    id: 'WV', label: 'West Virginia ABCA', tier: 'C', strategy: 'product_search_and_barrel_pick_watch', cadence: 'daily-weekly',
    value: 'Product search/new products and barrel picks. No obvious live store inventory.',
    sources: [
      { kind: 'html', url: 'https://www.wvabca.com/liquorsearch.aspx', label: 'WV ABCA liquor search' },
      { kind: 'html', url: 'https://abca.wv.gov/wv-bourbon-whiskey-barrel-picks-0', label: 'WV barrel picks' }
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
    id: 'MS', label: 'Mississippi ABC', tier: 'C', strategy: 'vendor_warehouse_policy_watch', cadence: 'monthly-weekly',
    value: 'Weak public consumer signal; useful for policy/product intelligence until better public data is found.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://www.dor.ms.gov/abc/sales-distribution/past-price-changes-spas', label: 'Past price changes and SPAs' },
      { kind: 'html', url: 'https://www.dor.ms.gov/abc/sales-distribution/vendor-information', label: 'ABC vendor information' },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/June%202026%20SPAs.pdf', label: 'June 2026 SPA price list PDF' },
      { kind: 'pdf', url: 'https://www.dor.ms.gov/sites/default/files/abc/Full%20Price%20List/June%202026%20Bailment%20Price%20Changes.pdf', label: 'June 2026 bailment price changes PDF' }
    ],
    apiCandidates: []
  },
  {
    id: 'KY', label: 'Kentucky ABC', tier: 'C', strategy: 'license_and_active_brand_watch', cadence: 'weekly-monthly',
    value: 'High bourbon relevance but weak consumer availability data; useful for active-brand/licensing intelligence and Kentucky-only release watch.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://abc.ky.gov/', label: 'Kentucky ABC homepage' },
      { kind: 'html', url: 'https://abc.ky.gov/Licensing/Pages/default.aspx', label: 'Kentucky ABC licensing / active brands portal' },
      { kind: 'html', url: 'https://abc.ky.gov/new_docs.aspx?cat=80', label: 'Kentucky ABC forms and guidance' }
    ],
    apiCandidates: []
  },
  {
    id: 'TN', label: 'Tennessee ABC', tier: 'C', strategy: 'license_and_policy_watch', cadence: 'weekly-monthly',
    value: 'Private retail market with limited official consumer availability data; useful for license/policy monitoring and public-source feasibility tracking.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://www.tn.gov/abc.html', label: 'Tennessee ABC homepage' },
      { kind: 'html', url: 'https://www.tn.gov/abc/licensing.html', label: 'Tennessee ABC licensing' },
      { kind: 'html', url: 'https://www.tn.gov/abc/public-information-and-forms.html', label: 'Tennessee ABC public information and forms' }
    ],
    apiCandidates: []
  },
  {
    id: 'SC', label: 'South Carolina DOR ABL', tier: 'C', strategy: 'license_and_regulatory_watch', cadence: 'weekly-monthly',
    value: 'Private retail market; official pages expose liquor licensing and regulatory context, not public bottle/store inventory.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://dor.sc.gov/alcohol-beverage-licensing-abl/liquor-licensing', label: 'South Carolina liquor licensing' },
      { kind: 'html', url: 'https://dor.sc.gov/alcohol-beverage-licensing-abl', label: 'South Carolina alcohol beverage licensing' }
    ],
    apiCandidates: []
  },
  {
    id: 'GA', label: 'Georgia DOR Alcohol', tier: 'C', strategy: 'shipment_report_and_license_watch', cadence: 'weekly-monthly',
    value: 'Private retail market; official DOR pages expose alcohol shipment reporting and licensing, but not consumer bottle inventory.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://dor.georgia.gov/alcohol-shipment-reports', label: 'Georgia alcohol shipment reports' },
      { kind: 'html', url: 'https://dor.georgia.gov/brand-label-registration', label: 'Georgia brand and label registration' },
      { kind: 'html', url: 'https://dor.georgia.gov/active-alcohol-licenses', label: 'Georgia active alcohol licenses' },
      { kind: 'html', url: 'https://dor.georgia.gov/alcohol-tobacco', label: 'Georgia alcohol and tobacco' },
      { kind: 'html', url: 'https://dor.georgia.gov/alcohol-licenses-permits', label: 'Georgia alcohol licenses and permits' }
    ],
    apiCandidates: []
  },
  {
    id: 'FL', label: 'Florida ABT', tier: 'C', strategy: 'license_lottery_and_policy_watch', cadence: 'weekly-monthly',
    value: 'Private retail market; official ABT pages expose quota/license lottery and regulatory data, not public bourbon availability.',
    rareSignalTarget: false,
    sources: [
      { kind: 'html', url: 'https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/', label: 'Florida ABT homepage' },
      { kind: 'html', url: 'https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/quota-license-information/', label: 'Florida quota license information' },
      { kind: 'html', url: 'https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/licensing/', label: 'Florida ABT licensing' }
    ],
    apiCandidates: []
  }
];

export const STATE_SOURCES = ALL_STATE_SOURCES.filter((source) => source.active !== false);
export const DISABLED_STATE_SOURCES = ALL_STATE_SOURCES.filter((source) => source.active === false);
