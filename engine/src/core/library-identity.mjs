import { normalizeBottleName } from './bottle-name.mjs';

// Preserve expression words, numbers, finishes and proof across catalog consumers.
export function libraryIdentityKey(value) {
  return normalizeBottleName(value).toLowerCase().replace(/&/g, ' and ')
    .replace(/\b(\d{1,2})\s*(?:years? old|years?|yrs?|y)\b/g, '$1 year')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
