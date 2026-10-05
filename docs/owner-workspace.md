# Owner workspace

Open **Account → Admin** in the app or `/admin` on the website. Every admin page and API requires a signed-in account whose verified primary email is exactly `chandlertodd22@gmail.com`. Membership, founder status, metadata roles, secondary emails and the former business-email alias grant no admin access.

## Daily work

- **Overview:** coverage, community, bottle contributions, rewards and founder shipment queues. Unavailable queues show an error instead of a misleading zero.
- **Coverage:** requests from the app and website share the existing database. Requests are grouped by exact location with unique member counts. Private notes never appear in member history. Member updates appear only in the requester's history; saving does not send email or push messages.
- **Members:** search names, emails and assigned numbers. Founders display their founder number.
- **Community and rewards:** use the existing moderation and fulfillment APIs. Photo approvals require a loaded photo. Rejections require a reason; physical shipments require tracking information.
- **Pricing and service health:** open the responsive web workspace for detailed evidence, historical reviews and technical operations.

## Coverage workflow

`Requested` keeps the investigation queued. `Under review` pauses automation for owner review. `Closed` closes the request. Coverage improvement is recorded by the existing workflow only after verified production evidence; the dashboard cannot manually promise an improvement.

All membership tiers can request a city, county, store or state from Account, Support or an empty Home feed. Members can follow their own requests. A request does not guarantee coverage or a launch date.

## Pricing review

The collection value is a partial estimate when not all bottles have prices. MSRP includes owned bottles; secondary estimates include sealed bottles only. Missing, stale or mismatched prices are excluded. If the pricing database cannot be read, value is temporarily unavailable rather than silently replaced with potentially outdated seeds.

In the web workspace, choose the exact catalog ID and name. Record the original source date, an HTTPS evidence link, size/edition details and a review note. Each save appends a new historical record. Manufacturer MSRP expires after 730 days; secondary references and reviews expire after 90 days.

Completed-sale estimates require 3–100 unique, dated sale references from the last 90 days. The range uses the 10th and 90th percentiles after IQR outlier filtering. Smaller samples receive medium confidence; high confidence requires at least ten retained observations and sources from at least two hosts. A manually entered market range is low confidence. This is an estimate, not an appraisal or a guarantee of resale proceeds; no paid market-data subscription is included.

Review queues prioritize bottles held by more members. A daily Vercel check at 12:45 UTC records missing, stale and soon-due pricing counts. It uses the existing cron credential, exposes aggregates only, cannot edit prices and sends no messages.

## Schema and release

`scripts/migrate-owner-workspace.mjs` adds review notes, audit records, price history and pricing-health tables. Production application requires `--apply --target=<database-host/database-name>`; the target must match the configured database. Coverage notes and queue changes save atomically. Request/account deletion cascades the associated review notes.

App screens and loading animation can ship OTA. The installed native launch image requires a new iOS binary. Loading ends as soon as the app is ready; the pulse is decorative and respects Reduce Motion.
