import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { researchSourceForState } from '../src/research-state-registry.mjs';
import { cityHiveResearchSourceForState } from '../src/research-cityhive-runtime.mjs';
import { collectCentralCityHiveExpansion } from '../src/collectors/central-cityhive-expansion.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { librarySearchPool } from '../src/library-query-plan.mjs';

test('NJ Silverton CityHive research is an explicit opt-in with a two-query ceiling', async () => {
  const prior = process.env.BOURBON_SIGNAL_NJ_SILVERTON_SHADOW;
  try {
    delete process.env.BOURBON_SIGNAL_NJ_SILVERTON_SHADOW;
    const normalResearch = researchSourceForState('NJ', { shadowMode: true });
    assert.notEqual(normalResearch, cityHiveResearchSourceForState('NJ'));

    process.env.BOURBON_SIGNAL_NJ_SILVERTON_SHADOW = '1';
    const selected = researchSourceForState('NJ', { shadowMode: true });
    assert.equal(selected, cityHiveResearchSourceForState('NJ'));
    assert.equal(selected.sources.length, 1);
    assert.match(selected.sources[0].url, /^https:\/\/silvertonbuyrite\.com\//);

    const config = JSON.parse(await readFile(new URL('../data/nj-cityhive-research-sources.json', import.meta.url), 'utf8'));
    assert.equal(config.stores.length, 1);
    assert.equal(config.stores[0].city, 'Toms River');
    assert.equal(config.stores[0].merchantId, '5aafc248f4a661684fb284e9');
    assert.deepEqual(config.stores[0].prioritySearchTerms, ["Blanton's Gold"]);
    assert.equal(config.stores[0].maxQueries, 2);
    assert.equal(selected.active, false);

    const cursorDir = await mkdtemp(path.join(os.tmpdir(), 'bs-nj-silverton-plan-'));
    try {
      const requests = [];
      const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
      const rotatingPool = librarySearchPool(bible);
      assert.ok(rotatingPool.length > 0);
      await collectCentralCityHiveExpansion({ id: 'NJ' }, bible, {
        sourceIds: [config.stores[0].id], cursorDir,
        fetchText: async url => { requests.push(url); return { ok: true, status: 200, url, text: '<html></html>' }; },
      });
      assert.equal(requests.length, 2);
      assert.ok(requests.every(url => url.includes('merchant-id=5aafc248f4a661684fb284e9')));
      const terms = requests.map(url => new URL(url).searchParams.get('ch-query'));
      assert.equal(terms[0], "Blanton's Gold");
      assert.ok(rotatingPool.includes(terms[1]));
      assert.notEqual(terms[1], terms[0]);
    } finally {
      await rm(cursorDir, { recursive: true, force: true });
    }
  } finally {
    if (prior === undefined) delete process.env.BOURBON_SIGNAL_NJ_SILVERTON_SHADOW;
    else process.env.BOURBON_SIGNAL_NJ_SILVERTON_SHADOW = prior;
  }
});
