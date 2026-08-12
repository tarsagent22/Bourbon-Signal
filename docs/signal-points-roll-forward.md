# Signal Points cutover and roll-forward

Signal Points is a roll-forward-only launch migration. Do not remove debt, ledger accounting, or fulfillment snapshot columns after any Signal Points table has been created.

Before application cutover:

1. Run the encrypted local backup and retain the verified artifact.
2. Apply and verify `migrate:app-storage:apply`; a partially applied draft is upgraded in place and existing physical fulfillments must acquire a complete address snapshot or migration stops.
3. Confirm migration created the `signal_points_clerk_metadata_v1_required` marker. Its presence means backfill is required, not that backfill is complete.
4. Run `backfill:signal-points` in dry-run mode and review `scanned`, `wouldChange`, and errors.
5. Run `backfill:signal-points:apply`. Apply performs two complete oldest-first Clerk scans and compares their member count and snapshot hash. It writes `signal_points_clerk_metadata_v1_verified_complete` only when both passes match, every second-pass member matches PostgreSQL, and there are no errors.
6. Require `markedComplete: true`, `mismatched: 0`, `secondPass.matchesFirstPass: true`, and `verified === scanned` before application cutover. Member Signal Points reads and redemptions fail closed without the verified-complete marker.

Clerk reward metadata remains a projection after cutover. PostgreSQL reconciliation must succeed before any ongoing sighting reward update is projected back to Clerk.

For deliberate local or test-only work, `SIGNAL_POINTS_ALLOW_UNVERIFIED_CUTOVER=1` bypasses the application gate. The repository rejects that override when `NODE_ENV=production`.
