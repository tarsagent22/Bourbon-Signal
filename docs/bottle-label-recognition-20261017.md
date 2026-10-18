# Bottle label recognition follow-up — October 17, 2026

Owner examples: Penelope Riviera, Henry McKenna 10 Year Single Barrel,
and Buffalo Trace Bourbon. The supplied images are screenshots of the camera
screen; the automated regressions use their visible front-label text, not an
execution of Apple Vision against a physical bottle.

## Causes and resulting behavior

- Riviera was already present as `Penelope Riviera Cask Finish`. Requiring
  most catalog-name words rejected the shorter front-label identity, while a
  broad Penelope alias could outrank the expression. Cask/finish boilerplate is
  optional for retrieval, and multiple observed identity words outrank broad
  single-word aliases. A split `BUFF ALO` or `Mc KENNA` can be joined only when
  the result is an indexed identity token.
- The narrow bottle outline also defined the OCR crop. OCR now reads 92% of
  the visible viewport, including curved label edges and lower expression bands,
  at 1,200 pixels wide. The visual bottle outline stays in place.
- The scanner previously waited for two agreeing reads before showing anything,
  then could stop on generic brand matches. It now publishes the first useful
  candidates immediately. Brand-only reads keep scanning; two agreeing reads
  with expression evidence still hold results. Candidates survive blank reads.
- Every recognized family has a button to browse all its catalog expressions,
  beyond the six ranked suggestions. Selecting that button pauses scanning and
  displays all family entries. The same scanner serves Bottle Check, Post and
  My Shelf. Tests cover Penelope, Henry McKenna, Buffalo Trace, Old Forester,
  Woodford Reserve, Wild Turkey, Four Roses, Weller, Maker's Mark and E.H. Taylor.
- A partial or older successful API response retains expressions in the bundled
  catalog, with current API metadata taking precedence. New additions retain
  pending rarity and pricing rather than inventing reviewed facts.
- Missing text and unmatched text have different messages. Neither assumes that
  lighting or distance caused the failure. Explicit camera failures retain retry.
- Explicit ages, rye/bourbon distinctions, release years, and conflicting named
  batch/chapter numbers remain protected. Multiple recognized brands cannot
  automatically hold a specific expression.

## Producer-verified library additions

Six missing Penelope whiskey identities were added to shared online discovery
and the offline seed. They have no invented age, proof, price, rarity, or artwork.

| Expression | Producer reference |
| --- | --- |
| Madagascar | https://shop.penelopebourbon.com/products/madagascar |
| Cigar Sessions Chapter 02 | https://shop.penelopebourbon.com/products/cigar-sessions-chapter-02 |
| Estate Collection Conundrum Rye | https://penelopebourbon.com/estate-collection/ |
| Barrel Strength Bourbon | https://shop.penelopebourbon.com/products/barrel-strength |
| Serena & Lily | https://shop.penelopebourbon.com/collections/archive |
| Toasted Rye | https://shop.penelopebourbon.com/collections/archive |

The catalog now has 1,172 unique bottles. The audit retrieves all 1,172 by full
catalog name in search and label candidate matching. This does not establish
that every manufacturer's expression exists in the catalog. Family browsing
exposes every catalog entry for the recognized family, including when the exact
expression could not be read. Artwork remains a separate backlog: 946 exact
bundled illustrations and 226 entries without matching bundled artwork.

## Verification and limits

Scanner regressions cover the three owner examples, first-read candidates,
brand-to-expression refinement, all-family browsing, batch/chapter isolation,
and wider crop geometry. Catalog recovery tests cover missing API entries and
metadata precedence. Responsive tests run the actual scanner source at 320px
and 393px with simulated camera/OCR boundaries, including unknown text, empty
text, held results, rescan, and selection.

Local all-catalog candidate retrieval took 36 ms, excluding index creation,
capture and OCR. This is not a phone latency measurement. No native OCR module
or native dependency changes are required. Real-camera accuracy, physical-device
latency and installation/OTA acceptance require device verification.

Regenerating `drop-feed-classification.generated.json` also resolves the stale
generated-artifact failure on the existing PR's prior CI run. The existing
startup/artwork optimization scope is documented in
`app-optimization-20261017.md`.
