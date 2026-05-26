import { BrowserPage, DEFAULT_CDP_URL, getOrCreateTarget, sleep, writeJson } from './core/browser-session.mjs';

const OUT_FILE = process.env.OR_OUT_FILE || 'out/browser/OR-product-availability.json';
const ZIP = process.env.OR_SEARCH_ZIP || '97205';
const TERMS = (process.env.OR_SEARCH_TERMS || "blanton,weller,eagle rare,taylor,stagg,old fitzgerald")
  .split(',').map((s) => s.trim()).filter(Boolean);

function parseProductRows(text) {
  const rows = [];
  const re = /(\d{11})\s+([0-9A-Z]+)\s+(.+?)\s+(DOMESTIC WHISKEY\|[^$]+?)\s+(\d+(?:\.\d+)?\s*(?:ML|L))\s+([0-9.]+)?\s*\$([0-9,.]+)\s+\$([0-9,.]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    rows.push({ newItemCode: m[1], itemCode: m[2], name: m[3].trim(), category: m[4].trim(), size: m[5], proof: Number(m[6] || 0) || null, casePrice: Number(m[7].replace(/,/g, '')) || null, bottlePrice: Number(m[8].replace(/,/g, '')) || null });
  }
  return rows;
}

function money(value) {
  const n = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isBourbonWhiskeyProduct(row) {
  return /BOURBON/i.test(String(row?.category || row?.name || '')) && !/RUM|GIN|VODKA|TEQUILA|SCOTCH/i.test(String(row?.category || ''));
}

function parseStoreRows(text) {
  const rows = [];
  const area = text.split(/Store No Location Address Zip Telephone Store Hours Qty Distance/i)[1]?.split(/Results Page|This liquor store|Oregon Liquor Search/i)[0] || '';
  const re = /(\d{4})\s+([A-Z][A-Z ]+?)\s+(.+?)\s+(\d{5})\s+(\d{3}-\d{3}-\d{4})\s+(.+?)\s+(\d+)\s+([0-9.]+)\s+Miles/gi;
  let m;
  while ((m = re.exec(area))) {
    rows.push({ storeNo: m[1], city: m[2].trim(), address: m[3].trim(), zip: m[4], phone: m[5], hours: m[6].trim(), quantity: Number(m[7]) || 0, distanceMiles: Number(m[8]) || null });
  }
  return rows;
}

async function submitSearch(page, product, zip = ZIP) {
  await page.navigate('https://www.oregonliquorsearch.com/', 1000);
  await page.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('input[type="submit"],button'));
    const age = buttons.find((el) => /21 or older/i.test(String(el.value || el.textContent || '')));
    if (age) age.click();
  })()`).catch(() => null);
  await sleep(500);
  await page.evaluate(`(() => {
    const product = document.querySelector('#product,[name=productSearchParam]');
    if (product) product.value = ${JSON.stringify(product)};
    const loc = document.querySelector('#location,[name=locationSearchParam]');
    if (loc) loc.value = ${JSON.stringify(zip)};
    const radius = document.querySelector('#radius,[name=radiusSearchParam]');
    if (radius) radius.value = '10';
    const form = document.forms[0];
    if (form) form.submit();
    return Boolean(form);
  })()`);
  await sleep(2800);
  const extracted = await page.extractPage();
  const structured = await page.evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('table tr')).map((tr) => Array.from(tr.children).map((td) => td.innerText.trim()).filter(Boolean));
    const productRows = rows
      .filter((cells) => /^\\d{11}$/.test(cells[0] || '') && /^[0-9A-Z]+$/.test(cells[1] || '') && cells.length >= 8)
      .map((cells) => ({
        newItemCode: cells[0],
        itemCode: cells[1],
        name: cells[2],
        category: cells[3],
        size: cells[4],
        proof: Number(cells[5]) || null,
        age: cells[6] || null,
        casePriceText: cells[7] || null,
        bottlePriceText: cells[8] || null
      }));
    const body = document.body.innerText;
    const itemMatch = body.match(/Item\\s+(\\d{11})\\(([^)]+)\\):\\s*([^\\n]+)/i);
    const detailProduct = itemMatch ? {
      newItemCode: itemMatch[1],
      itemCode: itemMatch[2],
      name: itemMatch[3].trim(),
      category: (body.match(/Category:\\s*([^\\n]+)/i)?.[1] || '').trim(),
      size: (body.match(/Size:\\s*([^\\n]+)/i)?.[1] || '').trim(),
      proof: Number(body.match(/Proof:\\s*([0-9.]+)/i)?.[1] || 0) || null,
      casePriceText: body.match(/Case Price:\\s*(\\$[0-9,.]+)/i)?.[1] || null,
      bottlePriceText: body.match(/Bottle Price:\\s*(\\$[0-9,.]+)/i)?.[1] || null
    } : null;
    const storeCards = Array.from(document.querySelectorAll('table')).map((t) => t.innerText).filter((txt) => /Store\\s+\\d{4}:/i.test(txt)).map((txt) => {
      const m = txt.match(/Store\\s+(\\d{4}):\\s*([^\\n]+)\\s+([0-9][^\\n]+)\\s+([A-Z][A-Z ]+),\\s*OR\\s*(\\d{5})\\s+(\\d{3}-\\d{3}-\\d{4})/i);
      return m ? { storeNo: m[1], storeName: m[2].trim(), address: m[3].trim(), city: m[4].trim(), zip: m[5], phone: m[6], quantity: null, distanceMiles: null } : null;
    }).filter(Boolean);
    return { productRows, detailProduct, storeCards };
  })()`);
  return { ...extracted, structured };
}

async function main() {
  const target = await getOrCreateTarget(DEFAULT_CDP_URL, 'oregonliquorsearch.com');
  const page = new BrowserPage(target.webSocketDebuggerUrl, { pageTimeoutMs: 50000 });
  await page.connect();
  const products = [];
  const productMap = new Map();
  const errors = [];
  try {
    for (const term of TERMS) {
      console.log(`OR search ${term}`);
      try {
        const result = await submitSearch(page, term);
        const productRows = (result.structured?.productRows || parseProductRows(result.text || '')).map((row) => ({ ...row, casePrice: money(row.casePriceText) ?? row.casePrice ?? null, bottlePrice: money(row.bottlePriceText) ?? row.bottlePrice ?? null })).filter(isBourbonWhiskeyProduct);
        const detailRows = [...parseStoreRows(result.text || ''), ...(result.structured?.storeCards || [])];
        if (detailRows.length) {
          const item = result.structured?.detailProduct || productRows[0] || { itemCode: term.toUpperCase(), name: term };
          if (!isBourbonWhiskeyProduct(item)) {
            console.log(`  skipped non-bourbon detail: ${item.name || item.itemCode}`);
            continue;
          }
          item.casePrice = money(item.casePriceText) ?? item.casePrice ?? null;
          item.bottlePrice = money(item.bottlePriceText) ?? item.bottlePrice ?? null;
          productMap.set(item.itemCode, { ...item, searchTerm: term, pageUrl: result.url, stores: detailRows });
          console.log(`  detail: ${item.itemCode} ${detailRows.length} stores`);
        } else {
          console.log(`  products: ${productRows.length}`);
          for (const row of productRows.slice(0, 4)) productMap.set(row.itemCode, { ...row, searchTerm: term, productListUrl: result.url, stores: [] });
        }
      } catch (error) {
        errors.push({ term, error: error.message });
        console.log(`  error: ${error.message}`);
      }
    }
    for (const row of Array.from(productMap.values())) {
      if (row.stores?.length) continue;
      try {
        const detail = await submitSearch(page, row.itemCode);
        row.pageUrl = detail.url;
        const detailProduct = detail.structured?.detailProduct;
        if (detailProduct) {
          if (!isBourbonWhiskeyProduct(detailProduct)) {
            row.stores = [];
            row.skipped = 'non_bourbon_detail';
            console.log(`  ${row.itemCode}: skipped non-bourbon detail`);
            continue;
          }
          row.name = detailProduct.name || row.name;
          row.category = detailProduct.category || row.category;
          row.size = detailProduct.size || row.size;
          row.proof = detailProduct.proof || row.proof;
          row.casePrice = money(detailProduct.casePriceText) ?? row.casePrice ?? null;
          row.bottlePrice = money(detailProduct.bottlePriceText) ?? row.bottlePrice ?? null;
        }
        row.stores = [...parseStoreRows(detail.text || ''), ...(detail.structured?.storeCards || [])];
        console.log(`  ${row.itemCode}: ${row.stores.length} stores`);
      } catch (error) {
        row.error = error.message;
      }
    }
    products.push(...productMap.values());
  } finally {
    page.close();
  }
  const payload = { generatedAt: new Date().toISOString(), zip: ZIP, terms: TERMS, productCount: products.length, storeRowCount: products.reduce((sum, p) => sum + (p.stores?.length || 0), 0), products, errors };
  await writeJson(OUT_FILE, payload);
  console.log(`Wrote ${OUT_FILE}: ${payload.productCount} products, ${payload.storeRowCount} store rows.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
