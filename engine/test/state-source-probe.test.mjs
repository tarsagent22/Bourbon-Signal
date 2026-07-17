import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { probeStateSources } from '../src/discovery/state-source-probe.mjs';

test('state source probe consumes bounded discovery candidates and stays non-promoting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'state-source-probe-'));
  const discoveryDir = path.join(root, 'discovery');
  const outDir = path.join(root, 'probes');
  await mkdir(discoveryDir, { recursive: true });
  await writeFile(path.join(discoveryDir, 'CO.json'), JSON.stringify({
    state: 'CO',
    candidates: [
      { id: 'one', state: 'CO', title: 'Official', url: 'https://agency.colorado.gov/bourbon', domain: 'agency.colorado.gov', platformHints: ['official_source'], evidenceKind: 'search_discovery_only' },
      { id: 'two', state: 'CO', title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Colorado', domain: 'en.wikipedia.org', platformHints: ['official_source'], evidenceKind: 'search_discovery_only' },
      { id: 'three', state: 'CO', title: 'Three', url: 'https://three.example/bourbon', domain: 'three.example', evidenceKind: 'search_discovery_only' },
    ],
  }));
  const calls = [];
  const httpClient = { get: async (url) => {
    calls.push(url);
    return { ok: true, status: 200, url, text: '<html>bourbon quantity: 4 available for pickup</html>' };
  } };
  const [report] = await probeStateSources({ states: ['CO'], discoveryDir, outDir, httpClient, maxSourcesPerState: 2, now: () => '2026-07-16T12:00:00.000Z' });
  const saved = JSON.parse(await readFile(path.join(outDir, 'CO.json'), 'utf8'));
  assert.equal(calls.length, 2);
  assert.equal(report.summary.probed, 2);
  assert.equal(report.summary.exactQuantityCandidates, 2);
  assert.ok(report.results.every((row) => row.promotionEligible === false && row.inventoryEvidence === false && row.requiresReview === true));
  assert.deepEqual(report.results.map((row) => row.sourceAuthority), ['official', 'unknown'], 'search query hints must not turn third-party domains into official sources');
  assert.deepEqual(saved, report);
  await rm(root, { recursive: true, force: true });
});

test('state source probe rejects states without discovery evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'state-source-probe-missing-'));
  await assert.rejects(() => probeStateSources({ states: ['CO'], discoveryDir: path.join(root, 'missing'), outDir: path.join(root, 'out'), httpClient: { get: async () => ({}) } }), /discovery report/i);
  await rm(root, { recursive: true, force: true });
});
