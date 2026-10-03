# My Shelf collector showcase

The top of My Shelf now presents three named highlights on one slim wood ledge, with a charcoal background and faint amber glow. The cabinet frame, marble backdrop and two crowded rows are removed. The collection cards, ratings, search, filters and statistics are unchanged.

Top rated uses valid personal ratings on owned entries, including a valid zero. Recently added uses the original acquisition timestamp and includes unrated owned entries. Buy again uses the existing explicit Would buy again preference; the app has no separate favorites flag. Exact bottle identities deduplicate without collapsing editions. Each mode shows at most three entries and has a helpful empty state. Bottle images and names open the existing detail editor. Existing account-saved finishes now apply to the ledge.

The showcase uses larger static original artwork and a presentation offset that aligns the transparent exports with the ledge. Grid, list and animated detail artwork retain their existing sizes and behavior. Headings, controls and names flow with text size rather than using measured absolute cabinet coordinates.

Validation: full mobile verification passed, including TypeScript, 334 mobile tests, 35 Astra checks, security and startup recovery, reviewed artwork hashes, release readiness and both platform exports. Local React Native Web preview of the actual component verified 320px and 390px layouts, a 1.5x text-metric simulation, highlight switching and the exact bottle detail callback. Native host-adapter tests exercise the real component's selections, empty states, larger artwork and single ledge. Physical iPhone acceptance remains separate.

Owner authorized implementation and production iOS OTA publication. Release follows the sole active release lane after the concurrent artwork release clears.
