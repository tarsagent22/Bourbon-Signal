// Bump this only when members need to accept revised posting/license terms.
export const COMMUNITY_TERMS_VERSION = '2026-10-19-user-content-v1';
export const TERMS_URL = 'https://www.bourbonsignal.com/legal/terms';
export const PRIVACY_URL = 'https://www.bourbonsignal.com/legal/privacy';
export const PHOTO_PERMISSION_REMINDER = 'Only upload photos you took or have permission to share. By posting, you allow Bourbon Signal to display your photo under our Terms of Use. Inappropriate photos may be removed.';

export interface LegalAcceptance {
  termsVersion: string;
  acceptedAt: string;
  source: 'signup' | 'community';
}

export function currentLegalAcceptance(value: unknown): LegalAcceptance | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.termsVersion !== COMMUNITY_TERMS_VERSION || typeof record.acceptedAt !== 'string'
    || !Number.isFinite(Date.parse(record.acceptedAt)) || !['signup', 'community'].includes(String(record.source))) return null;
  return record as unknown as LegalAcceptance;
}

export function validLegalAgreement(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.accepted === true && record.termsVersion === COMMUNITY_TERMS_VERSION;
}
