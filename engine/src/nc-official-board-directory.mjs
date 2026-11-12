export const NC_STORE_LOCATOR_URL = 'https://abc2.nc.gov/Search/ABCStoreLocator';

export const STANLEY_ABC_BOARD = {
  sourceId: '261',
  label: 'Stanley ABC Board',
  sourceUrl: 'https://abc2.nc.gov/Districts/Board/261',
};

export function stanleyDirectoryHasNoRetailStores(html) {
  return /<h2\b[^>]*>\s*ABC Board Directory\s*<\/h2>/i.test(html)
    && /<h6\b[^>]*>\s*<u>\s*Stanley ABC Board\s*<\/u>\s*<\/h6>/i.test(html)
    && /<label\b[^>]*for="RetailSalesDate"[^>]*>[^<]*<\/label>:\s*<\/div>\s*<div\b[^>]*>\s*<\/div>/i.test(html)
    && !/>\s*Store Address\s*</i.test(html);
}

export function ncOfficialBoardSourceId(row) {
  const notes = String(row?.notes || '');
  if (row?.sourceUrl === NC_STORE_LOCATOR_URL) return notes.match(/\bboard option id\s+(\d+)\b/i)?.[1] || null;
  if (row?.sourceUrl === STANLEY_ABC_BOARD.sourceUrl && row.name === STANLEY_ABC_BOARD.label
    && /\bboard id 261\b/i.test(notes)) return STANLEY_ABC_BOARD.sourceId;
  return null;
}
