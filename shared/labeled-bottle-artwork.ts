import data from './labeled-bottle-artwork-registry.json';
import captions from './labeled-bottle-artwork-captions.json';
import { standardBottleIdentity } from './standard-bottle-identity';
import { cleanRetailerBottleName } from './retailer-bottle-name.mjs';
import { parsePhotoRegistry, resolveBottlePhoto, type PhotoIdentity, type CatalogIdentity } from '../apps/mobile/src/bottle-photos/registry';

// Use illustrated expressions, with a separate fallback for explicitly marked picks.
export const LABELED_BOTTLE_ARTWORK = parsePhotoRegistry(data)!;
if (!LABELED_BOTTLE_ARTWORK) throw new Error('Invalid labeled bottle artwork registry');

const elijahCraigToastedPick = /^Elijah Craig Barrel Proof(?: Bourbon)? Single Toasted Barrel\s*#\s*\d+(?:\s+(?:Women of )?Binny['’]s Handpicked)?$/i;
const elijahCraigPrivatePick = /^Elijah Craig Barrel Proof(?: Bourbon)? Single Barrel\s*#\s*\d+(?:\s+Binny['’]s Handpicked)?$/i;
const binnysPickSuffix = /\s+(?:[-–—·]\s+)?(?:Women of )?Binny['’]s Handpicked$/i;
const pickMarker = String.raw`(?:hand[ -]?picked|(?:store|barrel|private barrel) pick)(?:\s*#\s*[a-z0-9-]+)?`;
const pickSuffix = new RegExp(String.raw`\s+(?:\(${pickMarker}\)|${pickMarker})$`, 'i');
const numberedSingleBarrel = /(\bSingle Barrel)\s*#\s*[a-z0-9-]+$/i;

function pickArtworkName(name: string): string | undefined {
  const title = cleanRetailerBottleName(name);
  // The producer identifies the toasted private picks with the Toasted Barrel
  // expression. Straight private barrel picks use their own existing artwork.
  if (elijahCraigToastedPick.test(title)) return 'Elijah Craig Toasted Barrel';
  if (elijahCraigPrivatePick.test(title)) return 'Elijah Craig Private Barrel Barrel Proof';
  const base = cleanRetailerBottleName(title
    .replace(binnysPickSuffix, '')
    .replace(pickSuffix, '')
    .replace(numberedSingleBarrel, '$1'));
  return base !== title ? base : undefined;
}

export function resolveLabeledBottleArtwork(identity: PhotoIdentity, catalog: readonly CatalogIdentity[] = []) {
  const bottleId = identity.bottleId?.replace(/^bible-/, '');
  const exact = resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {...identity, bottleId}, catalog);
  if (exact || !identity.bottleName) return exact;
  const standard = standardBottleIdentity(identity.bottleName, bottleId);
  if (standard) {
    const compatible = resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {...identity, bottleId, bottleName:standard.name}, catalog);
    if (!compatible) return undefined;
    const canonical = resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {bottleId:standard.id, bottleName:standard.name}, catalog);
    return canonical?.sha256 === compatible.sha256 ? canonical : compatible;
  }
  // Retailer variants append package volume, sometimes twice. Remove only a
  // trailing volume; ages, proofs, finishes and expression names stay intact.
  const bottleName = identity.bottleName.replace(/(?:\s+(?:[-–—·]\s*)?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:ml|lt|l))+\s*$/i, '').trim();
  if (bottleName !== identity.bottleName) {
    const withoutVolume = resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {...identity, bottleId, bottleName}, catalog);
    if (withoutVolume) return withoutVolume;
  }
  const pickName = pickArtworkName(bottleName);
  if (!pickName) return undefined;
  const base = standardBottleIdentity(pickName);
  if (!base) return undefined;
  const compatible = resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {bottleId, bottleName:base.name}, catalog);
  if (compatible || base.id !== 'elijah-craig-toasted-barrel') return compatible;
  // Both reviewed Elijah Craig toasted expressions use the same base image.
  return resolveBottlePhoto(LABELED_BOTTLE_ARTWORK, {bottleId, bottleName:'Elijah Craig Toasted Barrel Private Barrel'}, catalog);
}

export function labeledArtworkCaption(catalogId: string): string | undefined {
  return (captions as Record<string, string>)[catalogId];
}
