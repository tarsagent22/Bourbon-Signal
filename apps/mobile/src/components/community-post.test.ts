import assert from "node:assert/strict";
import test from "node:test";
import type { Signal } from "../api/types";
import { communityPhotoUrl, communityBadges, communityBadgeIcon, communityBadgeDescription, communityPhotoHeight } from "./community-post";
const post = { source: { type: "member", actor: { badges: ["Top Contributor · 2026", "Spotter · Gold", "Spotter · Gold", "", "Weekly Streak", "Fourth"] } }, evidence: { photo: true, photoUrl: "https://test.public.blob.vercel-storage.com/photo.jpg" } } as Signal;
test("feed photos use only public blob evidence and never private or arbitrary URLs", () => {
  assert.equal(communityPhotoUrl(post), post.evidence.photoUrl);
  for (const url of ["https://test.private.blob.vercel-storage.com/photo.jpg", "http://test.public.blob.vercel-storage.com/photo.jpg", "file:///photo.jpg", "https://test.public.blob.vercel-storage.com.evil.test/photo.jpg"]) assert.equal(communityPhotoUrl({ ...post, evidence: { ...post.evidence, photoUrl: url } }), null);
  assert.equal(communityPhotoUrl({ ...post, source: { ...post.source, type: "retailer" } }), null);
  assert.equal(communityPhotoUrl({ ...post, evidence: { ...post.evidence, photo: false } }), null);
});
test("three unique earned badge labels and leader icons fit beside member identity", () => {
  assert.deepEqual(communityBadges(post), ["Top Contributor · 2026", "Spotter · Gold", "Weekly Streak"]);
  assert.equal(communityBadgeIcon("Top Contributor · Oct 2026"), "trophy-outline");
  assert.equal(communityBadgeIcon("Most Active · 2026"), "fire");
  assert.match(communityBadgeDescription("Most Active · 2026"), /completed year/);
  assert.match(communityBadgeDescription("Most Active · Oct 2026"), /completed month/);
  assert.match(communityBadgeDescription("Spotter · Gold"), /50/);
});
test("portrait photos cannot grow a feed card to image height", () => {
  assert.equal(communityPhotoHeight(844), 180);
  assert.equal(communityPhotoHeight(568), 125);
  assert.equal(communityPhotoHeight(2000), 180);
  assert.equal(communityPhotoHeight(400), 110);
});
