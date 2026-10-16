# Labeled bottle artwork migration

Owner direction, October 15, 2026: preserve the existing rendered bottle style and restore the actual product labels wherever bottle artwork appears. This supersedes the earlier label-less direction.

This migration is **in progress and unreleased**. The first local batch has 11 inspected illustrations for 13 exact catalog records. The historical illustration catalog has 929 records; 916 still need labeled art. Existing owner-added artwork also needs a separate production inventory/review. No catalog-wide completion or installed-device acceptance is claimed.

## Visual acceptance

Every new render must receive both the current bottle illustration as its edit target and an actual image of the exact product as its label reference. Compare label outline, placement, scale, paper color, typography, main wording, neck treatment and seal directly against that image. Preserve the existing glass, silhouette, closure, lighting and framing. Do not invent an attractive substitute label. Main branding alone is insufficient. Do not infer one expression's label from another expression sharing the same glass.

The initial Blanton's candidate was rejected by the owner for its invented shield-shaped label. It was removed from the registry and project assets. Its replacement uses the actual wide horizontal parchment body band with handwriting, small neck branding, dark wax and pull tab. Variable writing depicts the reference bottle, not a member's physical bottle.

## Implementation

- `shared/labeled-bottle-artwork-registry.json` holds exact reviewed IDs/names and content hashes. Its resolver reuses the existing strict photo identity contract; lossy canonical keys cannot select art.
- `CellarBottleArtwork` prioritizes these illustrations across the shelf, showcase, feed, Community, onboarding and bottle details. Previously available artwork remains as the temporary fallback while the remaining catalog is prepared.
- `BottleArtworkImage` preserves the existing dimensions, detail animation, reduced-motion behavior and background pause for both old and new assets.
- The server's catalog photo helper prioritizes the same labeled registry. Public and bundled PNG bytes match. Existing photo-registry publication data remains unchanged.
- The daily submission workflow now looks for labeled artwork and requires actual label references for future generations.

## Preparation and remaining work

Use the built-in image-generation tool, one image per expression. Preserve every generated master locally. The current cumulative working manifest and generation records are in `.operator/`; the reviewed prompt/reference/hash records are saved with the exported artwork in `apps/mobile/assets/bottles/labeled-v1/provenance.json`.

After inspecting a cumulative manifest:

```powershell
node scripts/prepare-labeled-bottle-art.mjs .operator/labeled-art-manifest.json
npm run test:labeled-artwork
npm run artwork:labeled:audit
```

The exporter performs proportional PNG preparation only. It does not generate or redesign labels. It validates exact catalog identities, alpha, reviewed provenance and conflicting names before writing the bundled and public assets. The audit writes the remaining exact-product worklist to `.operator/labeled-artwork-backlog.json`, with current bottle-shape references. A shape reference alone does not verify a label.

Before claiming the requested catalog-wide rollout, `npm run artwork:labeled:complete` must pass, owner-added art must be reviewed, and the temporary label-free product fallback must be retired. Then run the required web/mobile release checks and publish through the single guarded release lane, with compatible OTA delivery. No native build is needed for this artwork change.
