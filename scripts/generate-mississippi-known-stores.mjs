#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { importMississippiPackageDirectory } from '../engine/src/discovery/mississippi-package-directory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const capturePath = path.join(root, 'engine', 'data', 'source-captures', 'MS-package-retailers-2026-07-26.json');
const programPath = path.join(root, 'src', 'config', 'mississippi-program.json');
const universePath = path.join(root, 'engine', 'data', 'store-universe', 'MS.json');
const outputPath = path.join(root, 'src', 'config', 'mississippi-known-stores.json');

export function verifyReviewedMississippiUniverse(universe, capture, program) {
  const regenerated = importMississippiPackageDirectory(capture, program);
  assert.deepEqual(universe, regenerated, 'Mississippi known-store publication requires byte-equivalent identities regenerated from the locked reviewed capture and program.');
  return regenerated;
}

export function buildMississippiKnownStoresPayload(universe) {
  assert.equal(universe.state, 'MS');
  assert.equal(universe.reviewedCurrentPermitCount, 690);
  assert.equal(universe.stores.length, 690);
  assert.equal(new Set(universe.stores.map((store) => store.id)).size, 690);
  assert.ok(universe.stores.every((store) => store.status === 'current'
    && store.sourceLayer === 'directory'
    && store.inventoryAlertable === false
    && store.watchAlertable === false
    && /^ms-permit-[0-9]{6}$/u.test(store.id)
    && /^[0-9]{5}$/u.test(store.zip)));

  return {
    schemaVersion: 1,
    contractVersion: 'bourbon-signal/mississippi-known-stores@1',
    state: 'MS',
    generatedAt: universe.generatedAt,
    reviewedAt: universe.reviewedAt,
    source: {
      label: universe.source.label,
      url: universe.source.url,
      responseDigest: universe.source.responseDigest,
      capability: 'known_directory_only',
      inventoryAuthoritative: false,
    },
    stores: universe.stores.map((store) => ({
      id: store.id,
      state: 'MS',
      name: store.dba,
      source: 'Mississippi DOR Package Retailer permit directory',
      signalCount: 0,
      address: store.address,
      city: store.city,
      county: store.county,
    })),
  };
}

async function main() {
  const [capture, program, checkedInUniverse] = await Promise.all([
    readFile(capturePath, 'utf8').then(JSON.parse),
    readFile(programPath, 'utf8').then(JSON.parse),
    readFile(universePath, 'utf8').then(JSON.parse),
  ]);
  const universe = verifyReviewedMississippiUniverse(checkedInUniverse, capture, program);
  const payload = buildMississippiKnownStoresPayload(universe);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Generated ${path.relative(root, outputPath)} with ${payload.stores.length} reviewed known Mississippi stores.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
