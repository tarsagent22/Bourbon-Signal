import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const loadedDelivery = await import("../src/lib/alert-delivery.ts");
const delivery = { ...loadedDelivery, ...((loadedDelivery as { default?: object }).default || {}) } as typeof loadedDelivery;
const { isolatePushChannelFailure } = delivery;

test("a push repository failure is reported but does not abort later channels", async () => {
  const errors: string[] = [];
  let emailDelivered = false;
  const ok = await isolatePushChannelFailure("drain", async () => {
    throw new Error('relation "alert_push_outbox" does not exist');
  }, (message) => errors.push(message));
  emailDelivered = true;

  assert.equal(ok, false);
  assert.equal(emailDelivered, true);
  assert.match(errors[0] || "", /push drain failed/);
});

test("the real alert delivery caller isolates both push drain and enqueue failures", () => {
  const source = readFileSync(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
  assert.match(source, /isolatePushChannelFailure\("drain"[\s\S]*drainMemberPush/);
  assert.match(source, /isolatePushChannelFailure\("enqueue"[\s\S]*memberPushOutbox\.enqueue/);
  assert.match(source, /summary\.pushFailures \+= 1/);
});
