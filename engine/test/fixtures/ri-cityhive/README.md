# Rhode Island CityHive research receipt

The reviewed first-party merchant is Rhode Island Liquor Delivery, merchant `64f6226b7537422b95e04824`, at 342 Broad St, Providence, RI 02907, coordinates `41.8138408, -71.4212627`. Four detail captures observed on 2026-11-14 contain the exact merchant configuration and pickup offer plus positive 750 ml options. Full HTML is retained outside Git at `C:\Users\chand\projects\bs-kansas-new-premises-20261114\ri-*.html`.

Compact fixtures preserve merchant configuration/address/coordinates, first-party product and option IDs, product URLs, size, positive option quantity field, price, pickup offer, and identity attributes. They omit full descriptions, analytics, and unrelated page content.

| Product | Product / option | Price | Source quantity field | Raw capture SHA-256 |
|---|---|---:|---:|---|
| [Eagle Rare 10 Year](https://riliquordelivery.com/shop/product/eagle-rare-10-year-kentucky-straight-bourbon/5521cef16561310003020100?option-id=2019723d4bc388a1636a0e8333f6cab54fb3b7f582d026c6e3b19cb398a6e87c) | `5521cef16561310003020100` / `2019723d4bc388a1636a0e8333f6cab54fb3b7f582d026c6e3b19cb398a6e87c` | $69.99 | 18 | `95eec2028576c0f494ca9de2b670c7ba507aaf30a8964eda0f84bece676b0f3e` |
| [Stagg Jr.](https://riliquordelivery.com/shop/product/stagg-jr-kentucky-straight-bourbon-whiskey/56c28cb0756275139def0100?option-id=2551e19595a2b433409d02980b3f776e6818302352e0ee40538b4f77b782c479) | `56c28cb0756275139def0100` / `2551e19595a2b433409d02980b3f776e6818302352e0ee40538b4f77b782c479` | $129.99 | 1 | `2421ac28aabdbc770a2f182c3a693d62f97a4874687ff4d1d0810e3be44bcf6c` |
| [Larceny Barrel Proof](https://riliquordelivery.com/shop/product/larceny-barrel-proof-brourbon/5e21e94d0320ad0f80403af4?option-id=f7d916d860bc19fb3f5b76ba1490b98851104085bb9b3b7e9497c33d120bee85) | `5e21e94d0320ad0f80403af4` / `f7d916d860bc19fb3f5b76ba1490b98851104085bb9b3b7e9497c33d120bee85` | $79.99 | 1 | `c0d94b6f2f22db9b224f7e843c6cab35b329cd2f42e818d56398e8407425a311` |
| [Booker's Bourbon Small Batch](https://riliquordelivery.com/shop/product/bookers-bourbon-small-batch/56c26ed975627570b05d0100?option-id=c995b4fdc8ba7b69672fc35bb350ff04103268a32c642793b9fea3d47d307c95) | `56c26ed975627570b05d0100` / `c995b4fdc8ba7b69672fc35bb350ff04103268a32c642793b9fea3d47d307c95` | $99.99 | 12 | `0743fd378e713a8517d4d5c5bacc63ac5468313e2e11128271eb996ab2a11a1e` |

Two current merchant-scoped searches were each fetched once: `https://riliquordelivery.com/shop/?ch-query=eagle%20rare&merchant-id=64f6226b7537422b95e04824` returned Eagle Rare 10 at $69.99 and Larceny Barrel Proof at $79.99 marked `InStock`; `https://riliquordelivery.com/shop/?ch-query=stagg&merchant-id=64f6226b7537422b95e04824` returned Stagg Jr. at $129.99 marked `InStock`. Captures are outside Git at `%TEMP%\de-ri-search-eagle-rare.html` (SHA-256 `732a5bdffa3d3cd737012684ea2596c8d34af361784b8ebf5ea783d14dd4b5ba`) and `%TEMP%\de-ri-search-stagg.html` (SHA-256 `eeae5cfaf0170110ae032de2d9b045d01b6730bfa902d564a4aeb8ad9d8aed1c`).

The current full Bible identifies Eagle Rare 10 as allocated, Stagg as unicorn, Larceny Barrel Proof as limited, and Booker's Bourbon as limited. Stagg Jr. maps to canonical `Stagg` through a narrow reviewed product-ID rule gated by the exact title, 750 ml option, bourbon-only category, `Stagg Bourbon` brand, and 50–75% ABV. All parsed customer quantity remains zero/unknown even when the source's positive option count is recorded; this source is shadow-only and every customer delivery/alert flag is disabled.

## Additional verified Rhode Island premises

Two additional active CityHive sites were found and checked with one merchant-scoped `eagle rare` search and one exact product detail GET each. Their compact fixtures are separate stores in the same research-only RI registry:

| Store | Exact premises and merchant | Product evidence | Raw capture SHA-256 |
|---|---|---|---|
| Fifth Ward Liquor | 695 Thames St, Newport, RI 02840; `546babb03932330002100300`; `41.4734266, -71.3139191` | [Eagle Rare 10 Year](https://fifthwardliquor.com/shop/product/eagle-rare-10-year-kentucky-straight-bourbon/5521cef16561310003020100?option-id=2019723d4bc388a1636a0e8333f6cab54fb3b7f582d026c6e3b19cb398a6e87c), 750 ml, $75.99, option quantity field 6, `InStock`, `pick_up` offer | `4a42682bdc4f0b69b5e6887f14aa9abb7126fa4a7f7de3f36143232fffc78f7c` |
| California Liquors | 84 Union Ave, Providence, RI 02909; `6114919961187149b8241cdd`; `41.809196, -71.4383083` | [Eagle Rare 10 Year](https://californialiquorsri.com/shop/product/eagle-rare-10-year-kentucky-straight-bourbon/5521cef16561310003020100?option-id=2019723d4bc388a1636a0e8333f6cab54fb3b7f582d026c6e3b19cb398a6e87c), 750 ml, $72.00, option quantity field 8, `InStock`, `pick_up` offer | `56fab55080cb31a483753d784f48abcd58331c3e8bcba4cfd9c291a93a31565a` |

The full pages are outside Git at `%TEMP%\ri-lead-fifthwardliquor.com-eagle-detail.html` and `%TEMP%\ri-lead-californialiquorsri.com-eagle-detail.html`. Each page binds the product offer's exact address and option coordinates to its own active merchant configuration. Both exact searches returned the 750 ml Eagle Rare 10 option marked in stock before the detail request.
