# Labeled bottle artwork migration

Owner direction, October 15, 2026: preserve the existing rendered bottle style and restore the actual product labels wherever bottle artwork appears. This supersedes the earlier label-less direction.

The local migration is complete: **932 product identities use 792 reviewed labeled illustrations**, covering 929 historical illustration records and three public owner-added bottles. Current counts are recorded in `labeled-bottle-artwork-status.json` by the coverage audit. Release verification is tracked separately; local completion does not establish installed-device acceptance.

## Visual acceptance

Use the current bottle illustration as the edit target and authentic product packaging as the label reference. Compare label outline, placement, scale, paper color, typography, main wording, neck treatment and seal directly against that image. Preserve the existing glass, silhouette, closure, lighting and framing. Do not invent an attractive substitute label. Main branding alone is insufficient. Do not infer one expression's label from another expression sharing the same glass.

Generic family entries use a documented authentic representative release without changing catalog facts. Dry Fly Dawn Till Dusk retains its existing representative-packaging disclosure. Two Rare Character selection entries use the authentic Single Barrel Series label template with unknown selection, proof, age and finish fields blank; Brook Hill Pear uses authentic 13-year rye family packaging, and Travelers Club uses its documented vintage label on the existing PET form. Detail captions disclose these selection/vintage differences. Proof-only packaging derivatives are explicitly identified in provenance; they are not claimed to be exact photographed selections.

The initial Blanton's candidate was rejected by the owner for its invented shield-shaped label. It was removed from the registry and project assets. Its replacement uses the actual wide horizontal parchment body band with handwriting, small neck branding, dark wax and pull tab. Variable writing depicts the reference bottle, not a member's physical bottle.

## Implementation

- `shared/labeled-bottle-artwork-registry.json` holds exact reviewed IDs/names and content hashes. Its resolver reuses the existing strict photo identity contract; lossy canonical keys cannot select art.
- `CellarBottleArtwork` uses these illustrations across the shelf, showcase, feed, Community, onboarding and bottle details. The former product artwork fallback is retired. Unknown identities receive a neutral labeled bottle without guessed brand imagery.
- `BottleArtworkImage` preserves the existing dimensions, detail animation, reduced-motion behavior and background pause.
- The server's catalog photo helper prioritizes the same labeled registry. Public and bundled PNG bytes match. Existing photo-registry publication data remains unchanged.
- The daily submission workflow now looks for labeled artwork and requires actual label references for future generations.

## Preparation and validation

Use the built-in image-generation tool, one image per expression. Preserve every generated master locally. The current cumulative working manifest and generation records are in `.operator/`; the reviewed prompt/reference/hash records are saved with the exported artwork in `apps/mobile/assets/bottles/labeled-v1/provenance.json`.

`review-labeled-artwork.mjs` makes comparison sheets for visual review only. `accept-labeled-artwork.mjs` accepts only explicitly reviewed candidates, copies full masters into this workspace and updates the cumulative manifest. The three public owner bottle identities are projected without member data in `shared/labeled-owner-bottles.json`; production inventory/version details and credentials remain ignored local files. The public artwork endpoint checks the current owner bottle name before redirecting to a reviewed labeled image, so a changed identity cannot inherit stale labels.

After inspecting a cumulative manifest:

```powershell
node scripts/prepare-labeled-bottle-art.mjs .operator/labeled-art-manifest.json
npm run test:labeled-artwork
npm run artwork:labeled:audit
```

The exporter performs proportional PNG preparation only. It does not generate or redesign labels. It validates exact catalog identities, alpha, reviewed provenance and conflicting names before writing the bundled and public assets. The audit writes the remaining exact-product worklist to `.operator/labeled-artwork-backlog.json`, with current bottle-shape references. A shape reference alone does not verify a label.

`npm run artwork:labeled:complete` passes with zero remaining records. All three public owner images are reviewed, and the former product fallback is retired. Required web/mobile checks and release publication use the single guarded release lane, with compatible OTA delivery. No native build is needed for this artwork change.
