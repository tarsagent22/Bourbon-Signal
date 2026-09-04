const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { moduleFrom, root, functions } = require('./astra-security-test-helpers.cjs');
const portal = moduleFrom('src/lib/retailer-portal.ts');
const feed = moduleFrom('src/lib/retailer-signal-feed.ts');
let db, repository;
const application = { storeName: 'Fixture Store A', storeAddress: '1 Fixture St, Raleigh, NC 27601', listedPhone: 'fixture-phone', website: '', applicantRole: 'Owner' };
const future = new Date('2026-09-05T12:00:00.000Z');
const submission = () => portal.normalizeRetailerSubmission({ kind: 'bottle_drop', storeId: 'primary:user_fixture', title: 'Fixture bottle' }, future).value;
before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(root, 'src/lib/retailer-schema.sql'), 'utf8'));
  const migration = path.join(root, 'src/lib/retailer-store-verification.sql');
  if (fs.existsSync(migration)) await db.exec(fs.readFileSync(migration, 'utf8'));
  const { RetailerRepository } = moduleFrom('src/lib/retailer-repository.ts', { '@neondatabase/serverless': { neon: () => ({ query: async (sql, params) => (await db.query(sql, params)).rows }) } });
  repository = new RetailerRepository('offline-only');
  await repository.upsertPendingApplication({ userId: 'user_fixture', email: 'fixture@example.invalid', application });
  await repository.updateApplicationStatus({ userId: 'user_fixture', status: 'verified', reviewedBy: 'owner_fixture', verificationMethod: 'public_phone', verificationContact: 'independently verified fixture' });
});
after(async () => db?.close());
test('F4 migration replay preserves existing verified stores and historical rows', async () => {
  await repository.createSubmission({ id: 'historical', userId: 'user_fixture', storeId: 'primary:user_fixture', submission: { ...submission(), startsAt: '2026-08-01T12:00:00.000Z', expiresAt: '2026-08-02T12:00:00.000Z' } });
  const before = await db.query('SELECT * FROM retailer_stores ORDER BY id');
  const history = await db.query('SELECT * FROM retailer_submissions ORDER BY id');
  const migration = fs.readFileSync(path.join(root, 'src/lib/retailer-store-verification.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM retailer_stores ORDER BY id')).rows, before.rows);
  assert.deepEqual((await db.query('SELECT * FROM retailer_submissions ORDER BY id')).rows, history.rows);
});
test('F4 admin renders a location-specific independent verification form', async () => {
  await repository.createStore({ id: 'ui_store', userId: 'user_fixture', store: { ...application, storeAddress: '3 Fixture St' } });
  const ReactDOMServer = require('react-dom/server');
  const { default: Administration } = moduleFrom('src/components/admin/RetailerAdministration.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/app/admin/retailers/actions': { verifyRetailerStore: function verifyRetailerStore() {} },
    '@/lib/retailer-repository': { getRetailerRepository: () => repository },
  });
  const html = ReactDOMServer.renderToStaticMarkup(await Administration({ retailers: [await repository.getApplication('user_fixture')], submissions: [] }));
  assert.match(html, /name="storeId" value="ui_store"/);
  assert.match(html, /name="expectedUpdatedAt"/);
});
test('F5 public repository rejects old overlong availability without deleting the record', async () => {
  await repository.createSubmission({ id: 'overlong', userId: 'user_fixture', storeId: 'primary:user_fixture', submission: submission() });
  await db.query("UPDATE retailer_submissions SET payload = jsonb_set(payload, '{expiresAt}', '\"2027-09-05T12:00:00.000Z\"') WHERE id = 'overlong'");
  const rows = await repository.listPublicSubmissions(future.toISOString());
  assert.equal(rows.some(row => row.id === 'overlong'), false);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM retailer_submissions WHERE id = 'overlong'")).rows[0].n, 1);
});
test('F4 verified account adding another location gets pending status and cannot publish', async () => {
  const store = await repository.createStore({ id: 'new_store', userId: 'user_fixture', store: { ...application, storeAddress: '2 Fixture St' } });
  assert.equal(store.status, 'pending');
  assert.equal(await repository.getStore({ userId: 'user_fixture', storeId: store.id }), null);
  assert.equal(await repository.createSubmission({ id: 'denied', userId: 'user_fixture', storeId: store.id, submission: submission() }), null);
});
test('F4 account re-verification cannot authorize pending or rejected additional locations', async () => {
  await db.query("UPDATE retailer_stores SET status = 'rejected' WHERE id = 'new_store'");
  await repository.updateApplicationStatus({ userId: 'user_fixture', status: 'verified', reviewedBy: 'owner_fixture', verificationMethod: 'public_phone', verificationContact: 'fixture' });
  const row = (await db.query("SELECT status FROM retailer_stores WHERE id = 'new_store'")).rows[0];
  assert.equal(row.status, 'rejected');
});
test('F4 public read excludes suspended location while retaining legitimate existing primary records', async () => {
  const created = await repository.createSubmission({ id: 'legitimate', userId: 'user_fixture', storeId: 'primary:user_fixture', submission: submission() });
  assert.ok(created);
  assert.equal((await repository.listPublicSubmissions(future.toISOString())).length, 1);
  await db.query("UPDATE retailer_stores SET status = 'rejected' WHERE id = 'primary:user_fixture'");
  assert.equal((await repository.listPublicSubmissions(future.toISOString())).length, 0);
  await db.query("UPDATE retailer_stores SET status = 'verified' WHERE id = 'primary:user_fixture'");
  assert.ok(await repository.getStore({ userId: 'user_fixture', storeId: 'primary:user_fixture' }));
});
test('F4 per-store verified decision requires evidence, owner binding and unchanged identity', async () => {
  assert.equal(typeof repository.updateStoreVerification, 'function');
  const input = { userId: 'user_fixture', storeId: 'new_store', status: 'verified', reviewedBy: 'owner_fixture', verificationMethod: 'public_phone', verificationContact: 'official fixture phone', expectedUpdatedAt: (await db.query("SELECT updated_at FROM retailer_stores WHERE id = 'new_store'")).rows[0].updated_at.toISOString() };
  assert.equal(await repository.updateStoreVerification({ ...input, verificationContact: '' }), null);
  assert.equal(await repository.updateStoreVerification({ ...input, userId: 'user_other' }), null);
  assert.equal(await repository.updateStoreVerification({ ...input, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }), null);
  assert.equal((await repository.updateStoreVerification(input)).status, 'verified');
  assert.ok(await repository.createSubmission({ id: 'new_verified', userId: 'user_fixture', storeId: 'new_store', submission: submission() }));
});
test('F5 scheduling rejects unsupported timezones instead of silently using Eastern', () => {
  assert.equal(portal.normalizeRetailerSubmission({ kind: 'bottle_drop', title: 'Fixture', storeId: 's', availabilityTiming: 'scheduled', startsAt: '2027-01-01T12:00', timeZone: 'Mars/Fixture' }, future).ok, false);
});
test('F5 server action uses selected store timezone rather than caller override', async () => {
  let submitted;
  const ctx = functions('src/app/retailers/portal/page.tsx', ['submitRetailerUpdate'], {
    auth: async () => ({ userId: 'user_fixture' }),
    getRetailerRepository: () => ({ getApplication: async () => ({ status: 'verified' }), getStore: async () => ({ storeAddress: application.storeAddress }), createSubmission: async data => { submitted = data.submission; return data; } }),
    normalizeRetailerSubmission: input => portal.normalizeRetailerSubmission(input, future),
    retailerTimeZoneNeedsChoice: () => false, inferRetailerTimeZone: () => 'America/New_York', randomUUID: () => 'fixture', revalidatePath: () => {}, redirect: path => { throw new Error(path); },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ storeId: 's', kind: 'bottle_drop', title: 'Fixture', availabilityTiming: 'scheduled', startsAt: '2027-01-01T12:00', timeZone: 'America/Los_Angeles' })) form.set(key, value);
  await assert.rejects(ctx.submitRetailerUpdate(form), /submitted=1/);
  assert.equal(submitted.startsAt, '2027-01-01T17:00:00.000Z');
});
test('F5 explicit availability exceeds 24 hours: reject, including scheduled fall-back day', () => {
  for (const kind of ['bottle_drop', 'barrel_pick']) {
    const result = portal.normalizeRetailerSubmission({ kind, title: 'Fixture', storeId: 's', expiresAt: '2027-09-05T12:00:00Z' }, future);
    assert.equal(result.ok, false);
    const scheduled = portal.normalizeRetailerSubmission({ kind, title: 'Fixture', storeId: 's', availabilityTiming: 'scheduled', startsAt: '2026-10-31T12:00', expiresAt: '2026-11-01T12:00', timeZone: 'America/New_York' }, future);
    assert.equal(scheduled.ok, false);
  }
});
test('F5 existing overlong/malformed windows cannot become live inventory or feed cards', () => {
  for (const overrides of [{ expiresAt: '2027-09-05T12:00:00.000Z' }, { startsAt: 'invalid' }, { expiresAt: 'invalid' }]) {
    const s = { ...submission(), ...overrides, storeName: 'Fixture', storeAddress: application.storeAddress, id: 'fixture' };
    assert.equal(portal.retailerSubmissionLifecycle(s, new Date('2026-09-07T12:00:00Z')), 'ended');
    assert.equal(feed.retailerSubmissionToDrop(s, new Date('2026-09-07T12:00:00Z')), null);
    assert.equal(feed.retailerSubmissionToFeedCard(s, new Date('2026-09-07T12:00:00Z')), null);
  }
});
test('F5 default and exactly 24h windows, spring-forward, scheduled and sold-out semantics', () => {
  const s = submission();
  assert.equal(s.expiresAt, '2026-09-06T12:00:00.000Z');
  assert.equal(portal.retailerSubmissionLifecycle(s, future), 'live');
  assert.equal(portal.retailerSubmissionLifecycle(s, new Date(s.expiresAt)), 'ended');
  assert.equal(portal.retailerSubmissionLifecycle({ ...s, soldOutAt: future.toISOString() }, future), 'ended');
  const scheduled = portal.normalizeRetailerSubmission({ kind: 'bottle_drop', storeId: 's', title: 'Fixture', availabilityTiming: 'scheduled', startsAt: '2027-03-13T12:00', expiresAt: '2027-03-14T12:00', timeZone: 'America/New_York' }, future);
  assert.equal(scheduled.ok, true);
  assert.equal(portal.retailerSubmissionLifecycle(scheduled.value, future), 'upcoming');
  assert.equal(feed.retailerSubmissionToDrop(scheduled.value, future), null);
  for (const kind of ['lottery', 'tasting']) assert.equal(portal.normalizeRetailerSubmission({ kind, storeId: 's', title: 'Fixture', expiresAt: '2027-09-05T12:00:00Z' }, future).ok, true);
});
test('F4 privileged verification requires verified primary email, not fallback/unverified address', async () => {
  for (const emails of [[{ id: 'primary', emailAddress: 'owner@fixture.invalid', verification: { status: 'unverified' } }], [{ id: 'other', emailAddress: 'owner@fixture.invalid', verification: { status: 'verified' } }]]) {
    const ctx = functions('src/app/admin/retailers/actions.ts', ['requireRetailerAdminAccess'], {
      auth: async () => ({ userId: 'user_owner' }), clerkClient: async () => ({ users: { getUser: async () => ({ primaryEmailAddressId: 'primary', emailAddresses: emails }) } }),
      primaryEmail: () => 'owner@fixture.invalid', isRetailerAdminEmail: email => email === 'owner@fixture.invalid',
      verifiedPrimaryClerkEmail: user => user.emailAddresses.find(e => e.id === user.primaryEmailAddressId && e.verification.status === 'verified')?.emailAddress || '',
      notFound: () => { throw new Error('denied'); },
    });
    await assert.rejects(ctx.requireRetailerAdminAccess(), /denied/);
  }
});
