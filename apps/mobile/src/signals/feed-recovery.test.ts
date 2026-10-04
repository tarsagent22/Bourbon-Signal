import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi, MobileApiError } from "../api/client";
import { feedFixture } from "../api/astra-fixtures";
import { feedRetryAction } from "./feed-recovery";
test("expired pagination recovers with a new first page, not another exhausted page", async () => {
  const paths: URL[] = [];
  const api = createMobileApi({ getToken: async () => "test", fetcher: async request => {
    const url = new URL(new Request(request).url); paths.push(url);
    if (url.searchParams.has("cursor")) return Response.json({error:{code:"CURSOR_EXPIRED",message:"Expired"},resetCursor:true},{status:409});
    return Response.json(feedFixture());
  }});
  await assert.rejects(api.listSignals({cursor:"expired"}), (error: unknown) => error instanceof MobileApiError && error.resetCursor);
  const action = feedRetryAction(false);
  assert.equal(action.label,"Refresh feed");
  const result = await api.listSignals({ fresh: action.refresh, cursor: action.refresh ? null : "expired" });
  assert.equal(paths[1].searchParams.has("cursor"),false);
  assert.equal(result.hasMore,false);
  assert.equal(feedRetryAction(true).refresh,false,"transient page errors retain ordinary page retry");
});
