import { neon } from '@neondatabase/serverless';
import path from 'node:path';
import { stableId } from '../engine/src/core/text.mjs';
import { readFile, writeFile } from 'node:fs/promises';

// One row per on-site delivery. Check repeated identity within each recipient before sampling.
const sql = neon(process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL);
const rows = await sql.query(`
  with cohort as (
    select id, delivered_at, payload, user_id, stable_match_key, payload->>'state' as state,
      payload->'memberAlert' as alert
    from alert_candidates
    where status='delivered' and channel='onSite' and delivered_at >= $1::timestamptz - interval '30 days'
      and delivered_at <= $1::timestamptz and payload->>'state' in ('AZ','IL','NC')
  ), occurrences as (
    select *, count(*) over(partition by user_id,stable_match_key order by delivered_at,id) as occurrence
    from cohort
  ), deliveries as (
    select state, user_id, coalesce(alert->>'id',id::text) as delivery,
      min(id::text) as id, max(delivered_at) as delivered_at, max(occurrence) as occurrence,
      (array_agg(alert order by id))[1] as alert, array_agg(distinct payload->>'bottle') as bottles,
      (array_agg(payload order by id))[1] as payload
    from occurrences group by state,user_id,coalesce(alert->>'id',id::text)
  ), ranked as (
    select *, row_number() over(partition by state order by delivered_at desc,id) as rank from deliveries
  )
  select state, delivered_at, occurrence, bottles, alert->'bottleNames' as shown_bottles, payload->>'location' as location,
    alert->>'signalId' as report, alert->>'signalAt' as observed, alert->>'storeLabel' as shown_location,
    alert->>'bottleName' as shown_bottle, alert->>'eventType' as event, alert->>'freshnessLimitHours' as hours
  from ranked where rank <= case when state='AZ' then 20 else 15 end order by state, rank
`, [process.argv[2] || new Date().toISOString()]);
const archive = new Map();
if (process.argv[4]) for (const state of ['AZ','IL','NC']) {
  let snapshot;
  try { snapshot = JSON.parse(await readFile(path.join(process.argv[4], 'site','states',state,'drops.json'),'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const drop of snapshot.drops) {
    const keys = [drop.id, stableId(['regional_watch_alert',drop.id || drop.state,drop.canonicalId || drop.bottleName,drop.locationName,drop.quantity || 0,drop.warehouseQty || 0]),
      stableId(['current_inventory_alert',drop.id || drop.state,drop.canonicalId || drop.bottleName,drop.storeId || drop.locationName,drop.quantity || 0,drop.availabilityStatus || ''])];
    if (drop.availabilityEpisodeId) keys.push(stableId(['current_inventory_alert','availability-episode:'+drop.availabilityEpisodeId]));
    for (const key of keys) archive.set(state + ':' + key, { run: snapshot.runId, rawName: drop.rawName, bottle: drop.canonicalName || drop.bottleName,
      address:drop.storeAddress, store:drop.storeName, observed:drop.observedAt, id:drop.id, source:drop.sourceUrl });
  }
}
const checked = [];
const details = new Map();
for (const row of rows) {
  const age = row.observed ? (Date.parse(row.delivered_at) - Date.parse(row.observed)) / 3600000 : NaN;
  let report = null;
  if (row.report && !details.has(row.report)) {
    try {
      const response = await fetch('https://www.bourbonsignal.com/api/v1/signals/' + encodeURIComponent(row.report), { signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      const signal = data.signal;
      details.set(row.report, { status: response.status, name: signal?.bottle?.name, store: signal?.location?.store?.name,
        scope: signal?.location?.scope, observed: signal?.timing?.displayAt });
    } catch { details.set(row.report, { status: 'unavailable' }); }
  }
  if (row.report) report = details.get(row.report);
  const rawId = row.report?.split(':').slice(1).join(':');
  const archived = archive.get(row.state + ':' + rawId);
  checked.push({ ...row, reportDetail: report, archived: archived || null, repeatWithinWindow: Number(row.occurrence) > 1,
    freshnessAtDelivery: !Number.isFinite(age) || !(Number(row.hours) > 0) ? 'unknown' : age < 0 || age > Number(row.hours) ? 'outside' : 'within' });
}
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(checked,null,2));
const tally = fn => Object.fromEntries([...new Set(checked.map(fn))].map(key => [key,checked.filter(row => fn(row)===key).length]));
console.log(JSON.stringify({ count: checked.length, states: tally(row=>row.state), events:tally(row=>row.event),
  reportStatus: tally(row=>row.reportDetail?.status ?? 'no link'), freshness: tally(row=>row.freshnessAtDelivery),
  repeated:checked.filter(row=>row.repeatWithinWindow).length, archiveMatches:checked.filter(row=>row.archived).length, childMissingFromSummary:checked.filter(row=>row.bottles.some(name=>!(row.shown_bottles || [row.shown_bottle]).includes(name))).length },null,2));
