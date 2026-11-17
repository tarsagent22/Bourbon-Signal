export function shelfTagFields(text: string) {
  const prices = new Set<string>(), sizes = new Set<number>();
  for (const match of text.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d{1,5})(?:\.(\d{2}))?(?![\d.,])/g)) {
    const price = Number(match[1].replace(/,/g, '') + '.' + (match[2] || '00'));
    if (price > 0) prices.add(price.toFixed(2));
  }
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|cl|l(?:iters?|itres?)?)\b/gi)) {
    const unit = match[2].toLowerCase();
    const ml = Math.round(Number(match[1]) * (unit === 'ml' ? 1 : unit === 'cl' ? 10 : 1000));
    if (ml >= 50 && ml <= 6000) sizes.add(ml);
  }
  return { price: prices.size === 1 ? [...prices][0] : '', size: sizes.size === 1 ? String([...sizes][0]) : '' };
}

export function confirmedTag(price: string, size: string) {
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(price.trim()) || Number(price) < 1
      || !/^\d{2,4}$/.test(size.trim()) || Number(size) < 50 || Number(size) > 6000) return null;
  return { price: Number(price).toFixed(2), sizeMl: Number(size) };
}
