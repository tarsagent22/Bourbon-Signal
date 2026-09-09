# Offline bottle-photo tooling

Scope: local inventory, validation, raster preparation and review sheets only.
No network calls, npm dependencies, sourcing, identity resolver, app changes or
publication. Data outputs are required to be outside the repository. Existing
pilot derivatives may be read in place; do not copy originals into the checkout.
No tool grants rights or performs human visual/identity review.

## Tests

From the repository root (Node built-ins; Python with Pillow already installed):

    node --test scripts/bottle-photos/inventory.test.mjs scripts/bottle-photos/validate.test.mjs
    C:/Users/chand/AppData/Local/hermes/tools/blender-pilot/Scripts/python.exe -B -m unittest discover -s scripts/bottle-photos -p test_prepare.py -v

Use quotes around paths containing spaces. -B suppresses bytecode artifacts.
Test approval records are artificial fixtures, never actual product permissions.

## Inventory

    node scripts/bottle-photos/inventory.mjs SNAPSHOT LEDGER SUMMARY UTC_TIMESTAMP [SEED]

All arguments are positional local file paths except UTC_TIMESTAMP, which is an
explicit real ISO UTC timestamp including milliseconds (YYYY-MM-DDTHH:mm:ss.sssZ).
It records the supplied snapshot's inventory capture time, NOT a fresh API fetch.
Exit 0 succeeds; exit 1 rejects malformed/incomplete input without replacing the
ledger. LEDGER is created or resumed in place. SUMMARY is a derived separate JSON
file. Paths must be distinct. Writes are atomic per file, not across both files;
if summary writing fails, regenerate it by rerunning the same command. One writer
only; take workspace backups before manual edits. No concurrent-writer locking.

SNAPSHOT: { total: integer, bottles: [{ id, canonicalName, ...exact metadata }] }.
Total must equal row count and unique ID count. Missing or duplicate IDs fail.
IDs must match [A-Za-z0-9][A-Za-z0-9._-]*; invalid tokens are rejected, not repaired.
Pagination continuation markers and nested pagination envelopes fail. This tool
cannot prove the upstream total was truthful: upstream must flatten/reconcile all
pages before saving input. Optional SEED is an array or { bottles: [...] }.
Seed-only and snapshot-only IDs are reported separately; neither is merged.

Ledger schemaVersion 1:
- snapshot: canonical SHA-256 (key-order and row-order independent), total,
  capturedAt. Repeating identical input preserves the capture timestamp.
- items: exactly one row per exact ID ever seen, sorted by ID.
- Each row retains the complete catalog object and its catalogHash, including
  exact name, producer, age/proof/finish/edition/year/size metadata when present.
  Missing constraints are not inferred. priority is tracked or normal based only
  on isSignalTracked. No member data or invented exposure ranking.
- status: unsearched, candidate_found, needs_identity_review, needs_permission,
  needs_processing, ready, published, no_verified_source. New rows are unsearched.
- present separates active records from retained tombstones. History records
  added/changed/removed/readded events and previous full catalog on changes.
- Status and extra private work fields are preserved on resume. Changed/readded
  records set sticky requiresReview; removed records are never dropped. A ready
  status is NOT publication eligibility after catalog changes. Parent reviewer
  must explicitly clear requiresReview and rebind approvals to the current hash.
- possibleDuplicateIds flags only matching lowercased alphanumeric full names.
  It is a review hint, not identity proof or exhaustive duplicate diagnosis.
  Annual/edition ambiguity is deliberately left for explicit identity review.
- summary counts active lifecycle statuses separately from retained removed work.
  Unknown status, corrupted catalog hash or missing stored rows fails resume.

## Private validation and public descriptor generation

    node scripts/bottle-photos/validate.mjs LEDGER PRIVATE_RECORDS PUBLIC_OUTPUT HOST[,HOST]

PRIVATE_RECORDS is an array of artwork records. PUBLIC_OUTPUT remains outside the
repo; this tool does not install it into app data. HOST is an explicit exact
lowercase first-party CDN DNS hostname, with no URL scheme, wildcards or ports.
No default CDN is invented. Exit 1 rejects the entire batch if any ready/published
record is invalid; it writes nothing, leaving any previous output untouched.
Callers MUST check exit status and must not consume an old output on failure.
Non-ready lifecycle records are withheld; unknown statuses fail. Empty valid
records produce {}. Multiple exact IDs can share one artwork only in one explicit
reviewed record; duplicate artwork IDs or conflicting ID mappings fail.

Each eligible record requires these fields (all dates in the timestamp format
above; SHA-256 values are 64 lowercase hexadecimal characters):

    status: ready or published
    artworkId: lowercase letters/digits/hyphens, 1..100 characters
    catalogIds: nonempty unique exact current IDs
    identity:
      disposition: approved
      reviewer, date
      scope: explicit product/edition/packaging constraints
      catalogHashes: { exact-id: current ledger catalogHash, ... }
      processedSha256: exact reviewed derivative hash
    rights:
      disposition: approved
      reviewer, date
      evidence: private license/permission evidence text or reference
      license: explicit license or permission description
      permitsRedistribution: true
      permitsDerivatives: true
      processedSha256: exact derivative covered by approval
    provenance:
      sourcePage, sourceAssetUrl: credential-free HTTPS DNS URLs
      publisher, downloadedAt
      assetType: photo or supplied_mockup
    originalSha256, processedSha256
    recipeVersion: rgba-pad-v1
    image:
      valid: true
      decoded: true
      format: PNG
      width: 400
      height: 600
      sha256: processedSha256
    visualReview:
      disposition: approved
      reviewer, date
      processedSha256
    publication:
      verified: true
      verifiedAt
      sha256: processedSha256
      url: https://EXPLICIT_FIRST_PARTY_HOST/.../PROCESSED_SHA256.png

Every mapped ledger row must also be ready/published, present and not marked
requiresReview. No matching via aliases, canonical keys, punctuation, old saved
IDs or custom names is performed; unmapped entries stay unmapped. Human scope
review, not this script, resolves exact edition/age/finish/proof and packaging.

The validator checks recorded attestations and hash consistency, NOT the truth
of permission documents or remote bytes. Parent must supply truthful decode,
visual review and actual publication readback evidence; offline code neither
fetches URLs nor authenticates reviewers. Source URLs are private and may contain
query strings; credentials and fragments are rejected. Publication URLs must
have no query, credentials or fragment and must use a content-hash filename.
IP literals, local/special host suffixes, malformed hosts and non-HTTPS URLs fail.
DNS resolution is intentionally not performed: this is not a safe downloader or
an SSRF guard for a future fetcher. Do not add fetching based on these checks.

Public output is ONLY an exact-ID-keyed registry of:

    { artworkId, revision: processedSha256, url, width: 400, height: 600 }

It never spreads private records. Source URLs, permissions, correspondence,
reviewers, catalog names, original hashes and local paths stay private.

## Prepare local rasters

    PYTHON -B scripts/bottle-photos/prepare.py SOURCE OUTPUT.png REPORT.json

Use the Pillow interpreter shown under Tests for PYTHON. Exit 0 means processed,
not approved. Exit 2 writes a manual_processing_required report for unsuitable
sources. Usage/I/O errors are nonzero. A failed run must not consume any previous
derivative at the output path. Source/output/report must be distinct.

Accept regular local PNG/JPEG/WebP files only; no URL, UNC, SVG, scripts, symlink,
animated/multiframe or corrupt input. Limits: 25 MiB compressed, 20 million pixels,
12,000 pixels per edge. Decompression warnings are errors and dimensions are
checked before decode. ICC-profiled/unsupported color modes require manual work.
Opaque sources (including white rectangles), empty alpha and very small visible
content are reported unsuitable, never auto-masked. A transparent pixel is not
proof of good segmentation: halos/white patches need human visual review.

Recipe rgba-pad-v1: apply EXIF orientation; crop only zero-alpha exterior; preserve
all nonzero-alpha pixels; downsize proportionally with Lanczos to fit 352x552,
never upscale; horizontally center with baseline y=576 on a transparent 400x600
RGBA canvas. Minimum visible content: shorter edge 32px, longer edge 96px. Integer
rounding may change ratio by less than one pixel. Preserve alpha without applying
it twice. No guessed white stripping, segmentation, halo trimming, label repaint,
AI, inpainting or optical-shape adjustment. Existing clipped input cannot be
repaired or reliably detected; cap/base/label review remains mandatory.

Output is metadata-free PNG at compress_level=9. Report contains original INPUT
hash (a pilot input is already a derivative, not the producer original), output
hash, geometry, Pillow version and recipe. Same source/recipe/Pillow produces the
same bytes. Existing identical output is not rewritten. Processing is recomputed
to verify bytes; there is no sidecar-trusting cache or cross-file dedupe service.
Changing Pillow/encoder can change bytes; rerun fixtures before accepting new
recipe assets. No format migration or new native codecs were introduced.

## Contact sheets

    PYTHON -B scripts/bottle-photos/contact_sheet.py MANIFEST.json SHEET.png REPORT.json

Manifest is an array of 1..50 unique { id, path, sourcePage } records with local
400x600 derivatives. Split larger batches explicitly. Output uses RGB (15,17,21)
dark background, five columns maximum, proportional previews, exact-ID labels
(truncated on image) and numbered source references. The private report retains
full IDs and source URLs. Sheet/report must stay outside the repo and must not
overwrite input. Every tile is UNREVIEWED; generating a sheet never approves it.
All images need visual inspection, with full-resolution exceptions reviewed
separately. Source references are copied, not visited or vouched for.

## Handoff boundaries

Real inventory and execution evidence belong in
C:/Users/chand/AppData/Local/hermes/workspace/bottle-photo-library/.
Six existing pilot PNGs are processing regression inputs only, NOT rights-cleared
originals. No approvals should be generated from their sources.json availability.
Parent owns actual-record diagnosis, licensing, source originals, reviewed
first-party hosting, app integration, release and device verification.
