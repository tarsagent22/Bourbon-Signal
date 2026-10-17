# Artwork delivery to the installed scanner build

The iOS app active at 2026-10-17 13:36 UTC reported update `01a147d3-9180-7dd3-b0e4-616262539a5a`. EAS identifies it as scanner-preview, runtime `1.1.0-ios-scan-1`, source `0cf8d4d`. Earlier artwork OTAs targeted the older iap/play runtimes on production. Successful production manifests did not demonstrate delivery to this installed build.

This change adds reviewed retailer names for Weller Antique 107 Barrel Select, William Larue Weller Bourbon, Blade & Bow KY, BOOKERS BBN and Little Book Chapter. Special Reserve already matched the previous data; an additional punctuation variant is retained. The Infinite has distinct series artwork with no invented edition, proof, age or year. The producer distinguishes numbered editions: https://www.beamdistilling.com/littlebook/whiskies . Series artwork is explicitly captioned when opened in detail.

A refreshed diagnostic artifact from collector run 39035364498 was reconstructed with buildDrops. Its 9,849 rows contain 311 distinct ID/name combinations and 167 names. Before this change six names (eight rows) fell back; afterward none do. This is a collector reconstruction, not the authenticated member feed, and does not establish complete catalog coverage. The regression fixture records that boundary. All three literal names in the owner's screenshot are tested.

Release acceptance requires the current source on scanner-preview for scan runtimes and production for both runtime families. Device installation remains separate: inspect a subsequent mobile activity update ID or the phone itself; a manifest alone does not prove it installed.
