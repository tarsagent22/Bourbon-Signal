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
      url: 'https://www.dor.ms.gov/abc/sales-distribution/past-price-changes-spas',
      label: 'Mississippi ABC past price changes and SPAs',
      type: 'price_document_index_signal',
      text: 'Mississippi ABC publishes monthly SPA and bailment price-change PDFs under Past Price Changes & SPAs. This is the strongest public MS product/price-change route found so far, but it is not store inventory.',
      nextRoute: 'Add PDF text extraction for current SPA and bailment price-change PDFs, then normalize bourbon rows into catalog/price-watch signals.'
    },
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
  ],
  KY: [
    {
      url: 'https://abc.ky.gov/Licensing/Pages/default.aspx',
      label: 'Kentucky ABC active brands / licensing portal',
      type: 'active_brand_portal_signal',
      text: 'Kentucky ABC licensing portal exposes lookup surfaces including active brands registered in Kentucky. Public search did not reveal a consumer store inventory or allocation feed.',
      nextRoute: 'Investigate whether active-brand lookup can be queried/exported safely; treat as brand/catalog intelligence only until bottle rows are extracted.'
    },
    {
      url: 'https://abc.ky.gov/',
      label: 'Kentucky ABC public site',
      type: 'policy_signal',
      text: 'Kentucky ABC official public site is primarily licensing/enforcement/regulatory content; no official statewide bourbon inventory source found in this pass.',
      nextRoute: 'Monitor ABC site and public records for downloadable active-brand/product lists; avoid retailer scraping unless a permitted/public source is identified.'
    }
  ],
  TN: [
    {
      url: 'https://www.tn.gov/abc/public-information-and-forms.html',
      label: 'Tennessee ABC public information and forms',
      type: 'license_document_signal',
      text: 'Tennessee ABC publishes public information/forms and license-list PDFs including wholesalers, direct shippers, delivery services, and related regulated entities. This is useful market-source infrastructure, not bottle availability.',
      nextRoute: 'Track official license-list documents for source-discovery context; do not present as inventory unless an official public product/shipment feed appears.'
    },
    {
      url: 'https://www.tn.gov/abc.html',
      label: 'Tennessee ABC public site',
      type: 'policy_signal',
      text: 'Tennessee ABC official pages are licensing, public information, and regulatory guidance for a private retail market; no official bottle/store availability feed found.',
      nextRoute: 'Keep Tennessee as policy/source-discovery watch; revisit only if a state data portal, product registration export, or official public shipment feed appears.'
    }
  ],
  TX: [
    {
      url: 'https://comptroller.texas.gov/taxes/alcohol/',
      label: 'Texas Comptroller alcohol reporting',
      type: 'shipment_reporting_policy_signal',
      text: 'Texas Comptroller alcohol reporting describes monthly reporting of alcohol sales to retailers. This is source-discovery and market-context infrastructure, not public consumer bottle inventory.',
      nextRoute: 'Investigate whether any public aggregate reports or licensee-facing datasets can be safely extracted; keep out of inventory alerts.'
    },
    {
      url: 'https://specsonline.com/bourbonday2024/',
      label: "Spec's Bourbon Drop / rare-release event page",
      type: 'retailer_release_watch_signal',
      text: "Spec's publishes rare bourbon drop/event pages mentioning bottles such as Baker's Single Barrel, Bardstown single barrels, Holladay Soft Red Wheat, and Blanton's. Treat as retailer release-watch intelligence, not live shelf inventory.",
      nextRoute: "Track Spec's public event/drop pages and product pages for release dates and named bottles; only promote to inventory when store-specific availability rows are extracted."
    }
  ],
  SC: [
    {
      url: 'https://dor.sc.gov/alcohol-beverage-licensing-abl/liquor-licensing',
      label: 'South Carolina liquor licensing',
      type: 'policy_signal',
      text: 'South Carolina DOR ABL liquor licensing page describes tiers and licensing for liquor businesses. It is regulatory context, not consumer bottle availability.',
      nextRoute: 'Use as feasibility marker only; search for official licensee datasets or product registration exports before adding user-facing bottle signals.'
    }
  ],
  GA: [
    {
      url: 'https://dor.georgia.gov/brand-label-registration',
      label: 'Georgia brand and label registration',
      type: 'brand_registration_signal',
      text: 'Georgia DOR brand and label registration page explains approved brand label registration and points users to Georgia Tax Center brand registration search by license/wholesaler number. It is registration infrastructure, not consumer availability.',
      nextRoute: 'Investigate public Georgia Tax Center brand registration search and active license XLS to see whether approved bourbon brand rows can be extracted without login.'
    },
    {
      url: 'https://dor.georgia.gov/alcohol-shipment-reports',
      label: 'Georgia alcohol shipment reports',
      type: 'shipment_reporting_policy_signal',
      text: 'Georgia DOR alcohol shipment reports page provides filing instructions for shipment reports through the Georgia Tax Center. It does not expose public bottle-level shipment rows.',
      nextRoute: 'Investigate whether Georgia has a public licensee/shipment dataset; otherwise keep as policy/source-discovery context.'
    }
  ],
  FL: [
    {
      url: 'https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/quota-license-information/',
      label: 'Florida quota license information',
      type: 'license_lottery_policy_signal',
      text: 'Florida ABT quota license information covers license lottery/regulatory process. It is not a bourbon allocation or store inventory lottery.',
      nextRoute: 'Do not use quota-license lottery as product availability. Revisit Florida only if official ABT/product/shipment public data appears.'
    }
  ]
};
