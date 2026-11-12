import assert from "node:assert/strict";
import test from "node:test";
import { draftKey, readDraft, writeDraft, parseDraft, type DraftStore } from "./form-draft";
const defaults = { bottle: "", notes: "", quantity: 1, rated: false, tags: [] as string[] };
function memoryStore() {
  const data = new Map<string, string>();
  const store: DraftStore = { getItemAsync: async key => data.get(key) || null, setItemAsync: async (key, value) => { data.set(key, value); }, deleteItemAsync: async key => { data.delete(key); } };
  return { data, store };
}
test("a remounted form restores input without leaking it to a different account or form", async () => {
  const { store } = memoryStore();
  const fields = { ...defaults, bottle: "Weller", notes: "Vanilla & oak", tags: ["Oak"] };
  await writeDraft(store, draftKey("user-a", "post"), fields);
  assert.deepEqual(await readDraft(store, draftKey("user-a", "post"), defaults), fields);
  assert.equal(await readDraft(store, draftKey("user-b", "post"), defaults), null);
  assert.equal(await readDraft(store, draftKey("user-a", "add-bottle"), defaults), null);
  assert.equal(draftKey(null, "post"), "");
});
test("discard waits for in-flight saves and cannot resurrect an older draft", async () => {
  const { data, store } = memoryStore();
  let release!: () => void;
  store.setItemAsync = async (key, value) => { await new Promise<void>(resolve => { release = resolve; }); data.set(key, value); };
  const saving = writeDraft(store, "draft", defaults);
  await Promise.resolve(); await Promise.resolve();
  const discarding = writeDraft(store, "draft", null);
  release(); await Promise.all([saving, discarding]);
  assert.equal(await readDraft(store, "draft", defaults), null);
});
test("corrupt or incompatible drafts never populate fields", () => {
  for (const raw of ["{", JSON.stringify({version:2,fields:defaults}), JSON.stringify({version:1,fields:{...defaults, quantity:"many"}}), JSON.stringify({version:1,fields:{...defaults,tags:[5]}})]) assert.equal(parseDraft(raw, defaults), null);
});
test("a failed local write does not poison later saves", async () => {
  const { store } = memoryStore(); const original = store.setItemAsync;
  store.setItemAsync = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(writeDraft(store, "draft", defaults));
  store.setItemAsync = original;
  await writeDraft(store, "draft", { ...defaults, notes: "retry" });
  assert.equal((await readDraft(store, "draft", defaults))?.notes, "retry");
});

test("a restored draft expires 24 hours after its last saved edit", () => {
  const savedAt = Date.parse("2026-11-11T16:00:00Z");
  const raw = JSON.stringify({ version: 1, savedAt, fields: defaults });
  assert.deepEqual(parseDraft(raw, defaults, savedAt + 86_400_000 - 1), defaults);
  assert.equal(parseDraft(raw, defaults, savedAt + 86_400_000), null);
  assert.equal(parseDraft(JSON.stringify({ version: 1, fields: defaults }), defaults), null);
});
