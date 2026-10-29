/** Display-only cleanup. Original names remain the identity for mute/watch actions. */
export function radarBottleLabel(raw: string) {
  const withoutNotice = raw.replace(/\s*\(limited quantities may be available in store\)\s*/gi, ' ').trim();
  const size = withoutNotice.match(/\s*[-–—]\s*(\d+(?:\.\d+)?\s*(?:ml|l))\s*$/i);
  const withoutSize = (size ? withoutNotice.slice(0, size.index) : withoutNotice).trim();
  const proof = withoutSize.match(/\s+(\d+(?:\.\d+)? Proof|Variable Proof)$/i);
  const withoutProof = (proof ? withoutSize.slice(0, proof.index) : withoutSize).trim();
  const name = withoutProof.replace(/\s+(?:Kentucky Straight Bourbon Whiskey|Straight Kentucky Bourbon Whiskey|Straight Bourbon Whiskey)$/i, '').trim();
  return {
    name: name || raw.trim() || 'Bottle report',
    size: size ? size[1].replace(/\s*(ml|l)$/i, (_, unit: string) => unit.toLowerCase() === 'ml' ? ' mL' : ' L') : null,
    proof: proof?.[1] || null,
  };
}

export function radarStoreAddress(storeLabel: string) {
  const parts = storeLabel.split(/\s[-–—]\s/);
  const address = parts.slice(1).join(' — ').trim();
  // Only offer directions when the report includes a street address.
  return /^\d+[\w-]*\s+\S/.test(address) ? address : null;
}

export function radarDirectionsUrl(storeLabel: string) {
  return radarStoreAddress(storeLabel)
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(storeLabel.replace(/\s[-–—]\s/, ', '))}`
    : null;
}
