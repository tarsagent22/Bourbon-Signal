# Member billing management and owner review privacy

Native Membership has one Manage membership action using the same authenticated billing endpoint as the website. Stripe members open Stripe Billing Portal; Apple members open App Store subscription settings. Stripe members cannot use native upgrade cards to purchase a duplicate Apple subscription. Provider loading fails closed for purchase actions. Gifted/earned access alone is not treated as a recurring subscription. No credentials or billing customer identifiers are accepted from the app.

Billing recovery requires a completed member-bound checkout, never email matching alone. The portal returns to /settings. Metadata repair patches only billing-owned keys. Apple management works without a Stripe key. Website presentation changes remain exclusively on preview/admin-app-funnel.

Owner source/photo evidence is retained on fresh owner catalog reads and removed from ordinary discovery/cache/search. Existing approved artwork and bottle identity are preserved.

Local verification: owner/admin/privacy and provider route tests, concurrent watch preservation, mobile provider URL validation and authenticated API transport, full mobile verify with Android/iOS exports, TypeScript and production web build. Production Stripe secret remains blank as of inspection; live Stripe portal acceptance requires owner configuration. Physical-device acceptance remains pending. No provider cancellation or purchase was performed, no messages sent, and no recurring automation introduced.

Rollback: revert this backend/app change and republish the preceding OTA group 1bed3dc0-4def-457d-abb0-2aa805f46fc5. There are no member-data migrations.
