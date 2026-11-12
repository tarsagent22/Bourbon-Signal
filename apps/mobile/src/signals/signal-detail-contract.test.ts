import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Signal } from "../api/types";
import { reportDateTime, signalStoreContact } from "./store-contact";

const detail = readFileSync(resolve(process.cwd(), "app/(app)/signal/[id].tsx"), "utf8");

test("Signal detail is the unified Bottle Profile route", () => {
  assert.match(detail, /Stack\.Screen options=\{\{ title: "Bottle Profile"[, ]/);
  assert.match(detail, /BottleProfileHero identity=\{signal.bottle\}/);
  assert.match(detail, /BottlePriceCheck/);
  assert.match(detail, /Last reported availability/);
  assert.match(detail, /signalCardStatusLabel/);
  assert.match(detail, /bottleProfileState/);
});

test("Bottle Profile keeps existing Signal actions and does not invent Bourbon DNA", () => {
  assert.match(detail, /Watch in Radar/);
  assert.match(detail, /const canWatch = Boolean\(signal\?\.actions\.includes\("watch_bottle"\)\);/);
  assert.doesNotMatch(detail, /const canWatch = .*alertEligibility/);
  assert.match(detail, /Add to My Shelf/);
  assert.match(detail, /label="Directions"/);
  assert.match(detail, /Hunt Outcome/);
  assert.doesNotMatch(detail, /Bourbon DNA|DNA compatibility|compatibility score/i);
});

test("directions require an exact street address and retain each address component once", () => {
  const report = { location: { scope: "exact_store", state: "PA", store: {
    address: "Mechanicsburg, PA, 17050", city: "Mechanicsburg", state: "PA", zip: "17050", name: "Bottle Shop",
  } } } as Signal;
  assert.deepEqual(signalStoreContact(report), { address: "Mechanicsburg, PA, 17050", destination: "", phone: "" });
  const full = { ...report, location: { ...report.location, store: {
    ...report.location.store, address: "100 Main St, Mechanicsburg, PA 17050", phone: "(717) 555-0123",
  } } };
  assert.deepEqual(signalStoreContact(full), {
    address: "100 Main St, Mechanicsburg, PA 17050", destination: "Bottle Shop, 100 Main St, Mechanicsburg, PA 17050", phone: "7175550123",
  });
  assert.equal(signalStoreContact({ ...full, shipment: { boardId: "area", unit: "units" } }).destination, "");
  assert.equal(reportDateTime("not a time"), "");
  assert.doesNotMatch(reportDateTime("2026-11-11T22:30:01Z"), /:30:01/);
});
