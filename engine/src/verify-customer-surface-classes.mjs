#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { projectCustomerSurfaces } from './customer-surface-policy.mjs';

function rowsOf(value, key) {
  return Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
}

function requireRepresentative(rows, predicate, label) {
  const row = rows.find(predicate);
  if (!row) throw new Error(`Published site output has no ${label} representative.`);
  return row;
}

function requireSurfaces(label, projection, expected) {
  const failures = Object.entries(expected)
    .filter(([surface, value]) => projection[surface] !== value)
    .map(([surface, value]) => `${surface} expected ${value}, got ${projection[surface]}`);
  if (failures.length) throw new Error(`${label}: ${failures.join('; ')}`);
}

export function verifyCustomerSurfaceClasses({ drops, events } = {}) {
  const dropRows = rowsOf(drops, 'drops');
  const eventRows = rowsOf(events, 'events');
  const exactStore = requireRepresentative(dropRows, (row) => {
    const projection = projectCustomerSurfaces(row);
    return projection.inventory && String(row.locationPrecision || '') === 'store_level';
  }, 'exact-store inventory');
  const ncShipment = requireRepresentative(dropRows, (row) => String(row.state).toUpperCase() === 'NC'
    && /board_shipment/iu.test(String(row.type || row.eventType || '')), 'North Carolina board shipment');
  const announcement = requireRepresentative(eventRows, (row) => /lottery|announcement|scheduled_release/iu.test(String(row.category || row.eventType || row.type || '')), 'announcement or lottery');
  const event = requireRepresentative(eventRows, (row) => /barrel_pick|event/iu.test(String(row.category || row.eventType || row.type || '')), 'event');
  const staleFallback = dropRows.find((row) => {
    const projection = projectCustomerSurfaces(row);
    return projection.stale && projection.onSite && projection.feed && projection.coverage;
  }) || null;

  requireSurfaces('exact-store inventory', projectCustomerSurfaces(exactStore), {
    stored: true, onSite: true, feed: true, coverage: true, inventory: true,
  });
  requireSurfaces('North Carolina board shipment', projectCustomerSurfaces(ncShipment), {
    stored: true, onSite: true, feed: true, coverage: true, inventory: false, delivery: false, email: false, sms: false,
  });
  requireSurfaces('announcement or lottery', projectCustomerSurfaces(announcement, { kind: 'event' }), {
    stored: true, onSite: true, coverage: true, event: true, inventory: false, delivery: false, email: false, sms: false,
  });
  requireSurfaces('event', projectCustomerSurfaces(event, { kind: 'event' }), {
    stored: true, onSite: true, coverage: true, event: true, delivery: false, email: false, sms: false,
  });
  if (staleFallback) {
    requireSurfaces('stale fallback', projectCustomerSurfaces(staleFallback), {
      stored: true, onSite: true, feed: true, coverage: true, watch: false, inventory: false, delivery: false, email: false, sms: false,
    });
  }

  return {
    ok: true,
    classes: {
      exactStoreInventory: exactStore.id,
      ncBoardShipment: ncShipment.id,
      announcementOrLottery: announcement.id,
      event: event.id,
      staleFallback: staleFallback?.id || null,
    },
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main(argv = process.argv.slice(2)) {
  const siteArg = argv.find((value) => value.startsWith('--site-dir='));
  const siteDir = path.resolve(siteArg?.slice('--site-dir='.length) || 'out/site');
  return verifyCustomerSurfaceClasses({
    drops: await readJson(path.join(siteDir, 'drops.json')),
    events: await readJson(path.join(siteDir, 'events.json')),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exit(1); });
}
