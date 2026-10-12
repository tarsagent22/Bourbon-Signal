# South Carolina coverage source review — October 12, 2026

This attempt reviewed the repository's 40 South Carolina retailer leads, the active collector configuration, current production coverage, and two public-source discovery passes. This is a bounded review of known leads, not a census of every retailer. Existing integrations were assessed as existing coverage, not new store gains. Historical directory and catalog claims were not treated as current inventory.

## Adopted source

Taste Liquors publishes a single Columbia pickup premise at 2722 N Lake Dr, SC 29212. Its current public product pages contain a matching LiquorStore identity and reviewed map coordinates, Product offer with explicit InStock status, positive USD price, matching heading and product ID, pickup availability, and an active product cart control. A bounded live probe returned four safe Bottle Bible matches: Van Winkle Special Reserve 12 Year, Eagle Rare 17 Year, William Larue Weller, and 1792 Small Batch. Prices are retailer prices, including high collector prices; no MSRP or shelf guarantee is claimed.

- [Storefront](https://tasteliquors.com/)
- [1792 Small Batch pickup page](https://tasteliquors.com/columbia-liquor-delivery/1792-small-batch-750ml.html)
- [Van Winkle 12 Year pickup page](https://tasteliquors.com/columbia-liquor-delivery/pappy-van-winkle-12yr.html)

The collector reads at most twelve product pages after one catalog request, with a delay between requests. It stops on authentication failures, access denial, and rate limiting. It never submits a cart, checkout, customer form, or order. Availability stays binary with zero unreported quantity; all source, store, product, price, stock, pickup, and timestamp bindings survive feed and alert projection. Unavailable, stale, mismatched, and incomplete evidence fails closed.

## Other current findings

- Palmetto Liquor's current site uses Santé. The public bourbon and wider spirits queries returned zero in-stock products. The older CityHive search pages cannot prove new stock on the new site.
- Bottles' confirmed ordering host is buy.shopbottles.com. Catalog and exact Mt Pleasant product requests returned HTTP 403. Search-indexed order controls were not promoted as current collector evidence.
- Tina's direct product request and Total Wine's selected-store page returned HTTP 403. No challenge bypass was attempted.
- Creekville's public catalog and current product pages were reachable. Its two pickup stores are independently named, but current product captures did not expose the per-store quantities shown in older search results. Aggregate Shopify variant availability cannot establish which store has stock.
- JK's Blacksburg Store API reported a uniform $1 price for all twenty reviewed bourbon search rows. This did not establish dependable consumer prices or orderability. Myrtle Beach's unadopted WooCommerce catalog returned zero-price products; its stock flags were not promoted.
- Oasis, Micky Finn's, Bill's current Beaufort site, Carolina Spirits, Kiawah, W.E. Willis, and Frugal's offered store information, promotions, or special orders without verified current bottle inventory in the reviewed surfaces. Bouharoun's and Owens' direct pages were access-blocked. Wholesale Sumter's public host returned 404.
- The historical ST Pitt Square lead resolves to Pittsburgh pickup instructions. It is not South Carolina store proof. The historical Park & Blow lead lacked a verified current ordering premise; a guessed URL's 404 was excluded from source-failure evidence.
- Remaining historical directory leads lacked current inventory proof in this review. Shipping advertisements, special-order promises, national catalogs, and producer store lists were excluded from exact-store inventory.

Raw captures, probe timestamps, request status codes, the live collector result, and their SHA-256 manifest are retained in ignored operator artifacts. The source has not fulfilled the request until the exact release is merged, refreshed in production, and its new store and customer-visible rows are verified.
The existing Mississippi byte-pinned shared operational reporter and state registry remain unchanged. Taste is an isolated child collector of the existing SC lane. Unbound historical change candidates are withheld; current source-bound customer drops retain their pickup proof.
