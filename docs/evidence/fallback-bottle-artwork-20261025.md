# Bottle artwork audit — October 25, 2026

The screenshot's Buffalo Trace listing used the neutral bottle because its full retailer name was absent from the exact artwork registry. Five reviewed retailer-name mappings and an edition-specific Maker's Mark FAE-01 image restore all six unresolved names in the current feed reconstruction.

## Scope and evidence

- Public feed preview directly reproduced the Buffalo Trace, Woodford Sweet Oak, Maker's FAE-01 and Russell's Single Rickhouse gaps.
- Published refresh artifact `40185459545` was reconstructed using the engine's current canonicalization, drop export and public-evidence policy: 9,817 eligible rows, 234 ID/name combinations. Before the fix, six names affected 140 rows, including 126 Buffalo Trace rows; afterward all 234 identities resolve. This reconstruction is not an authenticated customer-feed export.
- The offline catalog contains 1,172 entries, including non-whiskey spirits and cocktails. Its before audit found 946 matches. Recently added owner records were checked through the public artwork endpoint; 21 returned 404. No member-submitted photos were used as public artwork.
- New images are original transparent illustrations generated with the built-in image tool from verified producer, regulator or exact packaging references. Prompts, reference URLs, review notes and immutable master/export hashes are retained in the artwork provenance files. They are illustrations, not manufacturer photographs.
- Retailer-name repairs are literal reviewed aliases. The resolver still preserves proof, age, finish, edition and stale-ID conflicts; no fuzzy brand-name matching or blanket availability-note stripping was added.

## Unresolved identities

The following entries retain their fallback until the exact expression can be established. A nearby brand or expression image would be misleading.

| Entry | Missing evidence |
| --- | --- |
| Balcones Texas Rye Single Barrel (CBS Pick) | NC's image verifies base Texas Rye packaging, but no exact CBS selection label was found. |
| Fiddler Georgia Heartwood Bourbon (Cramerton ABC Pick) | ASW verifies Heartwood, but not this pick's label, barrel or proof. Existing source research also marks it unresolved. |
| Rare Character Single Barrel Stateline Beverage Warehouse ELE-015 | Producer barrel information does not supply the exact ELE-015 selection label. |
| Old Charter Oak Finest Oak 2026 | Finest Oak packaging is verified, but the 2026 edition identity remains unsubstantiated. Existing source research notes this conflict. |
| J. T. S. Brown | Catalog entry specifies the brand without choosing the standard 80-proof or 100-proof Bottled-in-Bond expression. No expression is guessed. |

Mad River Double Tapped is a maple-and-bourbon cordial according to its source record. It and other non-whiskey products are excluded from new image generation. Midnight Moon's records describe moonshine without enough evidence to classify these entries as whiskey; no whiskey artwork was inferred from a catalog category.

## Verification boundaries

Shared mobile/web identity tests cover the observed feed and all added asset identities, immutable native/web PNG bytes, exact-name conflicts and nearby editions. The actual mobile artwork component is also rendered through React Native Web at 320, 390 and 768 pixels, checking loaded images and horizontal overflow. Browser rendering, build exports, server redirects and OTA manifests do not establish installation or visual acceptance on a physical phone.

## Prepared corrections

31 bottle identities corrected: 26 new labeled illustrations and five retailer-name mappings. The offline catalog increases from 946 to 971 artwork matches out of 1,172 entries. Its remaining 201 entries include the five unresolved whiskey identities above and entries outside the verified whiskey scope. All previously mapped asset hashes and names are preserved.

| Bottle | Change |
| --- | --- |
| 1792 Bottled in Bond | Reviewed retailer-name mapping |
| Russell's Reserve Single Rickhouse | Reviewed retailer-name mapping |
| Buffalo Trace Bourbon | Reviewed retailer-name mapping |
| Old Fitzgerald Bottled in Bond 10Y Spring 26 Decanter | Reviewed retailer-name mapping |
| Woodford Reserve Masters Coll. Sweet Oak | Reviewed retailer-name mapping |
| Georgia Moon | [New labeled illustration](../../public/bottle-artwork/5332e0e45b408677547166318a0ecedb96857d375c382b3948c0723b3f68a6dd.png) |
| High West The Prisoner's Share | [New labeled illustration](../../public/bottle-artwork/acb086d227bfabdd0aaac1981f192a557666d8a57c177ba44f86db061a3fd37c.png) |
| Maker's Mark Wood Finishing Series FAE-01 | [New labeled illustration](../../public/bottle-artwork/1062c16c36243c492ab803d7d9af5e893a395b42e63e0a9d69706f76cfd178a3.png) |
| Old Overholt 11 Year Cask Strength Rye (2024) | [New labeled illustration](../../public/bottle-artwork/ef419ef8223b47c16a40459a4f2ef27fd604b827a076bc3c6ca59dea5376cfe6.png) |
| Old Forester Single Barrel Barrel Strength Rye | [New labeled illustration](../../public/bottle-artwork/71ae4ae2689d2aaac22ac594c035c250a2cc8025028e4746c2f1fc1bc025f81d.png) |
| Old Soul Estate Collection No. 3 Sorghum Bourbon | [New labeled illustration](../../public/bottle-artwork/a90181d7c3ceee44647f2e6920a4b659747706e8c099cf7db546d3ff3f03afcb.png) |
| Duck Club High Brass Bourbon | [New labeled illustration](../../public/bottle-artwork/21afd4a19d1fd9a34878c2b7401762602748b115303a1007b334c58f7b7cc493.png) |
| Kings County Barrel Strength Empire Rye | [New labeled illustration](../../public/bottle-artwork/5cd220bad68ab1c6496ecfd4dae2f469bf794b4225c1a9deea5a55c6deb46b74.png) |
| Old Dominick 8 Year Reserve Bourbon Batch 2 | [New labeled illustration](../../public/bottle-artwork/bf4406bba1714e7ed4047f444e1d35819edcb288e09787b94c32d993782ea5cc.png) |
| Smooth Ambler Old Scout Bourbon | [New labeled illustration](../../public/bottle-artwork/2560f627a3a8d5167beaf4a5cd16825b3b4b35ebb41f07d17d5c6db0a0af9827.png) |
| Sagamore Cask Strength Rye | [New labeled illustration](../../public/bottle-artwork/40ffd287c28d917b6f26a194755e82fc91b46eb7998a57940245600857a9c6e0.png) |
| Jack Daniel's Gentleman Jack | [New labeled illustration](../../public/bottle-artwork/56be96f1ab4cc9775622c1057efd13cc12182b2c9eba54ea09f73aa599768ba1.png) |
| Mad River Burnt Rock Bourbon | [New labeled illustration](../../public/bottle-artwork/3b3788a0b875a8c40dd7fb31a99f6b94676bdbe2ad046baea978968098bb1479.png) |
| Dark Arts Toasted Mizunara Stave Finished Bourbon | [New labeled illustration](../../public/bottle-artwork/101bff4d4a2664c90099b32f5b7c59867409b4acd75c6c69b554d067d6cf3a21.png) |
| Driftless Glen Single Barrel Bourbon | [New labeled illustration](../../public/bottle-artwork/8721748e7d64618f68801ba3b6e5e272042bfcf278447f9e54db8dc6e0a08d84.png) |
| Mad River Straight Bourbon | [New labeled illustration](../../public/bottle-artwork/a80855fa0c3b836a5d2104856fd971a1861ed1907a84894ec3e22e2736232cc0.png) |
| Heaven Hill Grain to Glass Specialty Barrel Series Wheated Bourbon (Chinquapin Oak) | [New labeled illustration](../../public/bottle-artwork/d7894e80174e8084551bf5ad23b0d7de56f4c807c58c6465f4d4ef9cc3489952.png) |
| Maker's Mark Wood Finishing Series 2025 Keepers Release | [New labeled illustration](../../public/bottle-artwork/a14c388db771f115c10a5d5b3f28009cf53773378b688a48698c0744661b1c97.png) |
| Dark Arts Blunt Blend Volume 3 | [New labeled illustration](../../public/bottle-artwork/91d2f75ebc226b5ec717f8f57eafd8c2f6434c3a2249584fc83a57370a86dee7.png) |
| Green River Wheated Full Proof Bourbon | [New labeled illustration](../../public/bottle-artwork/77ec7971c652fe5e2500884bfa1e37dc4e3be486ed64155ed364f90eb171f52d.png) |
| Penelope Barrel Strength Bourbon | [New labeled illustration](../../public/bottle-artwork/d24370643863abb159090193eb0e1e3e591e848a4a768f4380b2b043a2df2554.png) |
| Penelope Cigar Sessions Chapter 02 | [New labeled illustration](../../public/bottle-artwork/06ee444f02ddf3d9c893a8640ee775b250f87d1e9ce26fbc3b4196360bc51589.png) |
| Penelope Estate Collection Conundrum Rye | [New labeled illustration](../../public/bottle-artwork/f180803ab70328bd9fefbeafb7ac0c57595a2cadef007c1664e90e86c27af5be.png) |
| Penelope Madagascar | [New labeled illustration](../../public/bottle-artwork/afddc764415d11c0caf90e9d834f566c8948a2b66474c0df6a77c6f110708b6f.png) |
| Penelope Serena & Lily | [New labeled illustration](../../public/bottle-artwork/60e119a769ad0a7baeed0a157b736be43c3836ffbc7a4df7f984608d05b4334a.png) |
| Penelope Toasted Rye | [New labeled illustration](../../public/bottle-artwork/013c08a99f8c3d59e4cbe8f58d66e514f543a5bb862a8834a3706daa9427a954.png) |

Native assets are saved under `apps/mobile/assets/bottles/labeled-v1/<sha256>.png`; identical web assets are saved under `public/bottle-artwork/<sha256>.png`. Complete prompts and references are in the `feed-provenance.json` and `library-provenance.json` files alongside native assets. The built-in image tool was used; no image API fallback was used. Individual single-barrel, proof-variable and annual-release illustrations show verified representative packaging; they do not establish the barrel/proof of an unspecified saved bottle.
