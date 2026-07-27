#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CHARLOTTE_METRO_BOARD_GROUP,
  DEMAND_METRO_AREAS,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
} from './demand-metro-areas.mjs';
import { registeredDemandMetroLocations, registeredDemandMetroStores } from './demand-metro-registry.mjs';
import { buildStores } from './export-site-contract.mjs';
import { buildLocationBible } from './location-bible.mjs';
import { isTennesseeRetailerInventory } from './tennessee-retailer-policy.mjs';
import {
  evaluateTennesseeSnapshotEvidence,
  qualifyingTennesseeInventoryEvidence,
} from './tennessee-verification-policy.mjs';

const siteDirectoryOverride = process.env.BOURBON_SIGNAL_VERIFY_SITE_DIR;
if (siteDirectoryOverride && process.env.GITHUB_ACTIONS === 'true') {
  throw new Error('BOURBON_SIGNAL_VERIFY_SITE_DIR is local verification-only and cannot override the generated site directory in GitHub Actions.');
}
const SITE_DIR = path.resolve(siteDirectoryOverride || 'out/site');
const OUT_DIR = path.resolve('out');
const ROOT_DIR = path.resolve('..');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function rows(payload, key) {
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

function stateOf(row) {
  return String(row?.state || row?.state_code || '').toUpperCase();
}

function metroFields(row) {
  return [
    row?.area,
    row?.city,
    row?.storeCity,
    row?.address,
    row?.storeAddress,
    row?.name,
    row?.storeName,
    row?.locationName,
    row?.displayLabel,
    row?.county,
    row?.boardName,
  ];
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function main() {
  const failures = [];
  const lifecycle = await readJson(path.join(ROOT_DIR, 'src/config/state-lifecycle.json'), {});
  const tennesseeState = await readJson(path.join(OUT_DIR, 'states/TN.json'));
  const dropsPayload = await readJson(path.join(SITE_DIR, 'drops.json'));
  const alertsPayload = await readJson(path.join(SITE_DIR, 'alerts.json'));
  const allowFreshRetainedEvidence = process.argv.includes('--allow-fresh-retained-evidence');
  const structuralOnly = process.argv.includes('--structural-only');

  assert(DEMAND_METRO_AREAS.NC.label === 'Charlotte Metro ABC Boards', 'Charlotte Metro ABC Boards canonical label drifted.', failures);
  assert(DEMAND_METRO_AREAS.GA.label === 'Atlanta Metro', 'Atlanta Metro canonical label drifted.', failures);
  assert(DEMAND_METRO_AREAS.TN.label === 'Nashville Metro', 'Nashville Metro canonical label drifted.', failures);
  assert(DEMAND_METRO_AREAS.NC.boardNames.length === 8, 'Charlotte grouping must contain exactly eight reviewed official boards.', failures);
  assert(DEMAND_METRO_AREAS.NC.boardNames.every((board) => demandMetroBoardGroupMatchesFields([board], [CHARLOTTE_METRO_BOARD_GROUP])), 'A Charlotte board does not resolve through the exact board grouping.', failures);
  assert(!demandMetroBoardGroupMatchesFields(['Davidson County ABC Board'], [CHARLOTTE_METRO_BOARD_GROUP]), 'Charlotte grouping bleeds into Davidson County ABC Board.', failures);

  for (const state of ['NC', 'GA', 'TN']) {
    assert(lifecycle?.states?.[state]?.areaOptions?.[0] === DEMAND_METRO_AREAS[state].label, `${state} lifecycle is missing its stable metro option.`, failures);
  }

  const configuredStores = registeredDemandMetroStores();
  const configuredLocations = registeredDemandMetroLocations();
  const atlantaStores = configuredStores.filter((row) => row.state === 'GA' && row.area === 'Atlanta Metro');
  const nashvilleStores = configuredStores.filter((row) => row.state === 'TN' && row.area === 'Nashville Metro');
  assert(atlantaStores.length >= 20, `Atlanta Metro exact-store registry has ${atlantaStores.length}; expected at least 20.`, failures);
  assert(nashvilleStores.length === 13, `Nashville Metro exact-store registry has ${nashvilleStores.length}; expected all 13.`, failures);
  assert(configuredLocations.every((row) => row.inventoryCapability === 'exact_store_source_registered' && row.hasSignals === false), 'Configured metro locations must remain non-inventory locator identities.', failures);

  // Build the stable directory projection from the current code instead of
  // requiring the independently activated, tracked production fixture to have
  // been rewritten by this feature branch.
  const exportStores = buildStores([]);
  const exportLocations = buildLocationBible([], []);
  const exportedAtlantaStores = exportStores.filter((row) => stateOf(row) === 'GA' && row.area === 'Atlanta Metro');
  const exportedNashvilleStores = exportStores.filter((row) => stateOf(row) === 'TN' && row.area === 'Nashville Metro');
  const exportedAtlantaLocations = exportLocations.filter((row) => stateOf(row) === 'GA' && row.area === 'Atlanta Metro');
  const exportedNashvilleLocations = exportLocations.filter((row) => stateOf(row) === 'TN' && row.area === 'Nashville Metro');
  assert(exportedAtlantaStores.length >= 20, `Store export exposes ${exportedAtlantaStores.length} Atlanta Metro exact-store identities; expected at least 20.`, failures);
  assert(exportedNashvilleStores.length === 13, `Store export exposes ${exportedNashvilleStores.length} Nashville Metro exact-store identities; expected all 13.`, failures);
  assert(exportedAtlantaLocations.length >= 20, `Location export exposes ${exportedAtlantaLocations.length} Atlanta Metro identities; expected at least 20.`, failures);
  assert(exportedNashvilleLocations.length === 13, `Location export exposes ${exportedNashvilleLocations.length} Nashville Metro identities; expected all 13.`, failures);
  assert([...exportedAtlantaStores, ...exportedNashvilleStores].every((row) =>
    row.sourceAvailabilityVerified === false
    && row.hasSignals === false
    && Number(row.signalCount || 0) === 0
  ), 'A configured exact-store directory identity claims inventory or verified availability.', failures);
  assert(exportedAtlantaStores.every((row) => demandMetroAreaMatchesFields('GA', metroFields(row), ['Atlanta Metro'])), 'Atlanta Metro store export contains a cross-metro identity.', failures);
  assert(exportedNashvilleStores.every((row) => demandMetroAreaMatchesFields('TN', metroFields(row), ['Nashville Metro'])), 'Nashville Metro store export contains a cross-metro identity.', failures);

  const drops = rows(dropsPayload, 'drops');
  const alertableTennessee = qualifyingTennesseeInventoryEvidence(drops).filter((row) =>
    row.sourceChain && row.merchantId && row.productId
  );
  const tennesseeSnapshotEvidence = structuralOnly
    ? { ok: true, failures: [], counts: null }
    : evaluateTennesseeSnapshotEvidence({
        stateReport: tennesseeState,
        dropsPayload,
        allowFreshRetainedEvidence,
      });
  if (!structuralOnly) {
    assert(tennesseeSnapshotEvidence.ok, `Tennessee generated contract evidence failed:\n- ${tennesseeSnapshotEvidence.failures.join('\n- ')}`, failures);
  }
  for (const row of alertableTennessee) {
    assert(isTennesseeRetailerInventory(row), `TN alertable drop ${row.id || row.sourceUrl || 'unknown'} fails exact retailer identity/orderability policy.`, failures);
  }
  const alerts = rows(alertsPayload, 'alerts');
  for (const alert of alerts.filter((row) => stateOf(row) === 'TN' && row.inventorySemantics === 'binary_retailer_orderable_no_exact_count')) {
    assert(alert.eligibleForOnSite === true, `TN binary alert ${alert.id || 'unknown'} is not available for conservative on-site matching.`, failures);
    assert(alert.eligibleForEmail === false && alert.eligibleForSms === false, `TN binary alert ${alert.id || 'unknown'} escaped email/SMS denial.`, failures);
    assert(Number(alert.quantity || 0) === 0 && alert.quantityIsExact === false, `TN binary alert ${alert.id || 'unknown'} fabricated an exact quantity.`, failures);
  }

  if (failures.length) {
    throw new Error(`Demand metro verification failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(JSON.stringify({
    ok: true,
    stableOptions: ['Charlotte Metro ABC Boards', 'Atlanta Metro', 'Nashville Metro'],
    configured: {
      charlotteBoards: DEMAND_METRO_AREAS.NC.boardNames.length,
      atlantaStores: atlantaStores.length,
      nashvilleStores: nashvilleStores.length,
    },
    exports: {
      atlantaStores: exportedAtlantaStores.length,
      nashvilleStores: exportedNashvilleStores.length,
      tennesseeAlertableDrops: alertableTennessee.length,
      tennesseeSnapshotEvidence: tennesseeSnapshotEvidence.counts,
      allowFreshRetainedEvidence,
      structuralOnly,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
