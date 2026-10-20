import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMUNITY_TERMS_VERSION, currentLegalAcceptance, validLegalAgreement } from '../shared/legal-acceptance';
import { readLegalAcceptance, saveLegalAcceptance } from '../src/lib/legal-acceptance';

const now = '2026-10-19T23:00:00.000Z';
const user = () => ({ id: 'user_member', privateMetadata: {} as Record<string, unknown>, unsafeMetadata: {} as Record<string, unknown> });

test('only affirmative agreement to the current version is accepted', () => {
  for (const input of [null, {}, { accepted: false, termsVersion: COMMUNITY_TERMS_VERSION }, { accepted: 'true', termsVersion: COMMUNITY_TERMS_VERSION }, { accepted: true, termsVersion: 'old' }]) assert.equal(validLegalAgreement(input), false);
  assert.equal(validLegalAgreement({ accepted: true, termsVersion: COMMUNITY_TERMS_VERSION }), true);
});

test('existing members and stale signup assertions remain unaccepted', async () => {
  const member = user();
  const save = async () => { throw new Error('must not save without agreement'); };
  assert.equal(await readLegalAcceptance(member, save), null);
  member.unsafeMetadata.legalAgreement = { accepted: true, termsVersion: 'old' };
  assert.equal(await readLegalAcceptance(member, save), null);
  member.privateMetadata.legalAcceptance = { termsVersion: COMMUNITY_TERMS_VERSION, acceptedAt: 'invalid', source: 'community' };
  assert.equal(await readLegalAcceptance(member, save), null);
});

test('signup agreement records server time and only the owned private metadata key', async () => {
  const member = user();
  member.unsafeMetadata.legalAgreement = { accepted: true, termsVersion: COMMUNITY_TERMS_VERSION, acceptedAt: '1900-01-01', userId: 'someone_else' };
  const calls: unknown[] = [];
  const acceptance = await readLegalAcceptance(member, async (id, payload) => { calls.push({ id, payload }); }, now);
  assert.deepEqual(acceptance, { termsVersion: COMMUNITY_TERMS_VERSION, acceptedAt: now, source: 'signup' });
  assert.deepEqual(calls, [{ id: member.id, payload: { privateMetadata: { legalAcceptance: acceptance } } }]);
});

test('community acceptance survives repeated checks without rewriting the original time', async () => {
  const member = user();
  const accepted = await saveLegalAcceptance(member, async (_id, payload) => { Object.assign(member.privateMetadata, payload.privateMetadata); }, 'community', now);
  const noWrite = async () => { throw new Error('must not rewrite'); };
  assert.deepEqual(await readLegalAcceptance(member, noWrite), accepted);
  assert.deepEqual(await saveLegalAcceptance(member, noWrite, 'signup'), accepted);
  assert.equal(currentLegalAcceptance(member.privateMetadata.legalAcceptance)?.source, 'community');
});

test('failed persistence never reports success or fabricates acceptance', async () => {
  const member = user();
  const fail = async () => { throw new Error('provider unavailable'); };
  await assert.rejects(saveLegalAcceptance(member, fail, 'community', now), /provider unavailable/);
  assert.equal(currentLegalAcceptance(member.privateMetadata.legalAcceptance), null);
  member.unsafeMetadata.legalAgreement = { accepted: true, termsVersion: COMMUNITY_TERMS_VERSION };
  await assert.rejects(readLegalAcceptance(member, fail, now), /provider unavailable/);
});
