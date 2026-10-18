import { stripHtml } from '../core/text.mjs';

export const DURHAM_STORE_PRODUCTS = Object.freeze([
  { ncCode: '23449', names: ['Green River Full Proof Bourbon'], bibleId: 'bb_36be0a66004a60ba' },
  { ncCode: '18390', names: ['New Riff 8Y Bourbon', 'New Riff 8 Year Bourbon'], bibleId: 'bb_4e7a2ea067e741fd' },
].map(row => Object.freeze({ ...row, url: `https://www.durhamabc.com/products/${row.ncCode}` })));

const text = value => stripHtml(String(value || '').replace(/<!--[\s\S]*?-->/g, ' '))
  .replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

// Require one coherent product/table snapshot, including exact store premises.
// A parser failure is unavailable evidence, never a new out-of-stock report.
export function parseDurhamStoreInventory(html, sourceUrl) {
  const source = DURHAM_STORE_PRODUCTS.find(row => row.url === sourceUrl);
  if (!source || typeof html !== 'string' || Buffer.byteLength(html) > 2_000_000) return null;
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!source.names.includes(title)) return null;
  const header = text(html.slice(0, html.search(/<table\b/i)));
  if (header.match(/\bPLU\s+(\d+)\b/i)?.[1] !== source.ncCode || !/(?:^|[^\d.])0?\.75L\b/i.test(header)) return null;
  const price = Number(header.match(/\$([\d,]+\.\d{2})/)?.[1]?.replace(/,/g, ''));
  const counts = header.match(/Available at\s+(\d+)\s+of\s+(\d+)\s+stores/i);
  const total = header.match(/([\d,]+)\s+bottles total/i);
  if (!Number.isFinite(price) || price <= 0 || !counts || !total) return null;
  const table = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table || !/Store[\s\S]*Address[\s\S]*Availability[\s\S]*Directions/i.test(text(table.split(/<tbody/i)[0]))) return null;
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (body == null) return null;
  const stores = [];
  const seen = new Set();
  for (const match of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(row => row[1]);
    const storeNumber = cells[0]?.match(/href=["']\/stores\/(\d+)["']/i)?.[1];
    const inStock = match[1].match(/data-in-stock=["'](true|false)["']/i)?.[1];
    if (cells.length !== 6 || !storeNumber || seen.has(storeNumber) || !inStock) return null;
    seen.add(storeNumber);
    const streetBlock = cells[1].match(/<div\b[^>]*>([\s\S]*?)<\/div>/i);
    const street = text(streetBlock?.[1]);
    const locality = text(cells[1].replace(streetBlock?.[0] || '', '')).match(/^(.+?)\s*,?\s+NC\s+(\d{5}(?:-\d{4})?)$/);
    if (!/^\d+\s+\S/.test(street) || !locality || /warehouse|permittee|mixed beverage/i.test(text(cells.slice(0, 2).join(' ')))) return null;
    const availability = text(cells[4]);
    const qty = inStock === 'true' ? Number(availability.match(/^In Stock\s*\(\s*([\d,]+)\s*\)$/i)?.[1]?.replace(/,/g, ''))
      : /^Out of Stock$/i.test(availability) ? 0 : NaN;
    if (!Number.isSafeInteger(qty) || qty < 0 || (inStock === 'true' && qty === 0)) return null;
    let lat, lng;
    try {
      const link = new URL(cells[5].match(/href=["']([^"']+)["']/i)?.[1].replace(/&amp;/g, '&'));
      if (link.protocol !== 'https:' || link.hostname !== 'www.google.com' || link.pathname !== '/maps/dir/') return null;
      const coordinates = link.searchParams.get('destination')?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      lat = Number(coordinates?.[1]); lng = Number(coordinates?.[2]);
      if (!(lat >= 33.8 && lat <= 36.6 && lng >= -84.4 && lng <= -75.4)) return null;
    } catch { return null; }
    const city = locality[1].replace(/,\s*$/, '').trim();
    stores.push({ storeNumber, storeId: `nc-durham-${storeNumber}`, storeName: `Durham ABC Store #${storeNumber}`,
      street, city, state: 'NC', zip: locality[2], storeAddress: `${street}, ${city}, NC ${locality[2]}`,
      storeUrl: `https://www.durhamabc.com/stores/${storeNumber}`, lat, lng,
      reportedQuantity: qty, inStock: inStock === 'true' });
  }
  const reportedTotal = Number(total[1].replace(/,/g, ''));
  if (stores.length !== Number(counts[2]) || stores.filter(store => store.inStock).length !== Number(counts[1])
    || stores.reduce((sum, store) => sum + store.reportedQuantity, 0) !== reportedTotal) return null;
  return { ncCode: source.ncCode, productName: title, bibleId: source.bibleId, price, sizeMl: 750,
    sourceUrl, stores, reportedTotal };
}
