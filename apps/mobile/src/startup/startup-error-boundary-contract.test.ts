import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boundary = readFileSync(new URL("./StartupErrorBoundary.tsx", import.meta.url), "utf8");

test("startup recovery preserves JavaScript and React component stacks", () => {
  assert.match(boundary, /componentStack:\s*string/);
  assert.match(boundary, /componentDidCatch\(error: Error, info: ErrorInfo\)/);
  assert.match(boundary, /info\.componentStack/);
  assert.match(boundary, /error\.stack/);
});

test("startup recovery exposes bounded selectable diagnostics", () => {
  assert.match(boundary, /ScrollView/);
  assert.match(boundary, /selectable/);
  assert.match(boundary, /const MAX_DIAGNOSTIC_LENGTH = \d+/);
  assert.match(boundary, /slice\(0, MAX_DIAGNOSTIC_LENGTH\)/);
  assert.match(boundary, /STARTUP_DIAGNOSTIC_RELEASE/);
});
