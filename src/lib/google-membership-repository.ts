import { createRuntimeNeonClient } from "./neon-runtime";
import { PostgresAppleMembershipRepository } from "./apple-membership-repository";
import type { AppleMembershipRepository } from "./apple-membership";
const SCHEMA =
  "CREATE TABLE IF NOT EXISTS google_memberships (\n  original_transaction_id TEXT PRIMARY KEY,\n  clerk_user_id TEXT NOT NULL,\n  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),\n  product_id TEXT NOT NULL CHECK (product_id IN (\n    'com.bourbonsignal.app.standard.monthly',\n    'com.bourbonsignal.app.barrel.monthly'\n  )),\n  entitlement_status TEXT NOT NULL CHECK (entitlement_status IN (\n    'trialing', 'active', 'canceled_period_end', 'grace_period',\n    'billing_issue', 'expired', 'refunded', 'revoked'\n  )),\n  expires_at TIMESTAMPTZ,\n  offer_state TEXT NOT NULL CHECK (offer_state IN (\n    'none', 'introductory_trial', 'introductory_offer', 'promotional_offer', 'unknown'\n  )),\n  ordered_event_at TIMESTAMPTZ NOT NULL,\n  status_priority INTEGER NOT NULL,\n  last_provider_event_id TEXT,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  projected_at TIMESTAMPTZ,\n  UNIQUE (original_transaction_id, clerk_user_id)\n);\n\nCREATE INDEX IF NOT EXISTS google_memberships_owner_order_idx\n  ON google_memberships (clerk_user_id, ordered_event_at DESC, status_priority DESC);\n\nCREATE TABLE IF NOT EXISTS google_membership_events (\n  provider_event_id TEXT PRIMARY KEY,\n  clerk_user_id TEXT NOT NULL,\n  original_transaction_id TEXT NOT NULL REFERENCES google_memberships(original_transaction_id),\n  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),\n  product_id TEXT NOT NULL CHECK (product_id IN (\n    'com.bourbonsignal.app.standard.monthly',\n    'com.bourbonsignal.app.barrel.monthly'\n  )),\n  entitlement_status TEXT NOT NULL,\n  expires_at TIMESTAMPTZ,\n  offer_state TEXT NOT NULL,\n  ordered_event_at TIMESTAMPTZ NOT NULL,\n  received_at TIMESTAMPTZ NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS google_membership_events_transaction_order_idx\n  ON google_membership_events (original_transaction_id, ordered_event_at DESC);\n";
let repository: AppleMembershipRepository | null = null;
export function getGoogleMembershipRepository(): AppleMembershipRepository {
  if (repository) return repository;
  const database = createRuntimeNeonClient();
  const base = new PostgresAppleMembershipRepository(database, "google");
  let ready: Promise<void> | null = null;
  const ensure = () =>
    ready ||
    (ready = (async () => {
      for (const sql of SCHEMA.split(";").filter((s) => s.trim()))
        await database.query(sql);
    })().catch((error) => {
      ready = null;
      throw error;
    }));
  repository = {
    async applyTransition(input) {
      await ensure();
      return base.applyTransition(input);
    },
    async markProjected(...args) {
      await ensure();
      return base.markProjected(...args);
    },
    async readCurrentForUser(id) {
      await ensure();
      return base.readCurrentForUser(id);
    },
    async readByOriginalTransactionId(id) {
      await ensure();
      return base.readByOriginalTransactionId(id);
    },
  };
  return repository;
}
