import assert from "node:assert/strict";
import { sanitizeSearchCaptureEvent } from "../src/lib/search-capture.ts";

assert.equal(sanitizeSearchCaptureEvent({ surface: "finder", query: "member@example.com", state: "NC" }), null);
assert.equal(sanitizeSearchCaptureEvent({ surface: "finder", query: "https://example.com/weller", state: "NC" }), null);
assert.equal(sanitizeSearchCaptureEvent({ surface: "finder", query: "call 919-555-0188", state: "NC" }), null);
assert.equal(sanitizeSearchCaptureEvent({ surface: "finder", query: "Weller 12", matchedBottleName: "member@example.com" }), null);
assert.deepEqual(sanitizeSearchCaptureEvent({
  surface: "bottle-check",
  query: "  Weller   12  ",
  state: "nc",
  outcome: "matched",
  matchedBottleId: "weller-12",
  matchedBottleName: "Weller 12 Year",
}), {
  event: "bourbon_signal_search",
  surface: "bottle-check",
  query: "Weller 12",
  state: "NC",
  mode: undefined,
  outcome: "matched",
  matchedBottleId: "weller-12",
  matchedBottleName: "Weller 12 Year",
  suggestionCount: undefined,
  resultCount: undefined,
  confidence: undefined,
  localScore: null,
  scoreStatus: undefined,
});

console.log("Search capture privacy contract passed.");
