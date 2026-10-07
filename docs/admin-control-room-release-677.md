# Owner Control Room consolidation

Compact native navigation and actionable queues; member directory pages with search, plan filters, join/sign-in sorting, authoritative access and separate billing information; ID-attributed member activity; atomic bottle review with drafts, stable identity, historical names, source/size/photo evidence and preserved original submissions. Private desktop presentation remains on the website preview branch.

No new native dependency or permission. OTA compatible with runtime 1.1.0-ios-iap-1. Native static plan definitions no longer advertise paid trials; existing trial access/status remains valid. Checkout/provider and public website changes stay in preview pending owner website approval.

Verification: owner authorization/API tests, PGlite atomic approval/draft/conflict/reference/reward tests, directory filtering/pagination/access tests, push delivery policy and caller tests, native typecheck/full verify/Android and iOS exports. Actual native component rendered in a synthetic browser API fixture at 320px and 390px, enlarged text, no overflow or page errors. This is not physical-device acceptance.

Migration: scripts/migrate-owner-admin.mjs --apply replaces functions and adds owner_review_bottle_submission without deleting data. Retain the previous owner-admin-schema.sql from base a05b45a2 for function rollback. Reverting app/backend code and applying those prior definitions restores the old flow; leave new function and audit records intact. New saves retain original record data and use expected update timestamps and catalog versions. No recurring automation introduced; existing alert delivery jobs read catalog corrections only to preserve exact watch matching and do not emit administrative availability events.
