import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const loadedOwnership = await import("../src/lib/push-ownership.ts");
const ownershipModule = { ...loadedOwnership, ...((loadedOwnership as { default?: object }).default || {}) } as typeof loadedOwnership;
const { PostgresPushOwnershipRepository } = ownershipModule;

const device = {
  deviceId: "fixture-installation",
  expoPushToken: "ExpoPushToken[fixture-token-12345]",
};

test("an offline logout capability revokes only its exact binding generation", async () => {
  const database = new PGlite();
  try {
    await database.exec(`create table member_push_ownership (
      resource_hash text primary key, user_id text not null, binding_id text not null,
      expires_at timestamptz not null, updated_at timestamptz not null default now()
    )`);
    const repository = new PostgresPushOwnershipRepository({ query: (text, params = []) => database.query(text, params) });
    await repository.bind("user-A", device, "11111111-1111-4111-8111-111111111111");
    assert.equal((await repository.owned("user-A", [{ ...device, bindingId: "11111111-1111-4111-8111-111111111111", platform: "ios", enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])).length, 1);
    assert.equal(await repository.revokeByCapability(device.deviceId, "11111111-1111-4111-8111-111111111111"), true);
    assert.equal((await repository.owned("user-A", [{ ...device, bindingId: "11111111-1111-4111-8111-111111111111", platform: "ios", enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])).length, 0);

    await repository.bind("user-B", device, "22222222-2222-4222-8222-222222222222");
    assert.equal(await repository.revokeByCapability(device.deviceId, "11111111-1111-4111-8111-111111111111"), false);
    assert.equal((await repository.owned("user-B", [{ ...device, bindingId: "22222222-2222-4222-8222-222222222222", platform: "ios", enabled: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])).length, 1);
  } finally {
    await database.close();
  }
});
