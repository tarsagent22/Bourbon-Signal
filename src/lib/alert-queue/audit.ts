import { neon } from "@neondatabase/serverless";
import { alertQueueConnectionString } from "@/lib/alert-queue/runtime";

const zero = { onSite: 0, email: 0, sms: 0 };
export type AlertQueueAuditHealth = {
  status: "ok" | "unavailable" | "error";
  queueModeActive: boolean;
  windowStart: string;
  windowEnd: string;
  deliveredRows: number;
  uniqueRecipients: number;
  channelCounts: typeof zero;
  repeatedIdentityGroups: number;
  repeatedPayloadGroups: number;
  repeatedUnderlyingBottleGroups: number;
  latestDeliveryAt: string | null;
  latestRepeatedUnderlyingBottleAt: string | null;
  note?: string;
};
function utcDayWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

function base(status: AlertQueueAuditHealth["status"], active: boolean, windowStart: string, windowEnd: string) {
  return { status, queueModeActive: active, windowStart, windowEnd, deliveredRows: 0, uniqueRecipients: 0,
    channelCounts: { ...zero }, repeatedIdentityGroups: 0, repeatedPayloadGroups: 0, repeatedUnderlyingBottleGroups: 0,
    latestDeliveryAt: null, latestRepeatedUnderlyingBottleAt: null };
}

function timestamp(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
export async function readAlertQueueAuditHealth(options: {
  now?: Date;
  env?: NodeJS.ProcessEnv;
  query?: ReturnType<typeof neon>;
} = {}): Promise<AlertQueueAuditHealth> {
  const env = options.env || process.env;
  const { windowStart, windowEnd } = utcDayWindow(options.now);
  const active = env.ALERT_QUEUE_MODE === "active";
  const url = alertQueueConnectionString(env);
  if (!active || !url) return { ...base("unavailable", active, windowStart, windowEnd), note: !active ? "queue_not_active" : "queue_database_unavailable" };
  try {
    const sql = options.query || neon(url);
    await sql.query(
      "create index concurrently if not exists alert_candidates_delivered_audit_idx on alert_candidates (delivered_at) where status = 'delivered'",
      [],
      { fetchOptions: { signal: AbortSignal.timeout(10_000) } },
    );
    const rows = await sql.query(`
      with delivered as materialized (
        select user_id, channel, stable_match_key, provider_message_id, payload, delivered_at
        from alert_candidates
        where status = 'delivered'
          and delivered_at >= $1::timestamptz
          and delivered_at < $2::timestamptz
      ), repeated_identities as (
        select user_id, channel, stable_match_key from delivered
        group by user_id, channel, stable_match_key having count(*) > 1
      ),
      repeated_payloads as (
        select user_id, channel, payload->>'bottle' as bottle, payload->>'location' as location
        from delivered
        where nullif(payload->>'bottle', '') is not null and nullif(payload->>'location', '') is not null
        group by user_id, channel, payload->>'bottle', payload->>'location'
        having count(distinct coalesce(provider_message_id, stable_match_key)) > 1
      ), bottle_tokens as (
        select user_id, channel, payload->>'location' as location,
          lower(trim(token)) as bottle_token, coalesce(provider_message_id, stable_match_key) as delivery_id,
          delivered_at
        from delivered cross join lateral regexp_split_to_table(
          payload->>'bottle', E'\\s*(?:,\\s*(?:and\\s+)?|\\sand\\s)\\s*'
        ) as token
        where nullif(payload->>'location', '') is not null and nullif(trim(token), '') is not null
      ), repeated_underlying_bottles as (
        select user_id, channel, location, bottle_token, max(delivered_at) as latest_repeated_underlying_bottle_at from bottle_tokens
        group by user_id, channel, location, bottle_token
        having count(distinct delivery_id) > 1
      )
      select count(*) as delivered_rows, count(distinct user_id) as unique_recipients,
        count(*) filter (where channel = 'onSite') as onsite_count,
        count(*) filter (where channel = 'email') as email_count,
        count(*) filter (where channel = 'sms') as sms_count,
        (select count(*) from repeated_identities) as repeated_identity_groups,
        (select count(*) from repeated_payloads) as repeated_payload_groups,
        (select count(*) from repeated_underlying_bottles) as repeated_underlying_bottle_groups,
        max(delivered_at) as latest_delivery_at,
        (select max(latest_repeated_underlying_bottle_at) from repeated_underlying_bottles) as latest_repeated_underlying_bottle_at
      from delivered
    `, [windowStart, windowEnd], { fetchOptions: { signal: AbortSignal.timeout(2_000) } }) as Array<Record<string, unknown>>;
    const row = rows[0] || {};
    return {
      ...base("ok", true, windowStart, windowEnd),
      deliveredRows: Number(row.delivered_rows || 0),
      uniqueRecipients: Number(row.unique_recipients || 0),
      channelCounts: { onSite: Number(row.onsite_count || 0), email: Number(row.email_count || 0), sms: Number(row.sms_count || 0) },
      repeatedIdentityGroups: Number(row.repeated_identity_groups || 0),
      repeatedPayloadGroups: Number(row.repeated_payload_groups || 0),
      repeatedUnderlyingBottleGroups: Number(row.repeated_underlying_bottle_groups || 0),
      latestDeliveryAt: timestamp(row.latest_delivery_at),
      latestRepeatedUnderlyingBottleAt: timestamp(row.latest_repeated_underlying_bottle_at),
    };
  } catch {
    return { ...base("error", true, windowStart, windowEnd), note: "aggregate_query_failed" };
  }
}
