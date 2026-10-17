export interface BottleProfile {
  id: string;
  name: string;
  producer: string | null;
  category: string;
  proof: number | null;
  age: string | null;
  msrp: number | null;
  rarity: { label: string; tier: string; pending: boolean; reviewedAt: string | null };
  marketRarity?: { state: string; tier: string; label: string; reason: string; reviewedAt: string; sources: { label: string; url: string }[] } | null;
}

export function compareBottlePrice(input: string, msrp: number | null) {
  const text = input.trim().replace(/^\$\s*/, '');
  if (!text) return { kind: 'empty' as const };
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) return { kind: 'invalid' as const };
  const price = Number(text);
  if (msrp == null || !Number.isFinite(msrp) || msrp <= 0) return { kind: 'unpriced' as const, price };
  const percent = ((price - msrp) / msrp) * 100;
  return { kind: 'compared' as const, price, percent, difference: price - msrp,
    label: Math.abs(percent) < 0.5 ? 'At MSRP' : `${Math.abs(percent) < 1 ? 'Less than 1' : Math.round(Math.abs(percent))}% ${percent > 0 ? 'above' : 'below'} MSRP` };
}
