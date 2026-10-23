import { createHash } from 'node:crypto';
import type { SqlExecutor } from './alert-queue/postgres-repository';

type Row = Record<string, unknown>;
type Store = { id: string; name?: string; address?: string; city?: string; zip?: string; host?: string };
export type PremisesSourceRegistration = { id: string; state: string; kind?: string; expiryHours: number; disabled?: boolean;
  stores?: readonly Store[]; definition?: { store?: Store; stores?: readonly Store[]; host?: string } };
const MAX_HEADS = 100, MAX_PREMISES = 10_000, MAX_BYTES = 2 * 1024 * 1024;

// One MVCC statement. Internal JSON never leaves this projection. No user SQL,
// acquisition/finish/trace functions, customer tables or raw candidate payloads.
export const SOURCE_PREMISES_BASELINE_SQL = `WITH
poll AS MATERIALIZED (
 SELECT source_id,generation::text,accepted_at,last_reason,failures,projection,
   CASE WHEN jsonb_typeof(projection->'policyId')='string' THEN left(projection->>'policyId',181) END AS policy_id,
   projection IS NULL OR (jsonb_typeof(projection->'drops')='array'
     AND (projection->'episodeSeeds' IS NULL OR jsonb_typeof(projection->'episodeSeeds')='array')) AS shape_valid
 FROM source_poll_jobs ORDER BY source_id LIMIT 101
), lane AS MATERIALIZED (
 SELECT h.source_id,h.generation::text,h.revision::text,h.accepted_at,h.last_reason,h.failures,h.healthy,
   (SELECT b.policy_id FROM source_lane_batches b WHERE b.source_id=h.source_id AND b.revision=h.revision LIMIT 1) AS policy_id
 FROM source_lane_heads h ORDER BY h.source_id LIMIT 101
), head_rows AS (
 SELECT 'poll' AS storage,source_id,generation,NULL::text AS revision,accepted_at,last_reason,failures,
   NULL::boolean AS healthy,policy_id,COALESCE(shape_valid,false) AS shape_valid FROM poll
 UNION ALL
 SELECT 'lane',source_id,generation,revision,accepted_at,last_reason,failures,healthy,policy_id,true FROM lane
), source_rows AS (
 SELECT 'poll' AS storage,h.source_id,'poll_current' AS origin,d.value AS data,NULL::text AS subject_availability,false AS closed
 FROM poll h CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.projection->'drops')='array' THEN h.projection->'drops' ELSE '[]'::jsonb END) d
 UNION ALL
 SELECT 'poll',h.source_id,'poll_retained_seed',d.value,NULL::text,false
 FROM poll h CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.projection->'episodeSeeds')='array' THEN h.projection->'episodeSeeds' ELSE '[]'::jsonb END) d
 UNION ALL
 SELECT 'lane',s.source_id,'lane_current_subject',
   CASE WHEN jsonb_typeof(s.payload->'sourceDrop')='object' THEN s.payload->'sourceDrop' ELSE s.payload END,
   CASE WHEN jsonb_typeof(s.payload->'state')='string' THEN left(s.payload->>'state',241) END,false
 FROM source_lane_subjects s JOIN lane h USING(source_id)
 UNION ALL
 SELECT 'lane',o.source_id,'lane_retained_opportunity',
   CASE WHEN jsonb_typeof(o.payload->'sourceDrop')='object' THEN o.payload->'sourceDrop' ELSE o.payload END,NULL::text,o.closed
 FROM source_lane_opportunities o JOIN lane h USING(source_id)
), fields AS (
 SELECT storage,source_id,origin,subject_availability,closed,
   COALESCE(data->'stateCode',data->'state') AS state,
   COALESCE(data->'storeId',data->'store_id') AS store_id,
   COALESCE(data->'storeAddress',data->'store_address',data->'address') AS address,
   COALESCE(data->'storeName',data->'store_name',data->'locationName') AS name,
   COALESCE(data->'city',data->'storeCity') AS city,COALESCE(data->'zip',data->'postalCode') AS zip,
   COALESCE(data->'sourceChain',data->'source_chain') AS chain,
   COALESCE(data->'eventType',data->'type') AS event_type,
   COALESCE(data->'locationPrecision',data->'location_precision') AS precision,
   COALESCE(data->'lastConfirmedAt',data->'observedAt') AS observed_at,
   COALESCE(data->'availabilityStatus',data->'availability_status') AS availability,
   COALESCE(data->'sourceUrl',data->'source_url') AS source_url,
   data->'canAlertAsInventory'='true'::jsonb AS inventory_flag,
   data->'stale'='true'::jsonb OR data->'sourceStale'='true'::jsonb AS stale
 FROM source_rows ORDER BY source_id,origin LIMIT 10001
), public_rows AS (
 SELECT storage,source_id,origin,closed,subject_availability,
   CASE WHEN jsonb_typeof(state)='string' THEN left(state#>>'{}',241) END AS state,
   CASE WHEN jsonb_typeof(store_id)='string' THEN left(store_id#>>'{}',241) END AS store_id,
   CASE WHEN jsonb_typeof(address)='string' THEN left(address#>>'{}',241) END AS address,
   CASE WHEN jsonb_typeof(name)='string' THEN left(name#>>'{}',241) END AS name,
   CASE WHEN jsonb_typeof(city)='string' THEN left(city#>>'{}',241) END AS city,
   CASE WHEN jsonb_typeof(zip)='string' THEN left(zip#>>'{}',241) END AS zip,
   CASE WHEN jsonb_typeof(chain)='string' THEN left(chain#>>'{}',241) END AS chain,
   CASE WHEN jsonb_typeof(event_type)='string' THEN left(event_type#>>'{}',241) END AS event_type,
   CASE WHEN jsonb_typeof(precision)='string' THEN left(precision#>>'{}',241) END AS precision,
   CASE WHEN jsonb_typeof(observed_at)='string' THEN left(observed_at#>>'{}',241) END AS observed_at,
   CASE WHEN jsonb_typeof(availability)='string' THEN left(availability#>>'{}',241) END AS availability,
   CASE WHEN jsonb_typeof(source_url)='string' AND source_url#>>'{}' ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/|$)'
     THEN left(lower(split_part(split_part(source_url#>>'{}','/',3),':',1)),253) END AS source_host,
   COALESCE(inventory_flag,false) AS inventory_flag,COALESCE(stale,false) AS stale
 FROM fields
)
SELECT statement_timestamp()::text AS statement_at,
 COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY storage,source_id) FROM head_rows h),'[]'::jsonb) AS heads,
 COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY storage,source_id,origin,store_id) FROM public_rows p),'[]'::jsonb) AS premises`;

const clean = (value: unknown, maximum = 240) => typeof value === 'string' && value.length <= maximum
  && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : '';
const identity = (value: unknown) => { const text = clean(value, 180); return /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u.test(text) ? text : ''; };
const stamp = (value: unknown) => { const text = clean(value); const at = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : null; };
const integer = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && /^\d+$/u.test(value))
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const stateCode = (value: unknown) => { const text = clean(value); return /^[A-Z]{2}$/u.test(text) ? text : ''; };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,val]) => [key,canonical(val)])) : value;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const failure = () => new Error('Source premises baseline unavailable or outside reviewed bounds');

/** Public identity evidence, not feed eligibility or exhaustive historical absence. */
export async function readSourcePremisesBaseline(executor: SqlExecutor, { now = Date.now(), registry }: {
  now?: number; registry: readonly PremisesSourceRegistration[];
}) {
  if (!Number.isFinite(new Date(now).getTime()) || !Array.isArray(registry) || registry.length > 200) throw failure();
  const registered = new Map<string, PremisesSourceRegistration>();
  for (const source of registry) {
    if (!identity(source.id) || !stateCode(source.state) || !Number.isFinite(source.expiryHours) || source.expiryHours <= 0 || source.expiryHours > 168
      || source.disabled !== undefined && typeof source.disabled !== 'boolean' || registered.has(source.id)) throw failure();
    registered.set(source.id,source);
  }
  let response: Awaited<ReturnType<SqlExecutor['query']>>;
  try { response = await executor.query(SOURCE_PREMISES_BASELINE_SQL); } catch { throw failure(); }
  const result = Array.isArray(response?.rows) && response.rows.length === 1 ? response.rows[0] : null;
  if (!result || !Array.isArray(result.heads) || !Array.isArray(result.premises) || result.heads.length > MAX_HEADS * 2 || result.premises.length > MAX_PREMISES
    || Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw failure();
  const statementAt = stamp(result.statement_at); if (!statementAt) throw failure();
  const gaps: Array<{ sourceId: string | null; reason: string }> = [], headMap = new Map<string, Row>();
  let pollHeads = 0, laneHeads = 0;
  const heads = result.heads.map((raw: Row) => {
    const sourceId = identity(raw?.source_id), storage = raw?.storage;
    if (!sourceId || !['poll','lane'].includes(String(storage)) || integer(raw.generation) === null || integer(raw.failures) === null
      || storage === 'lane' && integer(raw.revision) === null || headMap.has(`${storage}:${sourceId}`)) throw failure();
    storage === 'poll' ? pollHeads++ : laneHeads++;
    const source = registered.get(sourceId), acceptedAt = stamp(raw.accepted_at);
    const reason = /^[a-z0-9_]{1,80}$/u.test(clean(raw.last_reason,80)) ? clean(raw.last_reason,80) : 'unclassified';
    const orphan = !source, disabled = source?.disabled === true, shapeValid = raw.shape_valid === true;
    const age = acceptedAt ? now - Date.parse(acceptedAt) : NaN;
    const policySnapshotId = identity(raw.policy_id) || null;
    const current = !!source && !disabled && shapeValid && policySnapshotId !== null && integer(raw.failures) === 0 && reason === 'accepted'
      && (storage !== 'lane' || raw.healthy === true) && age >= 0 && age <= source.expiryHours * 3600000;
    const head = { storage, sourceId, generation: integer(raw.generation), revision: storage === 'lane' ? integer(raw.revision) : null,
      acceptedAt, reason, failures: integer(raw.failures), policySnapshotId, orphan, disabled, current };
    headMap.set(`${storage}:${sourceId}`,head);
    if (orphan) gaps.push({sourceId,reason:'unregistered_source'});
    if (!shapeValid) gaps.push({sourceId,reason:'projection_schema_invalid'});
    return head;
  });
  if (pollHeads > MAX_HEADS || laneHeads > MAX_HEADS) throw failure();
  for (const source of registry) if (!source.disabled && !heads.some(head => head.sourceId === source.id)) gaps.push({sourceId:source.id,reason:'registered_source_missing_head'});
  const premises: Row[] = [];
  for (const raw of result.premises as Row[]) {
    const sourceId = identity(raw?.source_id), origin = clean(raw?.origin), storage = clean(raw?.storage);
    if (!sourceId || !['poll_current','poll_retained_seed','lane_current_subject','lane_retained_opportunity'].includes(origin)
      || !headMap.has(`${storage}:${sourceId}`) || (origin.startsWith('poll_') ? storage !== 'poll' : storage !== 'lane')) throw failure();
    const head = headMap.get(`${storage}:${sourceId}`)!, source = registered.get(sourceId), storeId = identity(raw.store_id);
    const stores = source?.stores || source?.definition?.stores || (source?.definition?.store ? [source.definition.store] : []);
    const store = storeId ? stores.find(item => item.id === storeId) : undefined;
    const conflictingStore = stores.length > 0 && !store;
    const rawState = stateCode(raw.state), state = rawState || source?.state || '';
    const invalidState = raw.state != null && !rawState && !(origin.startsWith('lane_') && ['available','unavailable'].includes(String(raw.state)));
    const address = clean(raw.address) || clean(store?.address), name = clean(raw.name) || clean(store?.name);
    if (!storeId || !stateCode(state) || !address) { gaps.push({sourceId,reason:'premise_identity_incomplete'}); continue; }
    const conflictingState = !!source && !!rawState && source.state !== rawState;
    if (conflictingState) gaps.push({sourceId,reason:'premise_state_conflict'});
    if (conflictingStore) gaps.push({sourceId,reason:'premise_store_unregistered'});
    if (invalidState) gaps.push({sourceId,reason:'premise_state_invalid'});
    const type = clean(raw.event_type).toLowerCase();
    const kind = /shipment|warehouse|purchase|lottery|release_event/u.test(type) ? 'intelligence'
      : /directory/u.test(type) ? 'directory' : /catalog/u.test(type) ? 'catalog'
      : /store_inventory|inventory_result/u.test(type) || raw.inventory_flag === true && raw.precision === 'store_level' || origin.startsWith('lane_') ? 'inventory' : 'catalog';
    const inventoryObserved = kind === 'inventory', observedAt = stamp(raw.observed_at), age = observedAt ? now - Date.parse(observedAt) : NaN;
    const negative = raw.subject_availability === 'unavailable' || raw.availability === 'out_of_stock';
    const positive = raw.availability === 'in_stock' || raw.subject_availability === 'available';
    const retained = origin === 'poll_retained_seed' || origin === 'lane_retained_opportunity';
    const current = !retained && !conflictingState && !conflictingStore && !invalidState && !!clean(raw.address) && head.current === true && inventoryObserved && !negative && positive
      && raw.inventory_flag === true && raw.stale !== true && Number.isFinite(age) && age >= 0 && !!source && age <= source.expiryHours * 3600000;
    const sourceHost = clean(raw.source_host,253).toLowerCase();
    premises.push({ sourceId, storage, origin, state, storeId, name: name || null, address, city: clean(raw.city) || clean(store?.city) || null,
      zip: clean(raw.zip) || clean(store?.zip) || null, sourceHost: /^[a-z0-9][a-z0-9.-]{0,252}$/u.test(sourceHost) ? sourceHost : null,
      sourceChain: identity(raw.chain) || null, observedAt, kind, inventoryObserved, current, staleOrUnconfirmed: inventoryObserved && !current,
      negative, retained, orphan: head.orphan, disabled: head.disabled, generation: head.generation, revision: head.revision,
      policySnapshotId: head.policySnapshotId, closed: origin === 'lane_retained_opportunity' ? raw.closed === true : null });
  }
  const unique = [...new Map(premises.map(row => [JSON.stringify(row),row])).values()];
  const uniqueGaps = [...new Map(gaps.map(row => [JSON.stringify(row),row])).values()];
  const provenance = { headsSha256: digest(heads), premisesSha256: digest(unique), registrySha256: digest(registry.map(source => ({ id:source.id,state:source.state,
    kind:source.kind || null,expiryHours:source.expiryHours,disabled:source.disabled === true,
    stores:(source.stores || source.definition?.stores || (source.definition?.store ? [source.definition.store] : [])).map((store:Store) => ({id:identity(store.id),
      name:clean(store.name),address:clean(store.address),city:clean(store.city),zip:clean(store.zip)})) }))),
    statementSha256: createHash('sha256').update(SOURCE_PREMISES_BASELINE_SQL).digest('hex') };
  const output = { contractVersion:'bourbon-signal/source-premises-baseline@1',capturedAt:new Date(now).toISOString(),statementAt,heads,premises:unique,gaps:uniqueGaps,provenance,
    completeness:{ currentHeadsComplete:!uniqueGaps.some(row => row.reason === 'registered_source_missing_head'), currentPremisesComplete:uniqueGaps.length === 0, historicalAbsenceProven:false,
      retainedHistoryComplete:false, verifiedRetailerPremisesIncluded:false },
    limits:{ headsPerStorage:MAX_HEADS,premiseRecords:MAX_PREMISES,responseBytes:MAX_BYTES },
    caveats:['Current is a conservative source classification, not customer feed eligibility or physical stock proof.',
      'Replaced poll projections and pruned/overwritten lane history are not an exhaustive historical census.',
      'Unknown or incomplete identities remain gaps; no missing match proves a new physical store.'] };
  if (Buffer.byteLength(JSON.stringify(output)) > MAX_BYTES) throw failure();
  return output;
}
