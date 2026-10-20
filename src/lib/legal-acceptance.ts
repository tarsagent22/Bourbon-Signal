import { COMMUNITY_TERMS_VERSION, currentLegalAcceptance, validLegalAgreement, type LegalAcceptance } from '../../shared/legal-acceptance';

type LegalUser = { id: string; privateMetadata?: Record<string, unknown>; unsafeMetadata?: Record<string, unknown> };
type SaveMetadata = (id: string, payload: { privateMetadata: { legalAcceptance: LegalAcceptance } }) => Promise<unknown>;

export async function readLegalAcceptance(user: LegalUser, save: SaveMetadata, now = new Date().toISOString()) {
  const existing = currentLegalAcceptance(user.privateMetadata?.legalAcceptance);
  if (existing) return existing;
  // Signup records the member's assertion, never a client-supplied acceptance time.
  if (!validLegalAgreement(user.unsafeMetadata?.legalAgreement)) return null;
  return saveLegalAcceptance(user, save, 'signup', now);
}

export async function saveLegalAcceptance(user: LegalUser, save: SaveMetadata, source: LegalAcceptance['source'], now = new Date().toISOString()) {
  const existing = currentLegalAcceptance(user.privateMetadata?.legalAcceptance);
  if (existing) return existing;
  if (!Number.isFinite(Date.parse(now))) throw new Error('A valid server acceptance time is required.');
  const acceptance: LegalAcceptance = { termsVersion: COMMUNITY_TERMS_VERSION, acceptedAt: now, source };
  // Only merge the owned private key; do not replay unrelated account metadata.
  await save(user.id, { privateMetadata: { legalAcceptance: acceptance } });
  return acceptance;
}
