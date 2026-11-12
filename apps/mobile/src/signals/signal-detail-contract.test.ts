import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const detail = readFileSync(resolve(process.cwd(), "app/(app)/signal/[id].tsx"), "utf8");

test("Signal detail is the unified Bottle Profile route", () => {
  assert.match(detail, /Stack\.Screen options=\{\{ title: "Bottle Profile"[, ]/);
  assert.match(detail, /<BottleProfileHero\s+identity=\{signal.bottle\}/);
  assert.match(detail, /getBottleProfile\(catalogId/);
  assert.match(detail, /bottleDetails\?\.msrp != null \? <BottlePriceCheck/);
  assert.ok(detail.indexOf('styles.reportCard') < detail.indexOf('styles.bottleActions'));
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
  assert.match(detail, /label="Call store"/);
  assert.match(detail, /BoardStoreLinks/);
  assert.match(detail, /Receiving stores are unconfirmed/);
  assert.match(detail, /Share sighting/);
  assert.match(detail, /Hunt Outcome/);
  assert.doesNotMatch(detail, /Bourbon DNA|DNA compatibility|compatibility score/i);
});

test("store contact deduplicates addresses and only provides directions to street addresses", async () => {
  const { storeContact } = await import("./store-contact");
  const contact = storeContact({
    name: "Example ABC", address: "123 Main St, Raleigh, NC 27601",
    city: "Raleigh", state: "NC", zip: "27601", phone: "(919) 555-0101",
  });
  assert.equal(contact.address, "123 Main St, Raleigh, NC 27601");
  assert.equal(contact.destination, "Example ABC, 123 Main St, Raleigh, NC 27601");
  assert.equal(contact.phone, "9195550101");
  assert.equal(storeContact({ address: "P.O. Box 123", city: "Raleigh", state: "NC" }).destination, "");
});
