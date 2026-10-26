import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { collectUtah } from '../src/collectors/precision-probes.mjs';

test('Utah keeps a stable baseline and rotates library queries and detail slots within its request cap', async () => {
  const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
  const cursorDir = await mkdtemp(path.join(os.tmpdir(), 'utah-library-retrieval-'));
  const byTerm = new Map();
  const byCode = new Map();
  let nextCode = 100000;
  let requests = [];
  const fetcher = async (url, options = {}) => {
    let payload;
    if (url.includes('/GetItemsForTerm?')) {
      const term = new URL(url).searchParams.get('term');
      if (!byTerm.has(term)) {
        const items = Array.from({ length: 7 }, () => ({ name: term, code: String(nextCode++) }));
        byTerm.set(term, items);
        for (const item of items) byCode.set(item.code, item);
      }
      requests.push({ term }); payload = byTerm.get(term);
    } else {
      const code = new URLSearchParams(options.body).get('item_code');
      assert(byCode.has(code)); requests.push({ code });
      payload = { data: [{ name: byCode.get(code).name, sku: code, storeQty: 5, warehouseQty: 3, bottlePrice: 49.99, status: 'Available' }] };
    }
    return { ok: true, status: 200, text: JSON.stringify(payload) };
  };
  const cohorts = [];
  try {
    for (let run = 0; run < 2; run++) {
      requests = [];
      const result = await collectUtah({ id: 'UT' }, bible, { fetcher, cursorDir });
      const queries = requests.filter(r => r.term).map(r => r.term);
      assert.equal(queries.length, 11);
      assert.deepEqual(queries.slice(0, 5), ['Elijah Craig', 'Michter', 'Buffalo Trace', 'Willett', 'Weller']);
      assert(requests.length <= 55);
      assert.equal(result.roadblocks.length, 0);
      assert.equal(result.signals.length, 44);
      assert(result.signals.every(row => row.eventType === 'board_inventory_aggregate'
        && row.quantity === null && row.canAlertAsInventory === false && row.canAlertAsWatch === false));
      cohorts.push({ queries, codes: requests.filter(r => r.code).map(r => r.code) });
    }
    assert.notDeepEqual(cohorts[0].queries.slice(5), cohorts[1].queries.slice(5));
    const firstCoreCodes = new Set(byTerm.get('Elijah Craig').slice(0, 4).map(item => item.code));
    const secondCoreCodes = cohorts[1].codes.filter(code => byTerm.get('Elijah Craig').some(item => item.code === code));
    assert(secondCoreCodes.some(code => !firstCoreCodes.has(code)));
    assert.equal(new Set([...cohorts[0].codes, ...cohorts[1].codes].filter(code => byTerm.get('Elijah Craig').some(item => item.code === code))).size, 7);
  } finally { await rm(cursorDir, { recursive: true, force: true }); }
});
