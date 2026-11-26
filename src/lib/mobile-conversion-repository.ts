import { createHash } from 'node:crypto';
import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import type { parseMobileConversion } from '../../shared/mobile-conversion';

type Event = NonNullable<ReturnType<typeof parseMobileConversion>>;
const STORE_PAID_PERIODS = `
  SELECT 'ios' AS platform, clerk_user_id AS user_id, original_transaction_id, ordered_event_at, expires_at
  FROM apple_membership_events WHERE environment='production' AND product_id='com.bourbonsignal.app.barrel.monthly'
    AND entitlement_status IN ('active','canceled_period_end') AND offer_state <> 'introductory_trial' AND expires_at IS NOT NULL
  UNION ALL
  SELECT 'android', clerk_user_id, original_transaction_id, ordered_event_at, expires_at
  FROM google_membership_events WHERE environment='production' AND product_id='com.bourbonsignal.app.barrel.monthly'
    AND entitlement_status IN ('active','canceled_period_end') AND offer_state <> 'introductory_trial' AND expires_at IS NOT NULL`;

export function isMobileConversionEnabled(platform: unknown, configured = process.env.MOBILE_CONVERSION_ENABLED_PLATFORMS || '') {
  return (platform === 'ios' || platform === 'android') && configured.split(',').some(value => value.trim() === platform);
}

export async function saveMobileConversion(input: Event, userId: string | null) {
  const sql = createProductionAlertQueueSqlExecutor();
  const key = createHash('sha256').update(input.installation).digest('hex');
  // Each installation contributes once per step and entry point. A subsequent
  // authenticated retry can attach a user to the same milestone, but can't move its clock.
  await sql.query(`INSERT INTO mobile_conversion_events (installation_hash,event,entry,platform,coverage,user_id,event_day)
    SELECT $1,$2,$3,$4,$5,$6,CASE WHEN $2='app_active' THEN (NOW() AT TIME ZONE 'UTC')::date ELSE '1970-01-01'::date END
    WHERE $6::text IS NULL OR NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$6)
    ON CONFLICT (installation_hash,event,entry,event_day) DO UPDATE SET
      user_id=COALESCE(mobile_conversion_events.user_id,EXCLUDED.user_id)
    WHERE mobile_conversion_events.user_id IS NULL AND EXCLUDED.user_id IS NOT NULL`,
    [key,input.event,input.entry,input.platform,input.coverage,userId]);
}

export async function readMobileConversion(sql = createProductionAlertQueueSqlExecutor()) {
  const [steps, paid, cohort, renewals] = await Promise.all([
    sql.query(`SELECT event,platform,entry,coverage,COUNT(DISTINCT installation_hash)::int AS installs
      FROM mobile_conversion_events WHERE event_at >= NOW()-INTERVAL '30 days' AND event <> 'app_active'
      GROUP BY event,platform,entry,coverage ORDER BY event,platform,entry,coverage`),
    sql.query(`WITH paid_periods AS (${STORE_PAID_PERIODS}), first_paid AS (
        SELECT platform,user_id,MIN(ordered_event_at) AS starts_at FROM paid_periods GROUP BY platform,user_id
      )
      SELECT platform, COUNT(*)::int AS accounts FROM first_paid
      WHERE starts_at >= NOW()-INTERVAL '30 days' GROUP BY platform`),
    sql.query(`WITH firsts AS (
        SELECT installation_hash, MIN(event_at) AS first_at
        FROM mobile_conversion_events WHERE event='first_open' AND event_at>=NOW()-INTERVAL '90 days' GROUP BY 1
      ), useful AS (
        SELECT installation_hash, MIN(event_at) AS useful_at FROM mobile_conversion_events
        WHERE event IN ('local_report_seen','bottle_saved','bottle_check_completed') GROUP BY 1
      ), activation AS (
        SELECT user_id, MIN(event_at) AS setup_at FROM mobile_conversion_events
        WHERE event='area_saved' AND user_id IS NOT NULL GROUP BY 1
      ), paid_periods AS (${STORE_PAID_PERIODS}), first_paid AS (
        SELECT user_id,MIN(ordered_event_at) AS starts_at FROM paid_periods GROUP BY user_id
      ), mature AS (
        SELECT a.user_id,a.setup_at FROM activation a
        WHERE a.setup_at BETWEEN NOW()-INTERVAL '90 days' AND NOW()-INTERVAL '35 days'
        AND NOT EXISTS (SELECT 1 FROM first_paid p WHERE p.user_id=a.user_id AND p.starts_at<a.setup_at)
      )
      SELECT
        (SELECT COUNT(*)::int FROM firsts WHERE first_at <= NOW()-INTERVAL '8 days') AS d7_mature,
        (SELECT COUNT(*)::int FROM firsts f WHERE first_at <= NOW()-INTERVAL '8 days'
          AND EXISTS (SELECT 1 FROM mobile_conversion_events v WHERE v.installation_hash=f.installation_hash
            AND v.event='app_active' AND v.event_day=(f.first_at AT TIME ZONE 'UTC')::date+7)) AS d7_returned,
        (SELECT ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (u.useful_at-f.first_at)))::numeric,1)
          FROM firsts f JOIN useful u USING (installation_hash)
          WHERE u.useful_at BETWEEN f.first_at AND f.first_at+INTERVAL '1 day') AS seconds_to_value,
        (SELECT COUNT(*)::int FROM mature) AS d35_mature,
        (SELECT COUNT(*)::int FROM mature m WHERE EXISTS (SELECT 1 FROM first_paid p WHERE p.user_id=m.user_id
          AND p.starts_at BETWEEN m.setup_at AND m.setup_at+INTERVAL '35 days')) AS d35_paid`),
    sql.query(`WITH paid_periods AS (${STORE_PAID_PERIODS}), initial AS (
        SELECT DISTINCT ON (platform,original_transaction_id) * FROM paid_periods
        ORDER BY platform,original_transaction_id,ordered_event_at,expires_at
      )
      SELECT f.platform, COUNT(*)::int AS mature,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM paid_periods n WHERE n.platform=f.platform AND n.original_transaction_id=f.original_transaction_id
            AND n.ordered_event_at>f.ordered_event_at AND n.ordered_event_at<=f.expires_at+INTERVAL '15 days'
            AND n.expires_at>=f.expires_at+INTERVAL '20 days'
        ))::int AS extended
      FROM initial f WHERE f.expires_at BETWEEN NOW()-INTERVAL '90 days' AND NOW()-INTERVAL '15 days'
      GROUP BY f.platform`),
  ]);
  const metrics = cohort.rows[0] || {};
  return {
    collecting: ['ios', 'android'].filter(platform => isMobileConversionEnabled(platform)),
    cohort: { d7Mature: Number(metrics.d7_mature || 0), d7Returned: Number(metrics.d7_returned || 0),
      secondsToValue: metrics.seconds_to_value == null ? null : Number(metrics.seconds_to_value),
      d35Mature: Number(metrics.d35_mature || 0), d35Paid: Number(metrics.d35_paid || 0) },
    steps: steps.rows.map(row => ({ event: String(row.event), platform: String(row.platform), entry: String(row.entry), coverage: String(row.coverage), installs: Number(row.installs) })),
    paid: paid.rows.map(row => ({ platform: String(row.platform), accounts: Number(row.accounts) })),
    renewals: renewals.rows.map(row => ({ platform: String(row.platform), mature: Number(row.mature), extended: Number(row.extended) })),
  };
}
