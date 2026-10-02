# Label-free artwork batch 3

This batch adds 22 reviewed product forms and one neutral fallback. Its 97 exact catalog entries bring reviewed coverage to 172 entries across 37 product forms. The neutral form is an illustration for unreviewed entries and does not claim to depict their actual packaging.

My Shelf uses these original illustrations in its cabinet, grid, list and owned-bottle editor. It no longer fetches catalog photos or bundles the six historical photo pilots through its artwork component. Product names remain visible; shared geometry does not identify age, proof or edition.

The reference photographs were used for geometry review only. ImageGen produced new label-free renderings with the existing approved artwork as the style reference. Generated masters were visually reviewed for shape, closure, framing and absent labels. Preparation performs only proportional downsampling and lossless PNG encoding. Generation prompts, reference hashes, master hashes and export hashes are recorded in provenance.json. This is production evidence, not a representation of legal clearance or Apple approval.

## Repeatable workflow

1. Review catalog IDs and physical forms, grouping only matching geometry. Distinct closures and unusual editions stay separate or excluded. Add exact reviewed names and intentional aliases to a batch catalog; never import broad catalog aliases.
2. Generate one transparent master per new shape using the recorded style and geometry prompts. Review the artwork before export. Keep masters and generation jobs outside the app bundle.
3. Run `python scripts/prepare-label-free-art.py --jobs JOBS.json --masters DIR --batch N` with Python and Pillow. Unchanged approved master/export hashes reuse the existing PNG. The script generates both Metro asset registrations and catalog imports for every batch.
4. When only reviewed mappings change, run `python scripts/prepare-label-free-art.py --register-only`. Registration rejects stale catalog names, duplicate IDs, conflicting aliases, duplicate shapes and altered export hashes.
5. Run `python scripts/test-label-free-art-pipeline.py`, `npm run verify` and the normal release lane. Check production OTA manifest hashes against every bundled illustration after publishing.

Batch 3 exports total 4,370,906 bytes. All 23 exports were reused on the repeat preparation run. Existing detail motion pauses in the background and honors Reduce Motion; collection cards and cabinet artwork remain static.
