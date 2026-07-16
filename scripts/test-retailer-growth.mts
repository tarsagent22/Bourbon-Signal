import assert from "node:assert/strict";
import { retailerNextAction } from "../src/lib/retailer-portal.ts";

assert.equal(retailerNextAction({ status: "pending", stores: 0, liveSignals: 0 }), "Await verification");
assert.equal(retailerNextAction({ status: "verified", stores: 0, liveSignals: 0 }), "Add or select a store");
assert.equal(retailerNextAction({ status: "verified", stores: 1, liveSignals: 0 }), "Publish your first Bottle availability signal");
assert.equal(retailerNextAction({ status: "verified", stores: 1, liveSignals: 1 }), "Your Bottle availability signal is live");
console.log("Retailer growth contract passed.");
