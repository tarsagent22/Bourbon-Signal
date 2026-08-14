import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { radarEntries, stateGuides } from "../src/lib/release-radar.ts";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const nextConfig = read("next.config.ts");
const sitemap = read("src/app/sitemap.ts");
const homepage = read("src/app/page.tsx");
const footer = read("src/components/Footer.tsx");
const layout = read("src/app/layout.tsx");
const welcome = read("src/app/welcome/page.tsx");
const pricing = read("src/app/pricing/PricingPageClient.tsx");
const signUp = read("src/app/sign-up/[[...sign-up]]/page.tsx");
const faq = read("src/lib/faq-content.ts");
const plans = read("src/lib/membership-plan-catalog.ts");
const weekly = read("src/lib/member-weekly-server.ts");
const jobs = JSON.parse(read("automation/bourbon-signal/hermes-jobs.json"));
const registry = JSON.parse(read("automation/bourbon-signal/automation-registry.json"));
const agentContract = read("AGENTS.md");
const operatorPrompt = read("automation/bourbon-signal/autonomous-operator-prompt.md");

assert.match(nextConfig, /source: "\/release-radar", destination: "\/", permanent: true/);
assert.match(nextConfig, /source: "\/release-radar\/:path\*", destination: "\/", permanent: true/);

for (const [name, source] of Object.entries({ sitemap, homepage, footer, layout, welcome, pricing, signUp, faq, plans })) {
  assert.doesNotMatch(source, /Release Radar|release-radar/, `${name} must not advertise or discover the retired product`);
}
assert.doesNotMatch(sitemap, /radarEntries|radarPath|stateGuides|releaseRadarUpdatedAt/);
assert.doesNotMatch(homepage, /ReleaseRadarSection/);
assert.match(pricing, /Coverage Map and Member Sightings/);
assert.match(signUp, /the Coverage Map, and Member Sightings/);
assert.doesNotMatch(weekly, /radar|release-radar/i, "weekly member intelligence must not retain a retired Radar path");

const retiredJobIds = new Set(["0ee6b2c9fb07", "00f56edff2e9"]);
assert.ok(jobs.jobs.every((job: { jobId: string }) => !retiredJobIds.has(job.jobId)), "retired scheduler jobs must leave the checked-in live-job export");
const retiredRegistryIds = new Set(["hermes-release-radar", "hermes-release-radar-publisher"]);
assert.ok(registry.automations.every((entry: { id: string }) => !retiredRegistryIds.has(entry.id)), "retired automation entries must leave the active registry");
assert.ok(registry.automations.some((entry: { id: string; hermesJobId?: string }) => entry.id === "hermes-source-scout" && entry.hermesJobId === "bb9c16064777"), "the unrelated source-expansion scout must remain active");
assert.doesNotMatch(agentContract, /dedicated Release Radar publisher/);
assert.doesNotMatch(operatorPrompt, /For Release Radar/);

assert.ok(radarEntries.length >= 31, "all source-backed historical entries must remain available for a later reviewed blog migration");
assert.equal(new Set(radarEntries.map((entry) => entry.slug)).size, radarEntries.length, "archived slugs must remain unique");
for (const entry of radarEntries) {
  assert.match(entry.startDate, /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);
  assert.ok(entry.title.trim() && entry.summary.trim() && entry.sections.length > 0, `${entry.slug} must keep its archived release content`);
  assert.ok(entry.sources.length > 0, `${entry.slug} must keep at least one source`);
  assert.ok(entry.sources.every((source) => /^https:\/\//.test(source.url) && source.label.trim().length > 0), `${entry.slug} sources must remain reviewable`);
}
assert.ok(stateGuides.length > 0, "source-backed historical state guides must remain available for a later reviewed blog migration");
assert.equal(new Set(stateGuides.map((guide) => guide.slug)).size, stateGuides.length, "archived state-guide slugs must remain unique");
for (const guide of stateGuides) {
  assert.ok(guide.state.trim() && guide.abbreviation.trim() && guide.title.trim() && guide.dek.trim() && guide.model.trim(), `${guide.slug} must keep its archived state-guide identity and model`);
  assert.match(guide.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(guide.quickFacts.length > 0 && guide.quickFacts.every((fact) => fact.label.trim() && fact.value.trim()), `${guide.slug} must keep nonempty quick facts`);
  assert.ok(guide.sections.length > 0 && guide.sections.every((section) => section.heading.trim() && section.body.trim()), `${guide.slug} must keep nonempty guide sections`);
  assert.ok(guide.sources.length > 0, `${guide.slug} must keep at least one source`);
  assert.ok(guide.sources.every((source) => /^https:\/\//.test(source.url) && source.label.trim().length > 0), `${guide.slug} sources must remain reviewable`);
  assert.ok((guide.boardProfiles || []).every((board) => board.name.trim() && board.area.trim() && board.guidance.trim() && /^https:\/\//.test(board.sourceUrl)), `${guide.slug} board profiles must remain source-backed`);
}
assert.equal(existsSync(resolve("src/app/release-radar/page.tsx")), false, "retired Radar pages must not remain in the production build");
assert.equal(existsSync(resolve("src/app/release-radar/calendar.ics/route.ts")), false, "the retired calendar endpoint must not remain in the production build");

console.log("Release Radar retirement contract passed.");
