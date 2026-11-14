import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { researchSourceForState } from '../src/research-state-registry.mjs';
import { cityHiveResearchLifecycleEntries, cityHiveResearchSourceForState } from '../src/research-cityhive-runtime.mjs';
import { collectCentralCityHiveExpansion, parseCentralCityHiveInventory } from '../src/collectors/central-cityhive-expansion.mjs';
import { librarySearchPool } from '../src/library-query-plan.mjs';
import { NEBRASKA_CITYHIVE_RESEARCH_SOURCES } from '../src/collectors/central-cityhive-research-premises.mjs';

const fixtureRoot = new URL('./fixtures/ne-wall-to-wall-papillion/', import.meta.url);
const raw = await readFile(new URL('whiskey-shop.html', fixtureRoot));
const receipt = JSON.parse(await readFile(new URL('receipt.json', fixtureRoot), 'utf8'));
const source = NEBRASKA_CITYHIVE_RESEARCH_SOURCES[0];

test('Papillion Wall to Wall research is opt-in, premise-bound, and leaves Iowa results unqualified', async () => {
  assert.ok(source);
  assert.equal(raw.length, receipt.bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), receipt.sha256);
  assert.equal(receipt.status, 200);
  assert.equal(source.merchantId, '65df89008f34632ba609f7ee');
  assert.equal(source.address, '7651 Towne Center Pkwy, Papillion, NE 68046, USA');
  assert.equal(source.lat, 41.1330158);
  assert.equal(source.lng, -96.0288807);
  assert.equal(source.pickupEnabledAtCapture, false);
  assert.equal(source.acceptOrdersAtCapture, false);
  assert.match(raw.toString('utf8'), /data-ch-merchant-id="65a80eb730100c2ba2cdca72"/);

  const prior = process.env.BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW;
  const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
  const cursorDir = await mkdtemp(path.join(os.tmpdir(), 'bs-ne-wall-to-wall-'));
  try {
    delete process.env.BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW;
    assert.equal(researchSourceForState('NE', { shadowMode: true }), null);
    assert.equal(cityHiveResearchLifecycleEntries().NE, undefined);

    process.env.BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW = '1';
    const selected = researchSourceForState('NE', { shadowMode: true });
    assert.equal(selected, cityHiveResearchSourceForState('NE'));
    assert.equal(selected.active, false);
    assert.equal(selected.sources.length, 1);
    assert.equal(cityHiveResearchLifecycleEntries().NE.publicStatus, 'research_only');
    const workflow = await readFile(new URL('../../.github/workflows/state-expansion-shadow.yml', import.meta.url), 'utf8');
    const selectorLines = workflow.split(/\r?\n/).filter(line => line.includes('BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW:'));
    assert.equal(selectorLines.length, 2, 'plan and collection steps must both carry the exact branch selector');
    assert.ok(selectorLines.every(line => line.includes("github.ref == 'refs/heads/research/ne-wall-to-wall-papillion-20261114'")));
    assert.ok(selectorLines.some(line => line.includes("inputs.states == 'NE'")));
    assert.ok(selectorLines.some(line => line.includes("steps.plan.outputs.states == 'NE'")));
    assert.deepEqual(source.prioritySearchTerms, ['barrel proof']);
    assert.equal(source.maxQueries, 2);

    const replayedRows = parseCentralCityHiveInventory(raw.toString('utf8'), source, bible, { observedAt: receipt.observedAt });
    assert.deepEqual(replayedRows, [], 'the saved default Iowa offers must not be attributed to Papillion');

    const pool = librarySearchPool(bible);
    assert.ok(pool.length > 0);
    const urls = [];
    const result = await collectCentralCityHiveExpansion({ id: 'NE' }, bible, {
      sourceIds: [source.id], cursorDir, observedAt: receipt.observedAt,
      fetchText: async url => { urls.push(url); return { ok: true, status: 200, url, text: raw.toString('utf8') }; },
    });
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => url.includes(`merchant-id=${source.merchantId}`)));
    const terms = urls.map(url => new URL(url).searchParams.get('ch-query'));
    assert.equal(terms[0], 'barrel proof');
    assert.ok(pool.includes(terms[1]));
    assert.notEqual(terms[1], terms[0]);
    assert.deepEqual(result.signals, []);
    assert.equal(result.metadata.exhaustiveCatalogVerified, false);
  } finally {
    if (prior === undefined) delete process.env.BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW;
    else process.env.BOURBON_SIGNAL_NE_WALL_TO_WALL_SHADOW = prior;
    await rm(cursorDir, { recursive: true, force: true });
  }
});
