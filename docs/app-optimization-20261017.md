# App loading, bottle library, and label recognition audit

Implementation baseline: `8d9cea3` (current `origin/main` when this work started).
Changes are prepared in `codex/app-performance-catalog-camera-20261017`. Publication
and physical-device acceptance are separate from the local evidence below.

## Loading changes

| Area | Change |
| --- | --- |
| Boot | Account routing starts while the bundled font loads behind the native splash. |
| Home | Saved feed preferences no longer wait for a network profile response. New members still receive their profile home state. |
| Shared API | Successful time-zone writes now pass response validation and preserve navigation reads. Previously the successful write was reported as invalid and retried. |
| Every artwork surface | Shared maps replace repeated full-registry and catalog scans while preserving exact names, edition collisions, and stale-ID rejection. |
| Bottle pickers | Search indexes are shared by immutable catalog snapshot. Token arrays are reused and the last 64 queries are cached. Returned result arrays remain independent. |
| Feed, shelf, search | Static thumbnails no longer allocate animation state, animated wrappers, or effects. Detail artwork retains reduced-motion-aware animation. |
| My Shelf | Initial and subsequent rendering batches and the virtualization window are bounded for both grid and list views. |

One local full-library pass before/after the changes:

| Operation | Before: 1,156 entries | After: 1,166 entries |
| --- | ---: | ---: |
| Search every full name | 2,001 ms | 275 ms |
| Retrieve candidates for every full label name | 3,449 ms | 34 ms |
| Resolve every artwork identity | 1,250 ms | 5 ms |

These are single-run JavaScript processing measurements on the same Windows host,
not phone boot times, network response times, frame rates, or camera OCR accuracy.

## Library audit

The public production catalog and bundled catalog both started at 1,156 entries.
Ten already reviewed feed editions had exact labeled artwork but were absent from
library search. They are now included in the server catalog and offline seed.
An older API cannot remove these additions when a new app refreshes its picker.
Pricing, scarcity, proof, and age are not invented for the new discovery records.

The offline catalog now has **1,166 unique IDs**, all retrievable by name in search
and by full label text in scanner candidate retrieval. **946 entries have matching
bundled labeled artwork**, up from 932. This includes ten existing edition images
newly exposed in search and four newly rendered common rye illustrations.

**220 entries still lack matching bundled artwork.** The complete list is saved in
[app-library-audit-20261017.json](app-library-audit-20261017.json). It includes
non-whiskey inventory imports, broad or ambiguous product names, and owner-added
expressions and store picks. Existing category metadata is not sufficient to
classify these reliably: for example, some liqueurs are tagged American whiskey.
They retain an honest fallback pending exact product/package verification. Owner
entries can additionally resolve independently reviewed artwork through the
existing public artwork endpoint; that is not counted as bundled coverage.

The audit also exposes an existing conflict: `Rebel 100 6Y Bottled in Bond Single
Barrel` carries an ageStatement of `010Y`. Neither catalog fact was silently
rewritten. Candidate retrieval uses the explicit expression name first, and the
conflict remains listed for source review.

### Search surfaces

| Surface | Catalog and artwork behavior |
| --- | --- |
| Bottle Check | Full shared catalog, local ranking, exact artwork, scanner candidates. |
| Scan for Post / Scan to Shelf | Same library, ranking and artwork; selection returns to the original form. |
| Post composer | Full shared catalog; search results now show matching thumbnails. |
| Add to My Shelf | Full shared catalog; search and recent results now show matching thumbnails. |
| Radar watch search | Full shared catalog with matching thumbnails. |
| Muted-bottle search | Receives the same shared ranking function; matching thumbnails in search and saved results. |
| Setup | Full shared catalog with matching thumbnails. |
| Onboarding favorites and watches | Full shared catalog; bottle choices now include matching thumbnails. |
| Owner catalog selection, catalog and pricing searches | Server catalog retains the new editions; exact artwork renderer added to result cards. Pricing search remains scoped to its pricing records. |
| Home search / My Shelf search | Search their reports or saved collection respectively; these are intentionally different from full-library pickers. Their bottle images use the same exact resolver. |

### Source and image provenance

Discovery entries and primary reference URLs are in
[library-discovery-bottles.json](../shared/library-discovery-bottles.json).
New illustrations are Wild Turkey 101 Rye, Wild Turkey Rare Breed Rye, New Riff
Bottled-in-Bond Rye, and Green River Kentucky Straight Rye. Each was generated
separately with the built-in image tool, compared visually with its producer
reference, exported as a 400x600 transparent PNG, and assigned an exact identity.
The native and web PNGs have matching SHA-256 hashes.

Final paths and full prompt set are recorded in
[library-provenance.json](../apps/mobile/assets/bottles/labeled-v1/library-provenance.json),
[labeled-library-bottles.json](../shared/labeled-library-bottles.json), and the
[native asset map](../apps/mobile/src/components/labeled-artwork-assets.ts).
`prepare-labeled-bottle-art.mjs` retains these assets during future rebuilds.

## Camera and recognition

Label names, token postings, expression constraints, and bounded OCR correction
keys are prepared once per catalog snapshot. Punctuated initials and compact age
notation normalize consistently. One spelling error in a long word can be
corrected when another meaningful word matches exactly; ages, numeric brand
names, and edition years are never fuzzily corrected. Conflicting ages, rye vs.
bourbon expressions, and explicitly different release years remain excluded.

The camera reads at most one frame at a time. The between-frame wait is 900 ms
instead of 1,800 ms, with two agreeing reads still required. Supported cameras
choose a moderate sensor size with at least 1,500 pixels on the short side;
unsupported size lists retain the platform default. Captures retain orientation
processing, and the cropped label uses less JPEG compression. Capture stops once
results are saved, on blur, and in the background. Temporary frames are deleted.
No photos are uploaded for label recognition.

Full-name retrieval is **not** a claim that every physical label can be recognized.
Blur, lighting, curved labels, packaging changes, and hidden edition details still
require device validation and user confirmation. The reviewed barcode mapping
remains empty; unknown UPCs do not invent bottle identities. Older installed
binaries without the scanner modules retain their search fallback.

## Verification

Mobile typecheck, the mobile regression suites, Home browsing/cache tests, server
loading/catalog/profile tests, exact artwork/hash tests, and owner workspace tests
were exercised. Android and iOS JavaScript exports were built. Browser fixtures
exercise the actual scanner source and navigation with simulated camera/OCR,
including 320px and 393px scan/search, close, draft preservation, and form return.
Their screenshots were inspected.

No physical-device launch time, all-screen navigation timing, real-camera OCR,
TestFlight/native-build installation, or production OTA acceptance is claimed.

Repeat the library audit with:

```powershell
npm run audit:app-library -- --require-search --require-label --report .operator/library-audit.json
```
