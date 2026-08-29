import assert from "node:assert/strict";
import {
  HUNT_OUTCOME_PROMPT_REPEAT_MS,
  huntOutcomePromptStorageKey,
  signalHasExpiredForOutcome,
  shouldOfferHuntOutcomePrompt,
} from "../src/lib/hunt-outcome-prompt.ts";

const now = Date.parse("2026-08-29T12:00:00.000Z");
assert.equal(signalHasExpiredForOutcome({
  kind: "availability",
  displayAt: "2026-08-28T11:59:59.000Z",
}, now), true, "availability Signals expire into Hunt Outcome after the compact default window");
assert.equal(signalHasExpiredForOutcome({
  kind: "availability",
  displayAt: "2026-08-29T11:00:00.000Z",
}, now), false, "current availability never shows Hunt Outcome");
assert.equal(signalHasExpiredForOutcome({
  kind: "availability",
  displayAt: "2026-08-29T11:00:00.000Z",
  expiresAt: "2026-08-29T11:30:00.000Z",
}, now), true, "explicit expiry is authoritative");
assert.equal(signalHasExpiredForOutcome({ kind: "release", displayAt: "2026-08-01T00:00:00.000Z" }, now), false);

assert.equal(shouldOfferHuntOutcomePrompt({
  signal: { kind: "availability", displayAt: "2026-08-27T12:00:00.000Z" },
  now,
  lastPromptedAt: null,
}), true);
assert.equal(shouldOfferHuntOutcomePrompt({
  signal: { kind: "availability", displayAt: "2026-08-27T12:00:00.000Z" },
  now,
  lastPromptedAt: now - HUNT_OUTCOME_PROMPT_REPEAT_MS + 1,
}), false, "recent prompts are not repeated");
assert.equal(shouldOfferHuntOutcomePrompt({
  signal: { kind: "availability", displayAt: "2026-08-27T12:00:00.000Z" },
  now,
  lastPromptedAt: now - HUNT_OUTCOME_PROMPT_REPEAT_MS,
}), true, "the quiet prompt can return after the repeat window");
assert.equal(huntOutcomePromptStorageKey("trusted_source:abc"), "bourbon-signal:hunt-outcome-prompt:trusted_source%3Aabc");

console.log("Hunt Outcome UI policy tests passed.");
