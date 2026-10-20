# Privacy and terms review — October 19, 2026

Reviewed the public `/legal/privacy` and `/legal/terms` pages, current `origin/main` (646f0db1), shared legal copy, native permissions and scanner implementation, purchase management, account deletion, analytics, and the draft App Privacy inventory. The live pages returned older copy than current source; release verification must inspect the served pages as well as Git.

## Comparison and changes

| Area | Existing gap | Change |
| --- | --- | --- |
| Data sources and purposes | General account/data summary omitted scanner handling, photo processing, drafts, gifts and specific analytics | Describe user-provided, automatic and provider-supplied information; distinguish local scanning from uploaded evidence and account-linked operations |
| Sharing | Generic provider list and a narrow no-customer-list-sales statement | Name current providers and the data used for each function; disclose no personal-data sales or cross-context advertising based on the present implementation |
| Choices and rights | Profile editing and native deletion only | Include an external deletion contact, access/correction/copy requests, applicable objections, verification, agents, appeals and regulator complaints; avoid asserting every privacy law applies |
| Retention | General statement that cleanup starts | Explain removed product data, retries, retained transaction/audit categories, replacement of identifiers, provider records and backup limits; retain the implemented 30-day diagnostic cleanup disclosure |
| Billing | Renewal/refund summary omitted provider deadlines, restoration and platform distinctions | Explain purchase disclosures, Apple renewal timing, platform management/refunds, restore conditions, and cancellation separately from deletion |
| Founder and consumer rights | Broad nonrefund wording on separate refunds page | Preserve original Founder promises, mandatory remedies and platform rules; render refund provisions directly from the terms to avoid drift |
| User content | Posting rules without an operating license | Preserve member ownership and add a limited operating license; no unrelated advertising permission; add infringement contact and clearer Community rules |
| Closure and changes | Minimal termination/material-change treatment | Add closure/review, paid-access commitments, material-change notice and consent, and non-waivable rights |
| Access | Mobile contact and app-license reference lacked direct actions | Add accessible support and Apple standard-license links; cross-link web legal documents |

The app and website already import `shared/legal-content.ts`; the revision remains one shared source. The public policies describe existing processing and user controls. They do not authorize a new data use or replace any necessary in-product permission.

## Benchmarks checked

- [FTC: Marketing Your Mobile App — Get It Right from the Start](https://www.ftc.gov/business-guidance/resources/marketing-your-mobile-app-get-it-right-start): truthful collection/use/sharing disclosures, clear choices and honoring promises.
- [Apple App Review Guidelines, 5.1.1 and 3.1.2](https://developer.apple.com/app-store/review/guidelines/): privacy disclosures, retention/deletion, consent and subscription clarity.
- [Google Play User Data](https://support.google.com/googleplay/android-developer/answer/10144311): comprehensive policy, named operator/contact, retention and deletion inside/outside the app, and consistency with Data safety.
- [California Attorney General CCPA guidance](https://oag.ca.gov/privacy/ccpa): access/correction/deletion, applicable opt-outs and nondiscrimination. Statutory applicability depends on actual business thresholds and facts.
- [Distiller privacy policy](https://distiller.com/privacy-policy) and [terms](https://distiller.com/terms-of-service): comparable spirits/community service coverage for data categories, sharing, content, accounts and subscriptions. Used as a structural comparison, not copied as legal text or treated as authority.
- [Apple standard app license](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/) and [subscription cancellation guidance](https://support.apple.com/en-us/118428): platform license and management context.

## Source evidence

- `apps/mobile/app.json`: camera enabled; GPS, background location, microphone and legacy storage permissions blocked.
- `apps/mobile/modules/bottle-label-reader/`: on-device recognition and temporary scan-frame cleanup.
- `apps/mobile/src/sightings/sighting-photo-native.ts`: explicit optional image choice, normalization and retry storage.
- `apps/mobile/src/drafts/`: account-scoped local forms.
- `src/lib/search-capture.ts`, `src/lib/growth-client.ts`, `src/components/analytics/GrowthAnalytics.tsx`, `src/app/layout.tsx`: first-party events, campaign/referrer processing and Vercel Analytics.
- `src/lib/account-deletion.ts`, `src/lib/account-deletion-repository.ts`, `src/lib/account-deletion-identity-provider.ts`: product-data removal, identity deletion, durable cleanup retries and retained records with replaced identifiers.
- `src/lib/push-devices.ts`, `src/lib/email-alerts.ts`, `src/lib/neon-runtime.ts`: Expo, Resend and Neon.
- `apps/mobile/store/app-privacy.md`: source inventory; final archive and provider/store declarations remain separate verification work.

## Evidence limits and legal follow-up

This is a source-grounded policy improvement, not a legal opinion or certification of compliance. No governing state, mailing address, mandatory arbitration, class-action waiver, indemnity or new liability cap was invented. A qualified attorney should assess the operator’s jurisdiction, statutory thresholds, dispute provisions, notice/acceptance process and any required international-transfer safeguards against actual business facts. Copyright complaint routing is a support process, not a claim of DMCA safe-harbor registration.

Provider contracts, final signed-binary disclosures, store questionnaire answers, backup expiration schedules and fulfillment-provider access were not independently audited. Existing privacy permissions and provider configuration must remain consistent with the published promises. Updating policy copy alone does not fulfill an operational privacy right or obtain consent for a new use. No customer email or store-console change is part of this edit.
