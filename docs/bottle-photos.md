# Reviewed bottle photos

This is an additive public catalog presentation path, not collection data or a sourcing crawler.

- `public/bottle-photos/registry.v1.json`: versioned public wire schema; revision is SHA-256 of the ordered entries JSON.
- `public/bottle-photos/<sha256>.png`: immutable 400x600 RGBA cutouts. Do not replace/remove older hash paths while installed metadata caches may reference them.
- `apps/mobile/src/bottle-photos/registry.ts`: shared, dependency-free exact resolver/schema used by native and `src/lib/bottle-photos.ts`.
- Catalog objects and `/api/bottle-catalog` expose optional `photo`; native independently demand-fetches the small public registry, not the whole catalog or an OTA-bundled photo map.

FIRST50 contains 50 reviewed catalog records and 45 image hashes. Wave02 adds 39 exact catalog IDs and 36 hashes; wave03 adds 100 IDs and 100 hashes; wave04 adds 44 IDs and 44 hashes. Wave05 requested 100 whiskey-only catalog IDs. Independent exact-identity review removed 35 conflicting variants across the initial and bounded post-removal audits, leaving 65 identity survivors and 65 additional hashes. The unreleased staging registry therefore contains 298 mappings and 290 distinct immutable assets; all surviving wave05 rows are explicitly classified as whiskey. The post-removal manifest still received a top-level failed verdict before those last 11 removals, so this survivor staging set is not a cleanly audited completion batch and must not be released. Existing mappings and immutable asset bytes remain frozen and are verified cumulatively. Images are sourced product assets, not guaranteed camera photography; redistribution rights remain unverified and owner-deferred in the private audit.

## Identity

Only exact catalog IDs or reviewed exact display names select photos. Name comparison permits case/whitespace/curly apostrophe differences, not dropped ages, reordered words, proof or finish changes, fuzzy search or catalog alias arrays. The explicit `Eagle Rare 10Y` → `Eagle Rare 10 Year` alias is publication data, not generic age normalization.

A present name must agree with a known ID. The optional known-catalog argument rejects known unrepresented editions too. Mobile supplies its existing seed (exact ID/name only), including the explicit legacy `bible-` namespace. Unknown saved hashed IDs can resolve by reviewed name; an opaque unknown ID alone cannot prove or contradict an edition. Lossy server canonical keys never select a registry photo. Multiple exact names can share a reviewed image; conflicting hashes for the same name are rejected at staging and suppressed at runtime.

The sanitized 17-record regression fixture is test-only, never public registry/account metadata. Wave02 adds exact matches for Russell's Reserve Single Barrel and the full catalog name Jack Daniel's 12 Year Tennessee Whiskey. The fixture's shorter Jack Daniel's 12 Year name remains unapproved and falls back; E.H. Taylor Jr. Barrel Proof Bourbon remains excluded. Do not invent either mapping.

## Native delivery

One lazy metadata request per app instance (including failed attempts), coalesced across all mounted cards. Revalidate on next app launch, persist only validated public metadata, and retain cached metadata for offline/HTTP/JSON/schema/timeout failures. New web registry batches require no OTA after this client integration is installed. Fetches omit credentials and disallow redirects; HTTPS origin is fixed to `https://www.bourbonsignal.com`. Asset URLs are derived only from lowercase SHA-256 values.

This main lane has no AsyncStorage or expo-image dependency. Its adapter uses the already-installed `expo-file-system` File API in the document directory. The small getItem/setItem interface can use an existing AsyncStorage implementation in a compatible lane without changing cache policy. React Native Image loads only mounted demand images using `force-cache` and immutable HTTP caching. No prefetch of 50 images, dependency/lockfile/native configuration changes, or large metadata in SecureStore.

Image failures fall back to the unchanged six static pilots when identity permits, otherwise the existing neutral silhouette. OS-managed image caches can be evicted; offline availability of all remote photos is not guaranteed. Registry cache failures must not affect inventory or navigation. The first mount can show fallback while the bounded metadata request resolves.

## Local staging, never release

After exact catalog/label/visual review against final hashes:

    npx --no-install tsx scripts/stage-bottle-photos.mts <private-manifest.json> <private-audit-outside-repo.json>

The manifest must contain the cumulative approved records for the desired registry. Use the current catalog when extending it. This bounded tool validates each exact ID/name against the catalog seed, final file hash, RGBA alpha/padding/dimensions/bytes, identity/visual review attestations, and honest rights fields before writing anything. Only the public allowlisted projection and immutable PNGs enter public output. It never downloads, uploads, purchases, contacts publishers or releases.

`rightsStatus: unverified` and `ownerDeferredLicensing: true` are separate private facts. Deferral is NOT permission, and this tool refuses invented `cleared` status. Keep the original provenance and review evidence private; the emitted audit remains outside the repository. Broader rights-cleared workflows need separate actual permission evidence, not a boolean rename.

## Verification

    npm run test:bottle-photos
    npm run test:bottle-check-suggestions
    npm --prefix apps/mobile run verify
    npm run build

The photo tests are included in canonical root catalog and mobile suites. Main's exact-lockfile installation needs its existing mobile postinstall if `npm ci --ignore-scripts` was used.

Release owner must independently review the frozen diff, run full CI, ship the web registry/assets and compatible iOS client, and verify production custom-domain hashes/served bundle. Component/browser evidence is not physical-iPhone proof. No release is performed by the staging tool.
