#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const apply = process.argv.includes('--apply');
const check = process.argv.includes('--check') || !apply;
if (apply && process.argv.includes('--check')) throw new Error('Choose either --check or --apply.');
const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing durable application database connection.');

function splitSql(source) {
  const statements = [];
  let current = '';
  let quote = null;
  let dollarTag = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && (char === '$')) {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    } else if (dollarTag && source.startsWith(dollarTag, index)) {
      current += dollarTag;
      index += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }
    if (!dollarTag && (char === "'" || char === '"')) {
      if (quote === char && next === char) {
        current += char + next;
        index += 1;
        continue;
      }
      if (!quote) quote = char;
      else if (quote === char) quote = null;
    }
    if (char === ';' && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const schemaFiles = [
  '../src/lib/member-collection-schema.sql',
  '../src/lib/bottle-contribution-schema.sql',
  '../src/lib/approved-catalog-schema.sql',
  '../src/lib/welcome-local-preview-schema.sql',
  '../src/lib/founder-shipping-schema.sql',
  '../src/lib/referral-schema.sql',
  '../src/lib/signal-points-schema.sql',
  '../src/lib/membership-trial-schema.sql',
  '../src/lib/gift-schema.sql',
  '../src/lib/community-sightings-schema.sql',
  '../src/lib/retailer-schema.sql',
];
const sql = neon(connectionString);
if (apply) {
  const statements = [];
  for (const relative of schemaFiles) {
    const schema = await readFile(new URL(relative, import.meta.url), 'utf8');
    statements.push(...splitSql(schema));
  }
  await sql.transaction(
    (transaction) => statements.map((statement) => transaction.query(statement)),
    { isolationLevel: 'Serializable' },
  );
}
if (check) {
  // --check is intentionally read-only.
}

const expected = [
  'approved_catalog_bottles',
  'approved_catalog_locations',
  'welcome_signal_previews',
  'founder_glass_shipping',
  'gift_orders',
  'gift_order_events',
  'founder_spot_reservations',
  'founder_reconciliation_state',
  'gift_redemption_recipients',
  'gift_recipient_locks',
  'gift_payment_attempts',
  'direct_founder_checkout_reservations',
  'direct_founder_checkout_events',
  'member_referral_codes',
  'member_referral_eligibility_events',
  'member_referrals',
  'member_referral_point_ledger',
  'member_referral_glass_rewards',
  'member_referral_scale_migrations',
  'signal_point_accounts',
  'signal_point_reward_generations',
  'signal_point_source_balances',
  'signal_point_ledger',
  'signal_point_migrations',
  'signal_reward_catalog',
  'signal_reward_redemptions',
  'signal_reward_redemption_events',
  'signal_reward_fulfillments',
  'membership_trial_claims',
  'bottle_contributions',
  'community_sighting_votes',
  'community_sightings',
  'member_collection_bottles',
  'member_collection_legacy_backups',
  'member_collection_state',
  'retailer_applications',
  'retailer_stores',
  'retailer_submissions',
];
const rows = await sql.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  ORDER BY table_name
`, [expected]);
const found = new Set(rows.map((row) => row.table_name));
const missing = expected.filter((table) => !found.has(table));
const requiredColumns = {
  approved_catalog_bottles: ['id', 'normalized_name', 'payload', 'approved_by'],
  approved_catalog_locations: ['id', 'normalized_key', 'payload', 'approved_by'],
  welcome_signal_previews: ['user_id', 'payload', 'redeemed_at', 'expires_at'],
  founder_glass_shipping: ['user_id', 'founder_number', 'account_email', 'recipient_name', 'address_line1', 'address_line2', 'city', 'state_code', 'postal_code', 'phone', 'country_code', 'status', 'carrier', 'tracking_number', 'submitted_at', 'updated_at', 'shipped_at', 'updated_by', 'shipment_notification_sent_at', 'shipment_notification_message_id', 'shipment_notification_claimed_at', 'shipment_notification_claim_token', 'shipment_notification_idempotency_key'],
  gift_orders: ['id', 'purchaser_request_id', 'purchaser_user_id', 'purchaser_email', 'purchaser_name', 'recipient_email', 'recipient_name', 'gift_message', 'gift_plan', 'gift_tier', 'delivery_mode', 'scheduled_local_datetime', 'delivery_timezone', 'scheduled_delivery_at', 'payment_status', 'stripe_checkout_session_id', 'stripe_payment_intent_id', 'stripe_charge_id', 'redemption_token_hash', 'redemption_token_key_version', 'entitlement_version', 'redeemed_by_user_id', 'redeemed_by_email', 'redeemed_at', 'checkout_claim_token', 'checkout_claimed_at', 'checkout_attempt', 'delivery_status', 'delivery_claimed_at', 'delivery_claim_token', 'delivery_idempotency_key', 'delivery_provider_message_id', 'delivery_attempts', 'delivered_at', 'access_starts_at', 'access_expires_at', 'refunded_at', 'disputed_at', 'dispute_status', 'risk_flag', 'created_at', 'updated_at', 'funded_at', 'expiry_reconciled_at', 'adverse_reconciled_at'],
  gift_order_events: ['id', 'gift_order_id', 'stripe_event_id', 'event_key', 'event_type', 'event_payload', 'occurred_at', 'created_at'],
  founder_spot_reservations: ['founder_number', 'source_type', 'source_id', 'gift_order_id', 'user_id', 'status', 'reserved_at', 'assigned_at', 'updated_at'],
  founder_reconciliation_state: ['singleton', 'clerk_user_count', 'completed_at', 'updated_at'],
  gift_redemption_recipients: ['user_id', 'verified_email', 'gift_order_id', 'claim_token', 'status', 'claimed_at', 'activation_started_at', 'activation_attempts', 'last_activation_error', 'finalized_at', 'updated_at'],
  gift_recipient_locks: ['lock_key', 'gift_order_id', 'claim_token', 'locked_until', 'created_at', 'updated_at'],
  gift_payment_attempts: ['gift_order_id', 'checkout_attempt', 'checkout_session_id', 'stripe_payment_intent_id', 'stripe_charge_id', 'status', 'refund_handling', 'paid_at', 'created_at', 'updated_at'],
  direct_founder_checkout_reservations: ['attempt_id', 'user_id', 'founder_number', 'checkout_session_id', 'stripe_payment_intent_id', 'stripe_charge_id', 'entitlement_version', 'status', 'dispute_status', 'refund_handling', 'physical_fulfillment_review', 'created_at', 'updated_at', 'paid_at'],
  direct_founder_checkout_events: ['id', 'attempt_id', 'stripe_event_id', 'event_type', 'event_payload', 'created_at'],
  member_referral_codes: ['referrer_user_id', 'code', 'email_hash', 'created_at', 'updated_at'],
  member_referral_eligibility_events: ['source_event_id', 'referred_user_id', 'tier', 'created_at'],
  member_referrals: ['referred_user_id', 'referrer_user_id', 'referral_code', 'referred_email_hash', 'highest_tier', 'awarded_points', 'attributed_at', 'updated_at'],
  member_referral_point_ledger: ['id', 'event_key', 'referrer_user_id', 'referred_user_id', 'tier', 'reason', 'points', 'source_event_id', 'created_at'],
  member_referral_glass_rewards: ['referred_user_id', 'referrer_user_id', 'status', 'earned_at', 'address_confirmed_at', 'shipped_at', 'updated_at'],
  member_referral_scale_migrations: ['migration_key', 'completed_at'],
  signal_point_accounts: ['user_id', 'balance', 'debt', 'created_at', 'updated_at'],
  signal_point_reward_generations: ['user_id', 'generation', 'reconciled_generation', 'updated_at'],
  signal_point_source_balances: ['user_id', 'source_key', 'points', 'revision', 'updated_at'],
  signal_point_ledger: ['id', 'user_id', 'idempotency_key', 'entry_kind', 'points', 'balance_delta', 'debt_delta', 'source_type', 'source_key', 'redemption_id', 'metadata', 'created_at'],
  signal_point_migrations: ['migration_key', 'completed_at', 'details'],
  signal_reward_catalog: ['item_key', 'catalog_version', 'name', 'points_cost', 'fulfillment_type', 'inventory_remaining', 'option_snapshot', 'active', 'created_at', 'updated_at'],
  signal_reward_redemptions: ['id', 'user_id', 'idempotency_key', 'item_key', 'catalog_version', 'item_snapshot', 'details', 'points_spent', 'status', 'account_email', 'created_at', 'updated_at', 'canceled_at'],
  signal_reward_redemption_events: ['id', 'redemption_id', 'from_status', 'to_status', 'actor_id', 'actor_role', 'metadata', 'created_at'],
  signal_reward_fulfillments: ['redemption_id', 'fulfillment_type', 'shipping_profile_user_id', 'shipping_address', 'owner_notes', 'carrier', 'tracking_number', 'created_at', 'updated_at'],
  membership_trial_claims: ['user_id', 'subscription_id', 'plan', 'source', 'checkout_session_id', 'trial_ends_at', 'metadata', 'status', 'started_at', 'converted_at', 'canceled_at', 'created_at', 'updated_at'],
  bottle_contributions: ['id', 'status', 'payload'],
  community_sighting_votes: ['sighting_id', 'user_id', 'kind'],
  community_sightings: ['id', 'reporter_user_id', 'payload'],
  member_collection_bottles: ['user_id', 'canonical_key', 'rating', 'payload'],
  member_collection_legacy_backups: ['user_id', 'payload'],
  member_collection_state: ['user_id', 'version', 'legacy_migrated_at'],
  retailer_applications: ['user_id', 'terms_accepted_at', 'decision_notified_status'],
  retailer_stores: ['id', 'user_id', 'status'],
  retailer_submissions: ['id', 'user_id', 'store_id', 'status', 'payload'],
};
const columnRows = await sql.query(`
  SELECT table_name, column_name, data_type, is_nullable, character_maximum_length, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = ANY($1::text[])
`, [expected]);
const availableColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
const missingColumns = Object.entries(requiredColumns).flatMap(([table, columns]) =>
  columns.filter((column) => !availableColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`));
const criticalColumnDefinitions = {
  'member_collection_state.user_id': ['text', 'NO'],
  'member_collection_state.version': ['bigint', 'NO'],
  'member_collection_state.updated_at': ['timestamp with time zone', 'NO'],
  'member_collection_bottles.user_id': ['text', 'NO'],
  'member_collection_bottles.canonical_key': ['text', 'NO'],
  'member_collection_bottles.rating': ['integer', 'NO'],
  'member_collection_bottles.payload': ['jsonb', 'NO'],
  'member_collection_bottles.updated_at': ['timestamp with time zone', 'NO'],
  'member_collection_legacy_backups.user_id': ['text', 'NO'],
  'member_collection_legacy_backups.payload': ['jsonb', 'NO'],
  'founder_glass_shipping.user_id': ['text', 'NO'],
  'founder_glass_shipping.founder_number': ['integer', 'YES'],
  'founder_glass_shipping.phone': ['text', 'NO'],
  'founder_glass_shipping.country_code': ['character', 'NO'],
  'founder_glass_shipping.status': ['text', 'NO'],
};
const availableDefinitions = new Map(columnRows.map((row) => [
  `${row.table_name}.${row.column_name}`,
  [row.data_type, row.is_nullable],
]));
const invalidDefinitions = Object.entries(criticalColumnDefinitions).flatMap(([column, expectedDefinition]) => {
  const actual = availableDefinitions.get(column);
  return actual && actual[0] === expectedDefinition[0] && actual[1] === expectedDefinition[1] ? [] : [column];
});
const founderColumnDefinitions = {
  user_id: ['text', 'NO', null, null],
  founder_number: ['integer', 'YES', null, null],
  account_email: ['text', 'NO', null, null],
  recipient_name: ['text', 'NO', null, null],
  address_line1: ['text', 'NO', null, null],
  address_line2: ['text', 'YES', null, null],
  city: ['text', 'NO', null, null],
  state_code: ['character', 'NO', 2, null],
  postal_code: ['text', 'NO', null, null],
  country_code: ['character', 'NO', 2, "'US'::bpchar"],
  phone: ['text', 'NO', null, null],
  status: ['text', 'NO', null, "'submitted'::text"],
  carrier: ['text', 'YES', null, null],
  tracking_number: ['text', 'YES', null, null],
  submitted_at: ['timestamp with time zone', 'NO', null, 'now()'],
  updated_at: ['timestamp with time zone', 'NO', null, 'now()'],
  shipped_at: ['timestamp with time zone', 'YES', null, null],
  updated_by: ['text', 'YES', null, null],
  shipment_notification_sent_at: ['timestamp with time zone', 'YES', null, null],
  shipment_notification_message_id: ['text', 'YES', null, null],
  shipment_notification_claimed_at: ['timestamp with time zone', 'YES', null, null],
  shipment_notification_claim_token: ['text', 'YES', null, null],
  shipment_notification_idempotency_key: ['text', 'YES', null, null],
};
const normalizeDefault = (value) => value === null || value === undefined ? null : String(value).replace(/\s+/g, '');
const invalidFounderColumns = Object.entries(founderColumnDefinitions).flatMap(([column, definition]) => {
  const actual = columnRows.find((row) => row.table_name === 'founder_glass_shipping' && row.column_name === column);
  const [dataType, nullable, maximumLength, defaultValue] = definition;
  return actual
    && actual.data_type === dataType
    && actual.is_nullable === nullable
    && (actual.character_maximum_length === null ? null : Number(actual.character_maximum_length)) === maximumLength
    && normalizeDefault(actual.column_default) === defaultValue
    ? []
    : [column];
});
const expectedIndexes = [
  'approved_catalog_bottles_updated_idx',
  'approved_catalog_locations_updated_idx',
  'welcome_signal_previews_expires_idx',
  'founder_glass_shipping_founder_number_idx',
  'founder_glass_shipping_status_idx',
  'gift_orders_delivery_due_idx',
  'gift_orders_recipient_idx',
  'gift_order_events_order_idx',
  'founder_spot_reservations_status_idx',
  'gift_orders_expiry_reconciliation_idx',
  'gift_orders_adverse_reconciliation_idx',
  'member_referrals_referrer_idx',
  'member_referral_eligibility_events_user_idx',
  'member_referral_point_ledger_referrer_idx',
  'member_referral_glass_rewards_referrer_idx',
  'signal_point_ledger_user_created_idx',
  'signal_reward_redemptions_user_created_idx',
  'signal_reward_redemptions_status_created_idx',
  'bottle_contributions_updated_idx',
  'community_sightings_created_idx',
  'community_sighting_votes_sighting_idx',
  'member_collection_bottles_canonical_rating_idx',
  'member_collection_bottles_user_updated_idx',
  'retailer_applications_status_idx',
  'retailer_stores_user_status_idx',
  'retailer_submissions_status_created_idx',
  'retailer_submissions_store_created_idx',
];
const indexRows = await sql.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, [expectedIndexes]);
const availableIndexes = new Set(indexRows.map((row) => row.indexname));
const missingIndexes = expectedIndexes.filter((index) => !availableIndexes.has(index));
const normalizeCatalogColumns = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !/^\{.*\}$/.test(value)) return [];
  const body = value.slice(1, -1);
  return body ? body.split(',') : [];
};
const expectedFounderIndexes = {
  founder_glass_shipping_founder_number_idx: { unique: true, columns: ['founder_number'] },
  founder_glass_shipping_status_idx: { unique: false, columns: ['status', 'founder_number'] },
};
const founderIndexRows = await sql.query(`
  SELECT i.relname AS indexname, t.relname AS table_name, x.indisunique, x.indisvalid,
    (x.indpred IS NOT NULL) AS has_predicate,
    (x.indexprs IS NOT NULL) AS has_expressions,
    x.indnatts, x.indnkeyatts,
    ARRAY(
      SELECT a.attname
      FROM unnest(x.indkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      ORDER BY key.position
    ) AS columns
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND i.relname = ANY($1::text[])
`, [Object.keys(expectedFounderIndexes)]);
const invalidFounderIndexes = Object.entries(expectedFounderIndexes).flatMap(([index, expectedDefinition]) => {
  const actual = founderIndexRows.find((row) => row.indexname === index);
  const columns = normalizeCatalogColumns(actual?.columns);
  return actual
    && actual.table_name === 'founder_glass_shipping'
    && actual.indisunique === expectedDefinition.unique
    && actual.indisvalid === true
    && actual.has_predicate === false
    && actual.has_expressions === false
    && Number(actual.indnatts) === expectedDefinition.columns.length
    && Number(actual.indnkeyatts) === expectedDefinition.columns.length
    && columns.length === expectedDefinition.columns.length
    && columns.every((column, position) => column === expectedDefinition.columns[position])
    ? []
    : [index];
});
const expectedConstraints = [
  'community_sighting_votes_pkey',
  'community_sighting_votes_sighting_id_fkey',
  'member_collection_state_pkey',
  'member_collection_bottles_pkey',
  'member_collection_bottles_user_id_fkey',
  'member_collection_legacy_backups_pkey',
  'founder_glass_shipping_pkey',
  'founder_glass_shipping_founder_number_positive',
  'founder_glass_shipping_country_us',
  'founder_glass_shipping_status_valid',
  'gift_orders_pkey',
  'gift_orders_purchaser_request_unique',
  'gift_orders_token_version_required',
  'gift_orders_entitlement_version_required',
  'founder_spot_reservations_pkey',
  'founder_reconciliation_state_pkey',
  'gift_redemption_recipients_pkey',
  'gift_redemption_recipients_claim_token_key',
  'gift_recipient_locks_pkey',
  'gift_payment_attempts_pkey',
  'direct_founder_checkout_reservations_pkey',
  'direct_founder_checkout_events_pkey',
  'direct_founder_checkout_events_stripe_event_id_key',
  'member_referral_codes_pkey',
  'member_referral_codes_code_key',
  'member_referrals_pkey',
  'member_referrals_referrer_user_id_fkey',
  'member_referrals_highest_tier_valid',
  'member_referrals_awarded_points_valid',
  'member_referral_eligibility_events_pkey',
  'member_referral_eligibility_tier_valid',
  'member_referral_point_ledger_pkey',
  'member_referral_point_ledger_event_key_key',
  'member_referral_point_tier_valid',
  'member_referral_point_reason_valid',
  'member_referral_point_value_valid',
  'member_referral_glass_rewards_pkey',
  'member_referral_glass_status_valid',
  'member_referral_scale_migrations_pkey',
  'signal_point_accounts_pkey',
  'signal_point_accounts_balance_nonnegative',
  'signal_point_accounts_debt_nonnegative',
  'signal_point_reward_generations_pkey',
  'signal_point_reward_generation_nonnegative',
  'signal_point_reward_reconciled_generation_valid',
  'signal_point_source_balances_pkey',
  'signal_point_source_balances_user_id_fkey',
  'signal_point_source_balance_nonnegative',
  'signal_point_source_balance_revision_nonnegative',
  'signal_point_ledger_pkey',
  'signal_point_ledger_user_id_fkey',
  'signal_point_ledger_redemption_id_fkey',
  'signal_point_ledger_user_id_idempotency_key_key',
  'signal_point_ledger_kind_valid',
  'signal_point_ledger_points_nonzero',
  'signal_point_ledger_sign_matches_kind',
  'signal_point_ledger_economic_balance',
  'signal_point_migrations_pkey',
  'signal_reward_catalog_pkey',
  'signal_reward_catalog_version_positive',
  'signal_reward_catalog_cost_positive',
  'signal_reward_catalog_fulfillment_valid',
  'signal_reward_catalog_inventory_nonnegative',
  'signal_reward_redemptions_pkey',
  'signal_reward_redemptions_user_id_fkey',
  'signal_reward_redemptions_item_key_fkey',
  'signal_reward_redemptions_user_id_idempotency_key_key',
  'signal_reward_redemption_points_positive',
  'signal_reward_redemption_status_valid',
  'signal_reward_redemption_events_pkey',
  'signal_reward_redemption_events_redemption_id_fkey',
  'signal_reward_event_actor_role_valid',
  'signal_reward_fulfillments_pkey',
  'signal_reward_fulfillments_redemption_id_fkey',
  'signal_reward_fulfillment_type_valid',
  'signal_reward_fulfillment_shipping_snapshot_valid',
  'signal_reward_fulfillment_tracking_pair',
  'retailer_submissions_store_id_fkey',
];
const constraintRows = await sql.query(`
  SELECT c.conname, t.relname AS table_name, c.contype, pg_get_constraintdef(c.oid) AS definition,
    ARRAY(
      SELECT a.attname
      FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      ORDER BY key.position
    ) AS columns
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.conname = ANY($1::text[])
`, [expectedConstraints]);
const availableConstraints = new Set(constraintRows.map((row) => row.conname));
const missingConstraints = expectedConstraints.filter((constraint) => !availableConstraints.has(constraint));
const expectedReferralConstraintShapes = {
  member_referral_codes_pkey: ['member_referral_codes', 'p', ['referrer_user_id'], []],
  member_referral_codes_code_key: ['member_referral_codes', 'u', ['code'], []],
  member_referrals_pkey: ['member_referrals', 'p', ['referred_user_id'], []],
  member_referrals_referrer_user_id_fkey: ['member_referrals', 'f', ['referrer_user_id'], ['REFERENCESmember_referral_codes(referrer_user_id)']],
  member_referrals_highest_tier_valid: ['member_referrals', 'c', ['highest_tier'], ["'free'", "'standard'", "'barrel'", "'bottled-in-bond'"]],
  member_referrals_awarded_points_valid: ['member_referrals', 'c', ['awarded_points'], ['awarded_points>=0', 'awarded_points<=150']],
  member_referral_eligibility_events_pkey: ['member_referral_eligibility_events', 'p', ['source_event_id'], []],
  member_referral_eligibility_tier_valid: ['member_referral_eligibility_events', 'c', ['tier'], ["'free'", "'standard'", "'barrel'", "'bottled-in-bond'"]],
  member_referral_point_ledger_pkey: ['member_referral_point_ledger', 'p', ['id'], []],
  member_referral_point_ledger_event_key_key: ['member_referral_point_ledger', 'u', ['event_key'], []],
  member_referral_point_tier_valid: ['member_referral_point_ledger', 'c', ['tier'], ["'free'", "'standard'", "'barrel'", "'bottled-in-bond'"]],
  member_referral_point_reason_valid: ['member_referral_point_ledger', 'c', ['reason'], ["'referral_free'", "'referral_standard'", "'referral_barrel'", "'referral_founder'"]],
  member_referral_point_value_valid: ['member_referral_point_ledger', 'c', ['points'], ['points>0', 'points<=150']],
  member_referral_glass_rewards_pkey: ['member_referral_glass_rewards', 'p', ['referred_user_id'], []],
  member_referral_glass_status_valid: ['member_referral_glass_rewards', 'c', ['status'], ["'address_required'", "'address_confirmed'", "'packed'", "'shipped'"]],
};
const normalizeReferralDefinition = (value) => String(value || '').replace(/\s+|::text|::bpchar|\(|\)/g, '').toLowerCase();
const invalidReferralConstraints = Object.entries(expectedReferralConstraintShapes).flatMap(([name, shape]) => {
  const [table, type, columns, fragments] = shape;
  const actual = constraintRows.find((row) => row.conname === name);
  const actualColumns = normalizeCatalogColumns(actual?.columns);
  const definition = normalizeReferralDefinition(actual?.definition);
  const valid = actual
    && actual.table_name === table
    && actual.contype === type
    && actualColumns.length === columns.length
    && actualColumns.every((column, index) => column === columns[index])
    && fragments.every((fragment) => definition.includes(normalizeReferralDefinition(fragment)));
  return valid ? [] : [name];
});
const expectedSignalConstraintShapes = {
  signal_point_accounts_balance_nonnegative: ['signal_point_accounts', ['balance>=0']],
  signal_point_accounts_debt_nonnegative: ['signal_point_accounts', ['debt>=0']],
  signal_point_reward_generation_nonnegative: ['signal_point_reward_generations', ['generation>=0']],
  signal_point_reward_reconciled_generation_valid: ['signal_point_reward_generations', ["reconciled_generation>='-1'"]],
  signal_point_source_balance_nonnegative: ['signal_point_source_balances', ['points>=0']],
  signal_point_source_balance_revision_nonnegative: ['signal_point_source_balances', ['revision>=0']],
  signal_point_ledger_sign_matches_kind: ['signal_point_ledger', [
    "entry_kind=anyarray'credit','migration_credit','cancellation_credit'", 'points>0', 'balance_delta>=0', 'debt_delta<=0',
    "entry_kind=anyarray'debit','migration_debit','redemption_debit'", 'points<0', 'balance_delta<=0', 'debt_delta>=0',
  ]],
  signal_point_ledger_economic_balance: ['signal_point_ledger', ['points=balance_delta-debt_delta']],
  signal_reward_fulfillment_shipping_snapshot_valid: ['signal_reward_fulfillments', ["fulfillment_type='digital'", 'shipping_addressisnull', "fulfillment_type='physical'", "jsonb_typeofshipping_address='object'"]],
  signal_reward_fulfillment_tracking_pair: ['signal_reward_fulfillments', ['carrierisnull', 'tracking_numberisnull', 'carrierisnotnull', 'tracking_numberisnotnull']],
};
const normalizeSignalDefinition = (value) => String(value || '').replace(/\s+|::text|::bpchar|\(|\)|\[|\]/g, '').toLowerCase();
const invalidSignalConstraints = Object.entries(expectedSignalConstraintShapes).flatMap(([name, shape]) => {
  const [table, fragments] = shape;
  const actual = constraintRows.find((row) => row.conname === name && row.table_name === table);
  const definition = normalizeSignalDefinition(actual?.definition);
  return actual && actual.contype === 'c' && fragments.every((fragment) => definition.includes(normalizeSignalDefinition(fragment))) ? [] : [name];
});
const expectedFounderConstraintDefinitions = {
  founder_glass_shipping_founder_number_positive: 'CHECK(((founder_numberISNULL)OR(founder_number>0)))',
  founder_glass_shipping_country_us: "CHECK((country_code='US'::bpchar))",
  founder_glass_shipping_status_valid: "CHECK((status=ANY(ARRAY['submitted'::text,'confirmed'::text,'packed'::text,'shipped'::text])))",
};
const normalizeConstraintDefinition = (value) => String(value || '').replace(/\s+/g, '');
const founderPrimaryKey = constraintRows.find((row) => row.conname === 'founder_glass_shipping_pkey' && row.table_name === 'founder_glass_shipping');
const founderPrimaryKeyColumns = normalizeCatalogColumns(founderPrimaryKey?.columns);
const invalidFounderPrimaryKey = founderPrimaryKey
  && founderPrimaryKey.contype === 'p'
  && founderPrimaryKeyColumns.length === 1
  && founderPrimaryKeyColumns[0] === 'user_id'
  ? []
  : ['founder_glass_shipping_pkey'];
const invalidFounderConstraints = Object.entries(expectedFounderConstraintDefinitions).flatMap(([constraint, expectedDefinition]) => {
  const actual = constraintRows.find((row) => row.conname === constraint && row.table_name === 'founder_glass_shipping');
  return actual
    && actual.table_name === 'founder_glass_shipping'
    && actual.contype === 'c'
    && normalizeConstraintDefinition(actual.definition) === expectedDefinition
    ? []
    : [constraint];
});
const expectedReferralFunctions = {
  referral_tier_rank: {
    arguments: 'value text',
    result: 'integer',
    fragments: ["WHEN 'free' THEN 0", "WHEN 'bottled-in-bond' THEN 3"],
  },
  reconcile_member_referral_reward: {
    arguments: 'p_referred_user_id text, p_next_tier text, p_source_event_id text',
    result: 'TABLE(points_awarded integer, target_points integer, founder_glass_earned boolean)',
    fragments: ['INSERT INTO member_referral_eligibility_events', 'FOR UPDATE', 'free_points_awarded >= 50', 'ON CONFLICT (event_key) DO NOTHING'],
  },
  claim_member_referral: {
    arguments: 'p_referred_user_id text, p_referral_code text, p_referred_email_hash text',
    result: 'TABLE(claim_status text, points_awarded integer)',
    fragments: ['code = UPPER(p_referral_code)', 'code_row.email_hash = p_referred_email_hash', 'reconcile_member_referral_reward'],
  },
  reject_signal_point_ledger_mutation: {
    arguments: '',
    result: 'trigger',
    fragments: ['Signal Points ledger is append-only'],
  },
  reject_signal_reward_fulfillment_snapshot_mutation: {
    arguments: '',
    result: 'trigger',
    fragments: ['shipping_address IS DISTINCT FROM OLD.shipping_address', 'Signal reward fulfillment snapshot is immutable'],
  },
  credit_signal_points: {
    arguments: 'p_user_id text, p_points integer, p_idempotency_key text, p_source_type text, p_metadata jsonb',
    result: 'integer',
    fragments: ['FOR UPDATE', 'debt_repaid', 'balance_delta', 'debt_delta', 'creditRequest', 'Signal Points credit idempotency key conflict'],
  },
  reconcile_signal_point_source: {
    arguments: 'p_user_id text, p_source_key text, p_target_points integer, p_idempotency_key text, p_metadata jsonb',
    result: 'integer',
    fragments: ['signal_point_source_balances', 'migration_credit', 'migration_debit', 'debt_created', 'debt_repaid'],
  },
  next_community_sighting_reward_generation: {
    arguments: 'p_user_id text',
    result: 'bigint',
    fragments: ['signal_point_reward_generations', 'generation+1'],
  },
  reconcile_signal_point_source_set: {
    arguments: 'p_user_id text, p_source_prefix text, p_generation bigint, p_targets jsonb, p_idempotency_key text, p_metadata jsonb',
    result: 'TABLE(balance integer, debt integer, applied boolean, generation bigint)',
    fragments: ['reconciled_generation', 'jsonb_array_elements', 'omittedFromSourceSet', 'reconcile_signal_point_source'],
  },
  reserve_signal_reward: {
    arguments: 'p_redemption_id text, p_user_id text, p_tier text, p_item_key text, p_idempotency_key text, p_details jsonb, p_account_email text, p_shipping_confirmed boolean',
    result: 'TABLE(redemption_id text, redemption_status text, balance integer)',
    fragments: ['FOR UPDATE', 'idempotency key conflict', 'shipping_snapshot', 'inventory_remaining', 'redemption_debit'],
  },
  transition_signal_reward_redemption: {
    arguments: 'p_redemption_id text, p_actor_id text, p_next_status text, p_actor_role text, p_metadata jsonb',
    result: 'TABLE(redemption_id text, redemption_status text, balance integer)',
    fragments: ['Invalid redemption transition', 'cancellation_credit', 'inventory_remaining', 'Carrier and tracking data are required'],
  },
};
const referralFunctionRows = await sql.query(`
  SELECT p.proname,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS result,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
`, [Object.keys(expectedReferralFunctions)]);
const normalizeFunctionText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
const invalidReferralFunctions = Object.entries(expectedReferralFunctions).flatMap(([name, expectedFunction]) => {
  const matches = referralFunctionRows.filter((row) => row.proname === name && normalizeFunctionText(row.arguments) === normalizeFunctionText(expectedFunction.arguments));
  if (matches.length !== 1) return [name];
  const actual = matches[0];
  const definition = normalizeFunctionText(actual.definition);
  return normalizeFunctionText(actual.result) === normalizeFunctionText(expectedFunction.result)
    && expectedFunction.fragments.every((fragment) => definition.includes(normalizeFunctionText(fragment)))
    ? []
    : [name];
});
const signalTriggerRows = await sql.query(`
  SELECT trigger_row.tgname, pg_get_triggerdef(trigger_row.oid) AS definition
  FROM pg_trigger trigger_row
  JOIN pg_class table_row ON table_row.oid=trigger_row.tgrelid
  JOIN pg_namespace namespace_row ON namespace_row.oid=table_row.relnamespace
  WHERE namespace_row.nspname='public' AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname=ANY($1::text[])
`, [['signal_point_ledger_append_only', 'signal_reward_fulfillments_immutable_snapshot']]);
const expectedSignalTriggers = {
  signal_point_ledger_append_only: ['BEFORE', 'UPDATE', 'DELETE', 'signal_point_ledger', 'reject_signal_point_ledger_mutation'],
  signal_reward_fulfillments_immutable_snapshot: ['BEFORE UPDATE', 'signal_reward_fulfillments', 'reject_signal_reward_fulfillment_snapshot_mutation'],
};
const invalidSignalTriggers = Object.entries(expectedSignalTriggers).flatMap(([name, fragments]) => {
  const actual = signalTriggerRows.find((row) => row.tgname === name);
  const definition = normalizeFunctionText(actual?.definition);
  return actual && fragments.every((fragment) => definition.includes(normalizeFunctionText(fragment))) ? [] : [name];
});
const caskersCatalogRows = found.has('signal_reward_catalog') ? await sql.query(`
  SELECT catalog_version,name,points_cost,fulfillment_type,option_snapshot
  FROM signal_reward_catalog WHERE item_key='bourbon_shipping_gift_card_100'
`) : [];
const caskersCatalog = caskersCatalogRows[0];
const invalidSignalCatalog = caskersCatalog
  && Number(caskersCatalog.catalog_version) === 2
  && caskersCatalog.name === '$100 Caskers gift card'
  && Number(caskersCatalog.points_cost) === 2600
  && caskersCatalog.fulfillment_type === 'digital'
  && caskersCatalog.option_snapshot?.partner === 'Caskers'
  ? []
  : ['bourbon_shipping_gift_card_100'];
const schemaProblems = [
  ...missing.map((table) => `table:${table}`),
  ...missingColumns.map((column) => `column:${column}`),
  ...invalidDefinitions.map((column) => `definition:${column}`),
  ...invalidFounderColumns.map((column) => `founder-column-definition:${column}`),
  ...missingIndexes.map((index) => `index:${index}`),
  ...invalidFounderIndexes.map((index) => `index-definition:${index}`),
  ...missingConstraints.map((constraint) => `constraint:${constraint}`),
  ...invalidFounderPrimaryKey.map((constraint) => `primary-key-definition:${constraint}`),
  ...invalidFounderConstraints.map((constraint) => `constraint-definition:${constraint}`),
  ...invalidReferralConstraints.map((name) => `constraint-definition:${name}`),
  ...invalidSignalConstraints.map((name) => `constraint-definition:${name}`),
  ...invalidReferralFunctions.map((name) => `function-definition:${name}`),
  ...invalidSignalTriggers.map((name) => `trigger-definition:${name}`),
  ...invalidSignalCatalog.map((name) => `catalog-definition:${name}`),
];
if (schemaProblems.length) {
  throw new Error(`Application storage schema is incomplete: ${schemaProblems.join(', ')}. Run npm run migrate:app-storage:apply.`);
}
console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'check', tables: [...found], indexes: [...availableIndexes] }));

export { splitSql };
