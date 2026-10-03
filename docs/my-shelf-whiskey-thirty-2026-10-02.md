# My Shelf next thirty whiskey entries

This batch adds 30 exact bourbon/whiskey mappings, using 26 new original illustrations generated with built-in ImageGen and four verified reuses. Every candidate was reviewed against an exact NC ABC bottle photograph. PET traveler bottles, opaque black glass, wood stoppers, colored metal capsules and wax closures retain their actual forms. Printed labels, tags and brand embossing are removed. Brook Hill received one refinement to remove a pale neck band.

The fourth batch is preserved. This fifth batch brings exact mapping coverage from 863 to 893, with 37 entries left on the tracked worklist. Ambiguous generic names, unusual decanters and non-whiskey references remain pending or excluded. No neutral placeholder is counted as completed artwork.

The fifth catalog records source URLs and reference hashes for each physical form, including the four reused mappings. Provenance records generation prompts, master/export hashes and Brook Hill's refinement. Masters and prompts are retained in the owner workspace under art-next-thirty-masters and art-next-thirty-jobs.json. App PNG exports are proportional lossless RGBA files no larger than 540 by 810 pixels.

Validation covers exact ID/name resolution, mismatched custom-edition rejection, thirty unique catalog entries, the blue Rebel closure and four Rare Character closure colors, source evidence, registered assets and transparent export hashes. Existing fallback and original-only behavior remain unchanged. Full catalog completion and physical-device acceptance remain separate.

Validation: full mobile verify passed, including dependency/security checks, recovery checks, exact reviewed-artwork coverage and hashes, TypeScript, mobile regressions, readiness and both platform exports. Twenty-nine targeted artwork tests and seven pipeline regression tests passed. git diff --check passed.

Release dependency repair: the freshly reviewed GHSA-vfj7-8cjw-p6xm affects braces through 3.0.3 with no upstream fixed release. Root and mobile dependencies use an explicit local 3.0.4-bs.1 backport. Parsing rejects excessive nesting; compile, expand and stringify validate caller-supplied AST depth/cycles iteratively before any recursive walk. Five regressions cover normal Metro/ESLint patterns, deeply nested strings, direct AST APIs, cycles and an isolated-process exploit. The audit workflow verifies installed hashes and queries the published 3.0.3 base on every run, accepting only this specifically fixed advisory and rejecting any new unaddressed advisory. The all-lockfile moderate-or-higher audit remains enabled. No native dependency, Expo SDK or application runtime changed.

Post-repair validation: both fresh locked audits reported zero vulnerabilities; the backport checker passed in root and mobile; 19 scoped security/release contracts passed; the web production build and full mobile verification including both exports passed again.
