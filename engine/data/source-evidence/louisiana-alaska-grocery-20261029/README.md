# Louisiana and Alaska grocery preparation

This is local source research, not production coverage or promotion evidence.
Neither state is active and neither is wired into an engine collection path.
No shadow, canary, authenticated customer-session or delivery pass is claimed.

The 2026-10-29 sweep used the current 1,177-entry app catalog, digest
`4b0c4224cb1c22a05fe7a9106f5d4b86162f581e1140b0004dc8b59d74e5aa2c`.
It made 80 bounded resolver/product requests and 35 local-page requests without
a retailer access denial. Every frozen premise has a matching first-party store
ID, banner, resolver domain, street/city/state/ZIP, local page and coordinates.
The Girdwood prospect 1839 returned a local-page 404 and is excluded.

| State | Reviewed premises | Premises with app-scarce rows | Conservative hunting premises | Hunting listings |
| --- | ---: | ---: | ---: | ---: |
| Louisiana | 15 | 15 | 14 | 37 |
| Alaska | 19 | 18 | 11 | 16 |

Louisiana expressions include E.H. Taylor Barrel Proof, Weller Full Proof,
Weller 12 Year, Eagle Rare 10 Year, E.H. Taylor Small Batch, Booker's and Old
Fitzgerald 7 Year Bottled in Bond. Alaska's conservative subset contains Eagle
Rare 10 Year and E.H. Taylor Small Batch. These are retailer-reported binary
in-store signals: quantities are zero with a non-exact interpretation. The
retailer titles themselves warn that limited quantities may be available in
store. No exact count, guaranteed stock, edition or batch is inferred.

The larger technical app-scarce totals are 84 Louisiana and 43 Alaska listings.
They include ordinary bottles classified as limited in the current library and
must not replace the conservative hunting counts above. Crown Royal Chocolate,
Penelope Four Grain and ordinary rye are not hunting gains. A broad library
alias mapping generic Wild Turkey Kentucky to Wild Turkey Master is explicitly
excluded from all eligibility counts in this cohort.

`captures.json` pins each original response's status, source clock and SHA-256;
raw bodies remain at the named local capture root in this retained worktree.
`geography.json` and `premises.json` retain exact address/coordinate bindings.
`product-proof.json` retains captured product/store/channel metadata. The
fixture is a labeled subset, not a fabricated complete source response. Source
proof ages from its original receipt time and must be recollected for promotion.

Government licensing lookups are supplementary and incomplete. The Louisiana
ATC homepage returned HTTP 403 and was not retried. Alaska's active-license XLSX
download failed; its response status was not retained and it was not retried.
An Anchorage municipal 2025-2026 package-store renewal for license 795 identifies
Oaken Keg 0720 at 2920 Seward Highway, matching one frozen premise. This is not
blanket certification that all premises have current government license records.
Current independent first-party premises/product/channel evidence is retained
under the same research standard as the reviewed WA/NM grocery cohort.

`louisiana-alaska-grocery-research.mjs` is pure capture replay. It reuses the
existing strict grocery product checks, applies current library eligibility,
requires a frozen premise and matching resolver identity, rejects the ambiguous
alias above and marks every result research-only with all delivery flags false.
It performs no HTTP and is not imported by the production state registry.

Relevant primary premise references:

- [Albertsons 7515 Perkins Road](https://local.albertsons.com/la/baton-rouge/7515-perkins-rd/Beer-Wine-Liquor.html)
- [Anchorage package-store renewal](https://www.muni.org/Lists/AssemblyListDocuments/Attachments/1334405/AM%20219-2025.pdf)
- [Alaska public licensing resources](https://www.commerce.alaska.gov/web/amco/OtherAlcoholResources.aspx)

No frozen WA/NM/WI/OK collector, policy, workflow or provenance file is changed.
