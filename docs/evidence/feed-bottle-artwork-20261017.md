# Remaining feed artwork gaps

The previous name-matching release fixed the first screenshot and a saved sample. A wider collector audit found additional retailer wording, package separators, store picks and edition-specific labels that were absent from the reviewed registry.

The audit input is the collector artifact from successful refresh run `39032191006`, which published snapshot `2026-10-17T12-28-13-975Z-f073026c96803dd3`. Identities were reconstructed from its state signals with the engine's `buildDrops` and the app's drop/signal normalization. This is a collector-derived audit, including retained records; its listing counts are not a count of a member's filtered, paginated live API response.

| Audit scope | Before: unmatched names | After: unmatched names |
| --- | ---: | ---: |
| Fresh eligible collector rows | 63 (345 projected rows) | 0 |
| Eligible rows including retained records | 68 (436 projected rows) | 0 |
| Entire identity fixture | 299 ID/name combinations, 160 names | 0 |

All nine feed-specific identities are declared in `shared/labeled-feed-bottles.json`. Seven new transparent illustrations cover Barrell batches 032/036/037, Woodford Batch Proof 121.2, Woodford Madeira 2024, Maker's Cellar Aged 2026 and Elijah Craig Private Barrel Barrel Proof. Existing artwork was inspected before reusing the exact Barrell 034 and Woodford 119.5 labels. Private Barrel artwork leaves proof, age and barrel-number fields blank because individual selections differ; the detail caption makes this clear.

Producer identity references:

- [Barrell previous bourbon batches](https://www.barrellbourbon.com/bourbonbatches)
- [Woodford Batch Proof](https://www.woodfordreserve.com/whiskey/batch-proof/)
- [Woodford official spirits shop, including 121.2](https://shop.woodfordreserve.com/spirits)
- [Woodford Madeira Cask Finish](https://www.woodfordreserve.com/whiskey/masters-collection/)
- [Maker's Mark Cellar Aged 2026](https://www.makersmark.com/en-us/bourbons/makers-mark-cellar-aged)
- [Elijah Craig Barrel Proof product family](https://elijahcraig.com/barrel-proof)

Generation and review records, including the prompt set, are in `apps/mobile/assets/bottles/labeled-v1/feed-provenance.json`. Images were created with the built-in image generation tool using the existing labeled art as the style reference, visually inspected, and exported to identical native/web 400×600 RGBA PNGs. These are illustrations, with approximate microprint.

`npm run artwork:feed:audit -- --input <signals-or-drops.json> --require-complete` checks a new feed export without inheriting search aliases or dropping ages, proofs, finishes or batch numbers. With no input it checks the committed collector identity fixture. The labeled-artwork test suite also checks every fixture identity on the mobile and web paths and rejects conflicting editions.

The registry now has 941 identities and 799 illustrations. Source/test/export evidence does not establish installation or visual acceptance on a physical device. Production delivery is recorded separately in the release evidence.
