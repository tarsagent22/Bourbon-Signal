import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { readVerifiedRetailerPremisesBaseline, VERIFIED_RETAILER_PREMISES_BASELINE_SQL } from '../src/lib/retailer-premises-baseline.ts';
import { retailerSubmissionLifecycle } from '../src/lib/retailer-portal.ts';

const now = Date.parse('2026-10-23T08:36:00.000Z');
const liveStart = '2026-10-23T08:00:00.000Z', liveEnd = '2026-10-24T08:00:00.000Z';
const candidateSources = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-cohort-v2.json', import.meta.url), 'utf8')).sources;
let db: PGlite;
before(async () => { db = new PGlite(); await db.exec(await readFile(new URL('../src/lib/retailer-schema.sql', import.meta.url), 'utf8')); });
beforeEach(async () => { await db.exec('TRUNCATE retailer_submissions,retailer_stores,retailer_applications CASCADE'); });
after(async () => { await db.close(); });
async function application(id = 'CANARY_ACCOUNT', status = 'verified') {
  await db.query(`INSERT INTO retailer_applications(user_id,account_email,first_name,store_name,store_address,listed_phone,applicant_role,status,
    verification_contact,verified_by) VALUES($1,'CANARY_EMAIL','CANARY_FIRST','Public Store','12 Main Street Unit 2, Albany NY 12207','CANARY_PHONE','CANARY_ROLE',$2,'CANARY_CONTACT','CANARY_REVIEWER')`, [id, status]);
}
async function store({ id = 'primary:CANARY_ACCOUNT', user = 'CANARY_ACCOUNT', address = '12 Main Street Unit 2, Albany NY 12207', status = 'verified' } = {}) {
  await db.query(`INSERT INTO retailer_stores(id,user_id,store_name,store_address,listed_phone,website,status,updated_at)
    VALUES($1,$2,'Public Store',$3,'CANARY_PHONE','https://CANARY_WEBSITE.invalid/?CANARY_TOKEN',$4,'2026-10-23T07:00:00.000Z')`, [id, user, address, status]);
}
const payload = (overrides: Record<string, unknown> = {}) => ({ kind: 'bottle_drop', startsAt: liveStart, expiresAt: liveEnd, soldOutAt: '',
  bottleId: 'CANARY_BOTTLE', title: 'CANARY_TITLE', notes: 'CANARY_NOTES', price: 'CANARY_PRICE', locationDetails: 'CANARY_LOCATION', ...overrides });
async function submission({ id = 'CANARY_SUBMISSION', user = 'CANARY_ACCOUNT', storeId = 'primary:CANARY_ACCOUNT',
  address = '12 Main Street Unit 2, Albany NY 12207', status = 'reviewed', data = payload() } = {}) {
  await db.query(`INSERT INTO retailer_submissions(id,user_id,store_id,store_name,store_address,status,payload,created_at,reviewed_by)
    VALUES($1,$2,$3,'Public Store',$4,$5,$6::jsonb,'2026-10-23T07:30:00.000Z','CANARY_REVIEWER')`, [id, user, storeId, address, status, JSON.stringify(data)]);
}
async function seed() { await application(); await store(); }
async function read() {
  let calls = 0;
  const result = await readVerifiedRetailerPremisesBaseline({ query: async (text, params) => {
    calls++; assert.equal(text, VERIFIED_RETAILER_PREMISES_BASELINE_SQL); assert.equal(params, undefined);
    const output = await db.query(text);
    assert.doesNotMatch(JSON.stringify(output.rows), /CANARY_/u, 'Private values must not leave the real SQL projection');
    return output as any;
  } }, { now });
  assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(result), /CANARY_/u); return result;
}

test('one real bounded SQL statement returns public directory and live reporting without private primary/account/submission IDs', async () => {
  await seed(); await submission(); const result = await read();
  assert.equal(result.contractVersion, 'bourbon-signal/verified-retailer-premises-baseline@1');
  assert.equal(result.premises.length, 2);
  const directory = result.premises.find(row => row.kind === 'directory')!, inventory = result.premises.find(row => row.kind === 'inventory_report')!;
  assert.equal(directory.current, false); assert.equal(directory.directoryCurrent, true); assert.equal(directory.inventoryReported, false);
  assert.equal(inventory.current, true); assert.equal(inventory.lifecycle, 'live'); assert.equal(inventory.retained, false);
  assert.equal(inventory.physicalPremiseId, directory.physicalPremiseId); assert.match(String(inventory.physicalPremiseId), /^verified-retailer-premise:[a-f0-9]{64}$/);
  assert.equal(inventory.address, '12 Main Street Unit 2, Albany NY 12207'); assert.equal(inventory.state, 'NY'); assert.equal(inventory.zip, '12207');
  assert.equal(inventory.customerEligibilityProven, false); assert.equal(inventory.publicationObserved, false);
  assert.equal(result.completeness.currentlyVerifiedScopeComplete, true);
  assert.equal(result.completeness.historicalAbsenceProven, false); assert.equal(result.completeness.retainedHistoryComplete, false);
  assert.equal(result.completeness.publicationHistoryComplete, false); assert.equal(result.completeness.deletedOrRevokedHistoryIncluded, false);
  assert.match(result.provenance.premisesSha256, /^[a-f0-9]{64}$/); assert.equal(result.provenance.statementSha256,
    createHash('sha256').update(VERIFIED_RETAILER_PREMISES_BASELINE_SQL).digest('hex'));
  assert.doesNotMatch(VERIFIED_RETAILER_PREMISES_BASELINE_SQL, /SELECT\s+\*|submissions\.\*|stores\.\*|applications\.\*|\b(?:UPDATE|INSERT|DELETE|CALL)\b/iu);
});

test('both current verification authorities and exact same-owner store join are mandatory', async () => {
  await seed(); await application('CANARY_OTHER'); await store({ id: 'CANARY_OTHER_STORE', user: 'CANARY_OTHER' });
  await submission({ storeId: 'CANARY_OTHER_STORE' });
  assert.equal((await read()).premises.filter(row => row.origin === 'reviewed_submission').length, 0, 'Cross-owner store link must not inherit verification');
  await db.exec('TRUNCATE retailer_submissions'); await submission();
  for (const status of ['pending', 'rejected']) {
    await db.query('UPDATE retailer_applications SET status=$1 WHERE user_id=$2', [status, 'CANARY_ACCOUNT']);
    assert.equal((await read()).premises.some(row => row.origin === 'reviewed_submission'), false);
  }
  await db.query("UPDATE retailer_applications SET status='verified' WHERE user_id=$1", ['CANARY_ACCOUNT']);
  await db.query("UPDATE retailer_stores SET status='rejected' WHERE id=$1", ['primary:CANARY_ACCOUNT']);
  assert.equal((await read()).premises.some(row => row.origin === 'reviewed_submission'), false);
});

test('public premise hash and output remain stable under SQL ordering ties', async () => {
  await seed(); await submission(); await submission({ id: 'CANARY_EVENT', data: payload({ kind: 'lottery' }) });
  const raw = await db.query(VERIFIED_RETAILER_PREMISES_BASELINE_SQL);
  const first = await readVerifiedRetailerPremisesBaseline({ query: async () => raw as any }, { now });
  (raw.rows[0] as any).premises.reverse();
  const reversed = await readVerifiedRetailerPremisesBaseline({ query: async () => raw as any }, { now });
  assert.deepEqual(first.premises, reversed.premises); assert.equal(first.provenance.premisesSha256, reversed.provenance.premisesSha256);
});

test('unreviewed, rejected, unsupported and malformed payload rows cannot enter the public supplement', async () => {
  await seed();
  await submission({ id: 'CANARY_PENDING', status: 'pending_review' });
  await submission({ id: 'CANARY_REJECTED', status: 'rejected' });
  await submission({ id: 'CANARY_OTHER', data: payload({ kind: 'other' }) });
  await db.query(`INSERT INTO retailer_submissions(id,user_id,store_id,store_name,store_address,payload)
    VALUES('CANARY_ARRAY','CANARY_ACCOUNT','primary:CANARY_ACCOUNT','Public Store','12 Main Street Unit 2, Albany NY 12207','["CANARY_RAW"]')`);
  const result = await read(); assert.equal(result.premises.length, 1); assert.equal(result.premises[0].kind, 'directory');
  assert.ok(result.caveats.some(value => value.includes('rejected/unsupported')));
});

for (const [label, overrides] of [
  ['expired', { startsAt: '2026-10-22T08:00:00.000Z', expiresAt: '2026-10-23T08:00:00.000Z' }],
  ['sold out', { soldOutAt: '2026-10-23T08:10:00.000Z' }],
  ['expiry exactly now', { startsAt: '2026-10-23T08:00:00.000Z', expiresAt: '2026-10-23T08:36:00.000Z' }],
] as const) test(`real retained ${label} submission remains public premise context, never current`, async () => {
  await seed(); await submission({ data: payload(overrides) }); const result = await read();
  const row = result.premises.find(item => item.origin === 'reviewed_submission')!;
  assert.equal(row.current, false); assert.equal(row.retained, true); assert.equal(row.staleOrUnconfirmed, true);
  assert.equal(row.lifecycle, retailerSubmissionLifecycle(payload(overrides) as any, new Date(now)));
  assert.equal(row.soldOut, label === 'sold out');
});

test('upcoming availability and event kinds do not become current inventory', async () => {
  await seed(); await submission({ data: payload({ startsAt: '2026-10-23T09:00:00.000Z', expiresAt: '2026-10-24T09:00:00.000Z' }) });
  await submission({ id: 'CANARY_EVENT', data: payload({ kind: 'tasting' }) });
  await submission({ id: 'CANARY_LOTTERY', data: payload({ kind: 'lottery' }) });
  const rows = (await read()).premises.filter(row => row.origin === 'reviewed_submission');
  assert.equal(rows.length, 3); assert.ok(rows.every(row => row.current === false && row.retained === false));
  assert.equal(rows.find(row => row.submissionKind === 'bottle_drop')!.lifecycle, 'upcoming');
  assert.ok(rows.filter(row => row.kind === 'event').every(row => row.inventoryReported === false));
});

test('missing or JSON-null soldOutAt retains the public reader blank semantics', async () => {
  await seed();
  const missing = payload(); delete (missing as Record<string, unknown>).soldOutAt;
  await submission({ id: 'CANARY_MISSING', data: missing });
  await submission({ id: 'CANARY_NULL', data: payload({ soldOutAt: null }) });
  const rows = (await read()).premises.filter(row => row.origin === 'reviewed_submission');
  assert.ok(rows.length > 0); assert.ok(rows.every(row => row.current === true && row.soldOut === false));
});

test('malformed temporal JSON, impossible expiry and over24h windows become explicit retained gaps without unsafe casts', async () => {
  await seed();
  for (const [index, overrides] of [{ startsAt: { secret: 'CANARY_CLOCK' } }, { expiresAt: ['CANARY_CLOCK'] },
    { soldOutAt: { secret: 'CANARY_CLOCK' } }, { expiresAt: '2026-02-31T08:00:00.000Z' },
    { expiresAt: '2026-10-24T08:00:00.001Z' }, { expiresAt: '2026-10-24 08:00:00+00' }].entries()) {
    await submission({ id: `CANARY_BAD_${index}`, data: payload(overrides) });
  }
  const result = await read(), rows = result.premises.filter(row => row.origin === 'reviewed_submission');
  assert.ok(rows.length > 0); assert.ok(rows.every(row => row.current === false && row.retained === true));
  assert.ok(result.gaps.some(row => row.reason === 'submission_temporal_metadata_invalid')); assert.equal(result.completeness.currentlyVerifiedScopeComplete, false);
});

test('impossible availability start remains a retained temporal gap rather than a normalized current report', async () => {
  await seed();
  await submission({ data: payload({ startsAt: '2026-09-31T00:00:00.000Z', expiresAt: '2026-10-01T18:00:00.000Z' }) });
  const at = Date.parse('2026-10-01T12:00:00.000Z');
  await db.query("UPDATE retailer_submissions SET created_at='2026-10-01T07:00:00Z'");
  const result = await readVerifiedRetailerPremisesBaseline({ query: async text => await db.query(text) as any }, { now: at });
  const report = result.premises.find(row => row.kind === 'inventory_report')!;
  assert.equal(report.current, false); assert.equal(report.retained, true);
  assert.equal(report.availabilityStartsAt, null); assert.equal(report.expiresAt, null);
  assert.ok(result.gaps.some(row => row.reason === 'submission_temporal_metadata_invalid'));
  assert.equal(result.completeness.currentlyVerifiedScopeComplete, false);
});

test('original submitted premise remains separate after verified store relocation or unit/name changes', async () => {
  await seed(); await submission();
  await db.query("UPDATE retailer_stores SET store_address='88 New Avenue Unit 7, Albany NY 12207',store_name='Renamed Store' WHERE id=$1", ['primary:CANARY_ACCOUNT']);
  const result = await read(), inventory = result.premises.find(row => row.kind === 'inventory_report')!, directory = result.premises.find(row => row.kind === 'directory')!;
  assert.equal(inventory.address, '12 Main Street Unit 2, Albany NY 12207');
  assert.equal(inventory.currentStoreAddress, '88 New Avenue Unit 7, Albany NY 12207');
  assert.notEqual(inventory.physicalPremiseId, directory.physicalPremiseId); assert.equal(inventory.currentStorePhysicalPremiseId, directory.physicalPremiseId);
  assert.equal(inventory.current, false); assert.equal(inventory.retained, true); assert.equal(inventory.identityConflict, true);
  assert.ok(result.gaps.some(row => row.reason === 'submission_current_store_identity_conflict'));
});

for (const [label, first, second] of [
  ['unit range versus fraction', '12 Main Street Unit 1-2, Albany NY 12207', '12 Main Street Unit 1/2, Albany NY 12207'],
  ['house-number hyphen versus slash', '12-34 Main Street Unit 2, Albany NY 12207', '12/34 Main Street Unit 2, Albany NY 12207'],
  ['house-number hyphen versus space', '12-34 Main Street Unit 2, Albany NY 12207', '12 34 Main Street Unit 2, Albany NY 12207'],
] as const) {
  for (const [direction, original, current] of [['forward', first, second], ['reverse', second, first]] as const) {
    test(`real SQL preserves distinct ${label} identities: ${direction}`, async () => {
      await application(); await store({ address: current }); await submission({ address: original });
      const result = await read(), report = result.premises.find(row => row.kind === 'inventory_report')!, directory = result.premises.find(row => row.kind === 'directory')!;
      assert.equal(report.address, original); assert.equal(report.currentStoreAddress, current);
      assert.notEqual(report.physicalPremiseId, directory.physicalPremiseId, 'Distinct numeric/unit punctuation must not share a physical key');
      assert.equal(report.currentStorePhysicalPremiseId, directory.physicalPremiseId);
      assert.equal(report.identityConflict, true); assert.equal(report.current, false); assert.equal(report.retained, true);
      assert.equal(report.staleOrUnconfirmed, true);
      assert.ok(result.gaps.some(row => row.reason === 'submission_current_store_identity_conflict'));
    });
  }
}

test('same punctuated address stays current and case/whitespace folding preserves its physical identity', async () => {
  const address = '12-34 Main Street Unit 1/2, Albany NY 12207';
  await application(); await store({ address }); await submission({ address });
  const exact = await read(), report = exact.premises.find(row => row.kind === 'inventory_report')!, directory = exact.premises.find(row => row.kind === 'directory')!;
  assert.equal(report.current, true); assert.equal(report.identityConflict, false); assert.equal(report.retained, false);
  assert.equal(report.physicalPremiseId, directory.physicalPremiseId);
  await db.query('UPDATE retailer_stores SET store_address=$1', ['12-34   MAIN STREET Unit 1/2, Albany ny 12207']);
  const folded = (await read()).premises.find(row => row.kind === 'inventory_report')!;
  assert.equal(folded.current, true); assert.equal(folded.identityConflict, false);
  assert.equal(folded.physicalPremiseId, folded.currentStorePhysicalPremiseId);
  assert.equal(folded.physicalPremiseId, report.physicalPremiseId);
});

for (const address of ['NY12207', 'NY 12207', 'Albany NY12207', 'Albany NY 12207',
  'Unit100, Albany NY12207', 'Unit 100, Albany NY 12207', 'PO Box 100, Albany NY 12207',
  'P.O. Box 100, Albany NY 12207', '100 PO Box, Albany NY 12207', '100 Unit 2, Albany NY 12207']) {
  test(`incomplete street identity never creates a physical hash/current premise: ${address}`, async () => {
    await application(); await store({ address }); await submission({ address });
    const result = await read();
    assert.deepEqual(result.premises, [], 'Neither directory nor reviewed report may hash an unsupported street identity');
    assert.equal(result.completeness.currentlyVerifiedScopeComplete, false);
    assert.ok(result.gaps.some(row => row.reason === 'public_premise_identity_incomplete'));
    assert.equal(result.completeness.historicalAbsenceProven, false);
  });
}

test('an incomplete original or current store address never transfers inventory to the other identity', async () => {
  await seed(); await submission({ address: 'Albany NY 12207' });
  let result = await read(); assert.equal(result.premises.filter(row => row.kind === 'inventory_report').length, 0);
  assert.ok(result.gaps.some(row => row.reason === 'public_premise_identity_incomplete'));
  await db.exec('TRUNCATE retailer_submissions'); await submission();
  await db.query("UPDATE retailer_stores SET store_address='Unit 100, Albany NY 12207'");
  result = await read();
  const retained = result.premises.find(row => row.kind === 'inventory_report')!;
  assert.equal(retained.address, '12 Main Street Unit 2, Albany NY 12207');
  assert.equal(retained.current, false); assert.equal(retained.retained, true); assert.equal(retained.identityConflict, true);
  assert.equal(retained.currentStorePhysicalPremiseId, null);
  assert.ok(result.gaps.some(row => row.reason === 'public_premise_identity_incomplete'));
});

for (const [label, address] of [
  ['hyphenated Queens house number', '138-44 Queens Boulevard, Queens NY 11375'],
  ['numbered highway', '270 Hwy 17 N, North Myrtle Beach SC 29582'],
  ...candidateSources.map((source: any) => [source.id, source.stores[0].address]),
]) test(`supported exact street identity remains current: ${label}`, async () => {
  await application(); await store({ address }); await submission({ address });
  const result = await read(), report = result.premises.find(row => row.kind === 'inventory_report')!, directory = result.premises.find(row => row.kind === 'directory')!;
  assert.ok(report); assert.ok(directory); assert.equal(report.address, address);
  assert.equal(report.current, true); assert.equal(report.identityConflict, false);
  assert.equal(report.physicalPremiseId, directory.physicalPremiseId);
  assert.deepEqual(result.gaps, []); assert.equal(result.completeness.currentlyVerifiedScopeComplete, true);
});

test('over250 retained reviewed rows are not silently discarded by the live public-reader limit', async () => {
  await seed();
  await db.query(`INSERT INTO retailer_submissions(id,user_id,store_id,store_name,store_address,payload,created_at)
    SELECT 'CANARY_'||g,'CANARY_ACCOUNT','primary:CANARY_ACCOUNT','Public Store','12 Main Street Unit 2, Albany NY 12207',$1::jsonb,
      '2026-10-22T07:00:00Z'::timestamptz-g*interval '1 second' FROM generate_series(1,300) g`,
    [JSON.stringify(payload({ startsAt: '2026-10-22T08:00:00.000Z', expiresAt: '2026-10-23T08:00:00.000Z' }))]);
  const result = await read(); assert.equal(result.premises.filter(row => row.retained).length, 300);
});

test('combined directory/history sentinel fails closed rather than truncating into absence', async () => {
  await seed();
  await db.query(`INSERT INTO retailer_submissions(id,user_id,store_id,store_name,store_address,payload)
    SELECT 'CANARY_'||g,'CANARY_ACCOUNT','primary:CANARY_ACCOUNT','Public Store','12 Main Street Unit 2, Albany NY 12207',$1::jsonb
    FROM generate_series(1,10000) g`, [JSON.stringify(payload())]);
  let rows = 0;
  await assert.rejects(() => readVerifiedRetailerPremisesBaseline({ query: async text => {
    const result = await db.query(text); rows = (result.rows[0] as any).premises.length; return result as any;
  } }, { now }), /unavailable|bounds/u);
  assert.equal(rows, 10001, 'The global sentinel must include one directory plus10000 submissions');
});

test('empty success remains distinct from SQL/schema/byte-limit failure', async () => {
  const empty = await read(); assert.deepEqual(empty.premises, []); assert.equal(empty.completeness.currentlyVerifiedScopeComplete, true);
  assert.ok(empty.historyGaps.includes('deleted_submissions_unavailable'));
  assert.ok(empty.historyGaps.includes('revoked_or_unverified_history_excluded'));
  for (const rows of [[], [{}], [{ statement_at: 'invalid', premises: [] }], [{ statement_at: '2026-10-23 08:36:00+00', premises: 'bad' }],
    [{ statement_at: '2026-10-23 08:36:00+00', premises: [], extra: 'x'.repeat(2 * 1024 * 1024) }]]) {
    await assert.rejects(() => readVerifiedRetailerPremisesBaseline({ query: async () => ({ rows }) } as any, { now }));
  }
  await assert.rejects(() => readVerifiedRetailerPremisesBaseline({ query: async () => { throw new Error('CANARY_SQL_SECRET'); } }, { now }), error =>
    error instanceof Error && !error.message.includes('CANARY_'));
});

test('real SQL result expansion must also remain under the final sanitized byte limit', async () => {
  await seed();
  await db.query(`INSERT INTO retailer_submissions(id,user_id,store_id,store_name,store_address,payload,created_at)
    SELECT 'CANARY_'||g,'CANARY_ACCOUNT','primary:CANARY_ACCOUNT','Public Store','12 Main Street Unit 2, Albany NY 12207',$1::jsonb,
      '2026-10-23T07:00:00Z'::timestamptz-g*interval '1 second' FROM generate_series(1,4000) g`, [JSON.stringify(payload())]);
  const raw = await db.query(VERIFIED_RETAILER_PREMISES_BASELINE_SQL);
  assert.ok(Buffer.byteLength(JSON.stringify(raw.rows[0])) < 2 * 1024 * 1024, 'Raw projected SQL fits, isolating the final serialization guard');
  await assert.rejects(() => readVerifiedRetailerPremisesBaseline({ query: async () => raw as any }, { now }), /bounds|unavailable/u);
});

test('invalid public identity and future clocks stay gaps, and nested extras never escape projection', async () => {
  await seed(); await submission({ address: 'Unknown address without state and postcode' });
  let result = await read(); assert.equal(result.premises.length, 1); assert.equal(result.completeness.currentlyVerifiedScopeComplete, false);
  await db.exec('TRUNCATE retailer_submissions'); await submission();
  await db.query("UPDATE retailer_submissions SET created_at='2026-10-24T08:00:00Z'");
  result = await read(); assert.equal(result.premises.find(row => row.kind === 'inventory_report')!.current, false);
  assert.ok(result.gaps.some(row => row.reason === 'public_observation_clock_invalid'));
  const raw = await db.query(VERIFIED_RETAILER_PREMISES_BASELINE_SQL);
  (raw.rows[0] as any).premises[0].private = { userId: 'CANARY_USER' };
  const projected = await readVerifiedRetailerPremisesBaseline({ query: async () => raw as any }, { now });
  assert.doesNotMatch(JSON.stringify(projected), /CANARY_/u);
});
