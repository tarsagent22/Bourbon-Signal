export const FALLBACK_HINTS = {
  OH: [
    {
      url: 'https://www.ohlq.com/liquor/exclusives',
      label: 'OHLQ exclusive releases',
      type: 'official_search_index_signal',
      text: 'OHLQ Exclusive Releases tracks Ohio Liquor barrel picks and drops. Search index confirms OHLQ product pages include inventory language such as browse inventory at nearby Ohio Liquor locations, choose a location, and view availability map.',
      nextRoute: 'Use browser-rendered extraction after Cloudflare verification, then inspect product-card/network calls for product slugs and availability map requests.'
    },
    {
      url: 'https://www.ohlq.com/liquor/whiskey/american/bourbon/makers-mark-limited-release-wood-finishing-series',
      label: 'OHLQ product page example',
      type: 'official_search_index_signal',
      text: "OHLQ indexed product pages expose name, category, proof/size, state code, and availability-map UX. Example indexed product: Maker's Mark Limited Release Wood Finishing Series 750 ML.",
      nextRoute: 'Build browser/CDP collector for OHLQ product search and product-detail pages; do not rely on raw server fetch because Cloudflare returns 403.'
    }
  ],
  VA: [
    {
      url: 'https://www.abc.virginia.gov/products/bourbon',
      label: 'Virginia ABC bourbon catalog',
      type: 'official_search_index_signal',
      text: 'Virginia ABC bourbon catalog says it contains more than 150 premium bourbons that can be purchased online or shipped to a selected store in 7-14 days or less when eligible.',
      nextRoute: 'Use browser-rendered catalog extraction for regular products; treat limited availability as intentionally non-inventory.'
    },
    {
      url: 'https://www.abc.virginia.gov/products/limited-availability/limited-availability-faqs',
      label: 'Virginia ABC limited availability FAQ',
      type: 'policy_signal',
      text: 'Virginia ABC limited products are in-store purchase only; stores receive them as part of normal shipment, inventory will not show online before release, and associates cannot sell until notified.',
      nextRoute: 'Represent VA limited items as product-watch/policy signals, not store-inventory alerts. Alert users on list changes and barrel-pick pages instead.'
    },
    {
      url: 'https://www.abc.virginia.gov/products/limited-availability/barrel-picks',
      label: 'Virginia ABC barrel picks',
      type: 'official_search_index_signal',
      text: 'Virginia ABC has barrel-pick pages for limited production products available exclusively in Virginia.',
      nextRoute: 'Track barrel-pick page changes and product names as release intelligence.'
    }
  ],
  NH: [
    {
      url: 'https://www.liquorandwineoutlets.com/Product-List/Spirits-WHISKEY-BOURBONWHISKEY',
      label: 'NHLC bourbon whiskey category',
      type: 'official_search_index_signal',
      text: 'NH Liquor & Wine Outlets has a bourbon whiskey product-list category and product-list search pages; public index confirms special limited release category and limited release drawing pages.',
      nextRoute: 'Use browser-rendered category extraction or indexed product URLs; raw fetch gets 403.'
    },
    {
      url: 'https://www.liquorandwineoutlets.com/Limited-Release-Drawing',
      label: 'NHLC limited release drawing',
      type: 'release_calendar_signal',
      text: 'NHLC maintains a Limited Release Drawing page and related FAQs for rare spirits raffles/drawings.',
      nextRoute: 'Track drawing page, FAQ, and special limited release category for lottery/drop intelligence.'
    }
  ],
  ME: [
    {
      url: 'https://www.mainespirits.com/2026-limited-release-spirits-lottery',
      label: 'Maine Spirits 2026 limited release lottery',
      type: 'lottery_signal',
      text: 'Maine Spirits 2026 limited release lottery index mentions highly allocated spirits including Thomas H. Handy Rye Whiskey and George T. Stagg; BABLO/Maine Spirits sponsors the lottery.',
      nextRoute: 'Track annual lottery pages and official rules; parse bottle lists from browser-rendered page or search cache if WAF blocks raw fetch.'
    },
    {
      url: 'https://www.mainespirits.com/2026-limited-release-spirits-lottery-official-rules',
      label: 'Maine Spirits official lottery rules',
      type: 'policy_signal',
      text: 'Official lottery rules pages repeat bottle eligibility and sponsor details for limited release spirits.',
      nextRoute: 'Extract entrant dates, eligible bottles, and winner/pickup rules into readable signals.'
    }
  ],
  VT: [
    {
      url: 'https://www.802spirits.com/sites/spirits/files/documents/Pricing_Current_Sales.pdf',
      label: 'Vermont current sales pricing PDF',
      type: 'price_list_document_signal',
      text: '802Spirits pricing PDFs are indexed with bourbon rows including Redemption High Rye Bourbon, Vermont Ice Maple Bourbon, Wild Turkey Longbranch, Baker’s 7YR Bourbon, Bulleit Bourbon, and status/price fields.',
      nextRoute: 'Add PDF text extraction for current/next/full pricing reports and normalize bourbon rows into product/price signals.'
    },
    {
      url: 'https://www.802spirits.com/allocated-products',
      label: 'Vermont allocated products',
      type: 'allocated_policy_signal',
      text: '802Spirits has allocated-product guidance, rare spirits raffle, and product pricing reports; live agency availability is weak.',
      nextRoute: 'Track allocated guidance changes and pricing reports; present as catalog/allocated intelligence, not live inventory.'
    }
  ],
  MI: [
    {
      url: 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/lcc/Price-Book/2-1-26-RETAIL-PRICE-CHANGES-PDF.pdf',
      label: 'Michigan MLCC retail price changes PDF',
      type: 'price_book_document_signal',
      text: 'MLCC indexed retail price-change PDFs expose ADA code, brand, size, wholesale/retail pricing, and bourbon rows such as Penelope Four Grain, Yellowstone Special Fin Toasted, Bardstown Discovery, and Barrell Bourbon.',
      nextRoute: 'Add PDF extraction and current PDF discovery from the MLCC price-book page. Treat as product/price/new-item signal, not store inventory.'
    },
    {
      url: 'https://www.michigan.gov/lara/-/media/Project/Websites/lara/lcc/Price-Book/11-2-25-NEW-ITEM-PRICE-LIST-PDF.pdf',
      label: 'Michigan MLCC new item price list PDF',
      type: 'new_item_document_signal',
      text: 'MLCC publishes new item price-list PDFs for spirits. These are useful for detecting newly registered bourbons and pricing changes.',
      nextRoute: 'Discover latest dated price-book PDFs, extract text, normalize rows, and mark new/changed products.'
    }
  ],
  WV: [
    {
      url: 'https://abca.wv.gov/wv-bourbon-whiskey-barrel-picks-0',
      label: 'WV bourbon and whiskey barrel picks',
      type: 'barrel_pick_signal',
      text: 'WV ABCA barrel-pick page tracks latest barrel pick programs and 2025 selections. Search index mentions Whistle Pig Six Year single barrel rye and routine updates.',
      nextRoute: 'Track barrel-pick page changes and product names; WV public search has no strong store-inventory depth.'
    },
    {
      url: 'https://abca.wv.gov/page/spirits',
      label: 'WV ABCA spirits page',
      type: 'official_search_index_signal',
      text: 'WV ABCA spirits page links barrel picks and spirits forms. Product search appears public but may be brittle from server-side fetch.',
      nextRoute: 'Use browser or ASP.NET form emulation for liquorsearch.aspx; fall back to barrel-pick page for reliable public signals.'
    }
  ],
  MS: [
    {
      url: 'https://www.dor.ms.gov/abc/general-information-and-links-abc-vendors',
      label: 'Mississippi ABC vendor information',
      type: 'warehouse_policy_signal',
      text: 'Mississippi ABC vendor information describes registered products listed under bailment warehouse agreements; the vendor owns stock in the ABC Liquor Distribution Center until withdrawn from bailment for shipment to permitted retailers.',
      nextRoute: 'Treat MS as warehouse/policy intelligence until a public product/price file is found; monitor DOR ABC pages and FOIA/public-record options for product list.'
    },
    {
      url: 'https://www.mpbonline.org/blogs/news/spirits-remain-low-in-mississippi-as-backlog-continues-for-states-sole-alcohol-warehouse/',
      label: 'Mississippi public warehouse backlog reporting',
      type: 'context_signal',
      text: 'Public reporting says Mississippi DOR manages the state ABC warehouse and fulfillment delays affect spirits availability statewide.',
      nextRoute: 'Use only as contextual reliability metadata, not as bottle availability data.'
    }
  ]
};
