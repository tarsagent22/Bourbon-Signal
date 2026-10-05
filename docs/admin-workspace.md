# Owner workspace

Account → Admin is a native owner-only workspace. Its six destinations are Inbox, Community, Bottle Library, Members, Rewards & Shipping, and Coverage & Operations. Routine administration stays in the app.

Community offers review, all-post, and removed/rejected views with search and pagination. Corrections select an exact catalog bottle and edit the post's store, price, quantity and notes. Photo publication is a separate action and never adds a catalog bottle. Failed photos can be rejected without approving unreadable evidence. Removal is reversible and recomputes reward accounting.

Bottle Library supports searching, creating and editing whiskey entries, aliases, and merging duplicate identities. IDs remain stable on edits. Merges redirect old IDs and retain separate personal shelf records rather than collapsing ratings or notes. Submission matching changes linked shelf records without losing their quantities, rating, notes, purchase details, or dates. Collection versions advance so older device saves conflict rather than overwrite the correction.

Member records connect identity and membership, points activity, redemption history, founder shipping, private support notes and contributor restrictions. Point corrections are append-only, idempotent and debt-aware. They do not change billing-provider entitlements. Restrictions control community alert authority; individual offending posts are reviewed separately.

Rewards show the member's actual selection and immutable shipping snapshot. Founder shipments, tracking corrections, referral-glass fulfillment and explicit shipment-email delivery stay native. Saving shipment details does not implicitly send email. The existing notification claim and idempotency rules prevent duplicate delivery.

Coverage distinguishes queuing investigation, pausing for review, closing a request, private notes and member-visible updates. Improvement remains backed by verified production evidence. Recent investigation outcomes, pricing evidence review, service health and owner change history are available in the app.

All owner routes enforce the verified primary owner identity before reads or writes. Catalog and post edits reject stale revisions, and committed changes have private audit history. Account deletion removes member/post support audit records. Public post review metadata contains a generic administrator correction note, not private support reasons.

Apply the additive schema with `node --env-file=.env.production.local scripts/migrate-owner-admin.mjs --apply` against the established production project before deploying this API/OTA pair. Run `npm run test:owner-workspace`, the mobile verification suite, the existing CI command set, and responsive native-component fixtures. A served OTA manifest proves publication; physical-iPhone interaction remains a separate acceptance step.
