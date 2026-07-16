import assert from "node:assert/strict";
import { captureSearchEvent, sanitizeSearchCaptureEvent } from "../src/lib/search-capture.ts";

const arbitraryFreeText = "private tasting notes for member@example.com at https://example.com";
const sanitized = sanitizeSearchCaptureEvent({
  surface: "bottle-check",
  state: "nc",
  outcome: "matched",
  canonicalBottleId: "WELLER-12",
  suggestionCount: 4.9,
  resultCount: 100_000,
  query: arbitraryFreeText,
  matchedBottleName: arbitraryFreeText,
  mode: arbitraryFreeText,
  confidence: arbitraryFreeText,
  scoreStatus: arbitraryFreeText,
} as Parameters<typeof sanitizeSearchCaptureEvent>[0]);

assert.deepEqual(sanitized, {
  event: "bourbon_signal_search",
  surface: "bottle-check",
  canonicalBottleId: "weller-12",
  state: "NC",
  outcome: "matched",
  suggestionCount: 4,
  resultCount: 1_000,
});
assert.equal(JSON.stringify(sanitized).includes(arbitraryFreeText), false);

assert.deepEqual(sanitizeSearchCaptureEvent({
  surface: "finder",
  state: "XX",
  outcome: "submitted",
  canonicalBottleId: "free text with spaces",
  suggestionCount: -4,
}), {
  event: "bourbon_signal_search",
  surface: "finder",
  canonicalBottleId: undefined,
  state: undefined,
  outcome: "submitted",
  suggestionCount: 0,
  resultCount: undefined,
});

let logged = "";
const originalInfo = console.info;
console.info = (value?: unknown) => { logged = String(value); };
try {
  assert.equal(captureSearchEvent({
    surface: "finder",
    state: "CA",
    outcome: "unmatched",
    query: arbitraryFreeText,
    matchedBottleName: arbitraryFreeText,
  } as Parameters<typeof captureSearchEvent>[0]), true);
} finally {
  console.info = originalInfo;
}
assert.match(logged, /^BS_SEARCH_EVENT /);
assert.equal(logged.includes(arbitraryFreeText), false);
for (const forbiddenField of ["query", "matchedBottleName", "capturedAt", "mode", "confidence", "localScore", "scoreStatus"]) {
  assert.equal(logged.includes(forbiddenField), false);
}

console.log("Search capture privacy contract passed.");
