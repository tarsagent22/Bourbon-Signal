import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { BourbonBible } from './core/bible.mjs';
import { confidenceForSignal } from './confidence-policy.mjs';
import { collectSouthCarolinaDunes } from './collectors/precision-probes.mjs';
import { isSouthCarolinaDunesInventory } from './south-carolina-dunes-policy.mjs';

const execFileAsync = promisify(execFile);
const ENGINE_ROOT = path.resolve('.');
const REPO_ROOT = path.resolve('..');
const CONTRACT_PATH = path.join(ENGINE_ROOT, 'data/state-expansion-evidence/SC-dunes-contract-2026-07-30.json');
const EVIDENCE_PATH = path.join(ENGINE_ROOT, 'data/state-expansion-evidence/SC-dunes-2026-07-30.json');
const CAPTURE_ROOT = path.join(ENGINE_ROOT, 'data/source-captures/SC-dunes-2026-07-30');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function fileSha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function implementationDigestAtCommit(commit, files) {
  invariant(/^[0-9a-f]{40}$/i.test(String(commit || '')), 'Dunes evidence must bind the reviewed implementation to an immutable Git commit.');
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    const { stdout } = await execFileAsync('git', ['show', `${commit}:${file}`], {
      cwd: REPO_ROOT,
      encoding: 'buffer',
      maxBuffer: 8 * 1024 * 1024,
    });
    hash.update(stdout);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function main() {
  const evidence = await readJson(EVIDENCE_PATH);
  const workingContractText = await readFile(CONTRACT_PATH, 'utf8');
  const [{ stdout: tagCommit }, { stdout: contractCommit }, { stdout: taggedContractText }] = await Promise.all([
    execFileAsync('git', ['rev-parse', `${evidence.contractGitTag}^{commit}`], { cwd: REPO_ROOT }),
    execFileAsync('git', ['rev-parse', evidence.contractCommit], { cwd: REPO_ROOT }),
    execFileAsync('git', ['show', `${evidence.contractCommit}:${evidence.contractPath}`], { cwd: REPO_ROOT, maxBuffer: 2 * 1024 * 1024 }),
  ]);
  invariant(tagCommit.trim() === evidence.contractCommit, 'Dunes evidence tag no longer points to the frozen pre-implementation contract commit.');
  invariant(contractCommit.trim() === evidence.contractCommit, 'Dunes contract commit is unavailable in repository history.');
  invariant(taggedContractText.replace(/\r\n/g, '\n').trimEnd() === workingContractText.replace(/\r\n/g, '\n').trimEnd(), 'Working Dunes contract differs from the blob frozen at the tagged pre-implementation commit.');

  const contract = JSON.parse(workingContractText);
  const replayNowMs = Date.parse(contract.contractFrozenAt);
  invariant(Number.isFinite(replayNowMs), 'Frozen Dunes contract must include a valid contractFrozenAt timestamp.');
  invariant(contract.state === 'SC' && evidence.state === 'SC', 'Dunes contract and evidence must remain South Carolina scoped.');
  invariant(contract.cohort === evidence.cohort, 'Dunes contract and landed evidence cohort mismatch.');

  for (const [name, expected] of Object.entries(contract.captureHashes || {})) {
    const actual = await fileSha256(path.join(CAPTURE_ROOT, name));
    invariant(actual === expected, `Dunes capture hash mismatch for ${name}.`);
  }

  const actualImplementationDigest = await implementationDigestAtCommit(evidence.implementationCommit, evidence.implementationFiles || []);
  invariant(actualImplementationDigest === evidence.implementationDigest, 'Dunes historical implementation digest does not match reviewed evidence.');

  const storefront = await readFile(path.join(CAPTURE_ROOT, 'storefront.html'), 'utf8');
  const metadata = await readJson(path.join(CAPTURE_ROOT, 'store-metadata.json'));
  const searches = await readJson(path.join(CAPTURE_ROOT, 'search-results.json'));
  const details = await readJson(path.join(CAPTURE_ROOT, 'item-details.json'));
  const searchByTerm = new Map(searches.searches.map((entry) => [entry.term, entry.response]));
  const detailBySku = new Map(details.items.map((entry) => [String(entry.searchRow.ID), entry.response]));
  const requests = [];
  const fetcher = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    if (url === 'https://www.dunesliquor.com') return { ok: true, status: 200, url, text: storefront, error: null };
    if (url.endsWith('/Home/LoadBasicData')) return { ok: true, status: 200, url, text: JSON.stringify(metadata.response), error: null };
    const body = JSON.parse(options.body || '{}');
    if (url.endsWith('/Home/GetSearchResult')) return { ok: true, status: 200, url, text: JSON.stringify(searchByTerm.get(body.SearchTerm)), error: null };
    if (url.endsWith('/ListManage/LoadItemDescription')) return { ok: true, status: 200, url, text: JSON.stringify(detailBySku.get(String(body.SKU))), error: null };
    return { ok: false, status: 404, url, text: '', error: 'unregistered capture route' };
  };

  const bible = await BourbonBible.load(path.join(ENGINE_ROOT, 'out/bourbon-bible.json'));
  const replay = await collectSouthCarolinaDunes({ id: 'SC' }, bible, contract.contractFrozenAt, {
    fetcher,
    sleepFn: async () => {},
    useCache: false,
    persistCache: false,
    searchTerms: searches.terms,
    maxItems: contract.acceptance.maxSourceRequests,
    detailConcurrency: contract.acceptance.maxConcurrency,
  });
  const inventory = replay.signals.filter((signal) => signal.eventType === 'retailer_store_inventory_result');
  const stores = new Set(inventory.map((signal) => signal.storeId));
  invariant(requests.length <= contract.acceptance.maxSourceRequests, `Dunes replay exceeded the ${contract.acceptance.maxSourceRequests}-request contract.`);
  invariant(inventory.length >= contract.acceptance.minimumSafeCurrentRows, `Dunes replay produced ${inventory.length} safe rows; expected at least ${contract.acceptance.minimumSafeCurrentRows}.`);
  invariant(stores.size >= contract.acceptance.minimumAddedCurrentStores, 'Dunes replay did not add the contracted exact store.');
  invariant(inventory.every((signal) => signal.city === 'Myrtle Beach' && signal.sourceRuntimeId === 'retailer:sc:dunes:6178'), 'Dunes replay escaped the reviewed Myrtle Beach runtime identity.');
  invariant(inventory.every((signal) => String(signal.rawName || '').toLowerCase() !== 'old forester bourbon 750ml'), 'Dunes replay promoted the generic Old Forester label to a year-specific expression.');
  invariant(inventory.every((signal) => Number.isSafeInteger(signal.quantity) && signal.quantity > 0 && signal.quantityIsExact === true), 'Dunes replay emitted a non-positive or non-exact quantity.');
  invariant(inventory.every((signal) => signal.premisesVerified === true && signal.pickupOfferVerified === true && signal.orderabilityOfferVerified === true), 'Dunes replay emitted inventory without the reviewed premises and cart controls.');
  invariant(inventory.every((signal) => signal.deliveryOfferVerified === false && signal.fulfillmentGuaranteed === false), 'Dunes replay widened delivery or fulfillment semantics.');
  const productionWrappedInventory = inventory.map((signal) => ({ ...signal, sourceRuntimeId: 'precision:sc' }));
  invariant(productionWrappedInventory.every((signal) => isSouthCarolinaDunesInventory(signal, replayNowMs)), 'Dunes replay failed the production precision-runtime identity policy.');
  invariant(productionWrappedInventory.every((signal) => {
    const confidence = confidenceForSignal(signal, { nowMs: replayNowMs });
    return confidence.policyMode === 'alert_retailer_store_inventory_caveat'
      && confidence.canAlertAsInventory === true
      && confidence.canAlertAsWatch === true;
  }), 'Dunes replay was demoted by the central confidence policy.');
  invariant(replay.roadblocks.length === 0, `Dunes frozen replay returned roadblocks: ${JSON.stringify(replay.roadblocks)}`);
  invariant(evidence.liveProbe.currentExactInventoryRows >= contract.acceptance.minimumSafeCurrentRows, 'Landed live probe did not meet the frozen row threshold.');
  invariant(evidence.liveProbe.inventoryAlertableRows === evidence.liveProbe.currentExactInventoryRows, 'Landed live probe rows were not all admitted by central confidence policy.');
  invariant(evidence.liveProbe.currentStores >= contract.acceptance.minimumAddedCurrentStores, 'Landed live probe did not meet the frozen store threshold.');

  console.log(JSON.stringify({
    ok: true,
    state: 'SC',
    cohort: contract.cohort,
    frozenReplayRows: inventory.length,
    frozenReplayStores: stores.size,
    frozenReplayRequests: requests.length,
    landedLiveRows: evidence.liveProbe.currentExactInventoryRows,
    landedLiveBottles: evidence.liveProbe.uniqueCanonicalBottles,
    implementationDigest: evidence.implementationDigest,
    contractCommit: evidence.contractCommit,
    contractGitTag: evidence.contractGitTag,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
