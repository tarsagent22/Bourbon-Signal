// Preserve the store's currency and non-zero fractions; omit whole-price zeroes.
export function membershipDisplayPrice(localizedPrice: string) {
  return localizedPrice.replace(/([.,])00(?=[^\d]*$)/, '');
}
