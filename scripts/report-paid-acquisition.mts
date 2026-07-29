#!/usr/bin/env node
import nextEnv from "@next/env";
import { createClerkClient } from "@clerk/backend";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { aggregateCampaignFunnels, type CompanyMemberUser } from "../src/lib/company-control-room.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
if (!clerkSecretKey) throw new Error("CLERK_SECRET_KEY is required for aggregate paid-acquisition reporting.");

const project = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectId?: string; orgId?: string };
if (!project.projectId || !project.orgId) throw new Error("A linked Vercel project is required for Web Analytics reporting.");

const campaignStart = "2026-07-28T00:00:00.000Z";
const now = new Date();
const params = new URLSearchParams();
params.set("projectId", project.projectId);
params.set("teamId", project.orgId);
params.set("since", campaignStart);
params.set("until", now.toISOString());
params.append("by", "eventName");
params.set("filter", "eventName eq 'product_surface_viewed' and eventData/surface eq 'homepage' and eventData/campaign in ('meta-paid_social-state-preview','meta-paid_social-state_preview')");
const endpoint = `/v1/query/web-analytics/events/aggregate?${params.toString()}`;
const globalVercelCli = process.env.APPDATA
  ? join(process.env.APPDATA, "npm", "node_modules", "vercel", "dist", "index.js")
  : "";
if (process.platform === "win32" && !existsSync(globalVercelCli)) {
  throw new Error("Vercel CLI 50.5.1+ is required at the authenticated global npm location for scheduled reporting.");
}
const analyticsResult = process.platform === "win32"
  ? spawnSync(process.execPath, [globalVercelCli, "api", endpoint, "--raw"], { encoding: "utf8", shell: false })
  : spawnSync("vercel", ["api", endpoint, "--raw"], { encoding: "utf8", shell: false });
if (analyticsResult.status !== 0) {
  throw new Error(`Vercel Web Analytics query failed: ${(analyticsResult.error?.message || analyticsResult.stderr || analyticsResult.stdout || "unknown error").trim()}`);
}
const analytics = JSON.parse(analyticsResult.stdout) as {
  data?: Array<{ eventName?: string; visitors?: number; count?: number }>;
};
const eventRows = new Map((analytics.data || []).map((row) => [row.eventName || "unknown", row]));
const homepage = eventRows.get("product_surface_viewed") || { visitors: 0, count: 0 };


const client = createClerkClient({ secretKey: clerkSecretKey });
const users: CompanyMemberUser[] = [];
for (let offset = 0; offset < 10_000; offset += 500) {
  const result = await client.users.getUserList({ limit: 500, offset });
  const page = (Array.isArray(result) ? result : result.data) as CompanyMemberUser[];
  users.push(...page);
  if (page.length < 500) break;
}
const campaigns = aggregateCampaignFunnels(users, now, new Date(campaignStart));
const totals = campaigns.reduce((sum, item) => ({
  accounts: sum.accounts + item.accounts,
  registrationCompleted: sum.registrationCompleted + item.registrationCompleted,
  freeValueReached: sum.freeValueReached + item.freeValueReached,
  pricingViewed: sum.pricingViewed + item.pricingViewed,
  checkoutStarted: sum.checkoutStarted + item.checkoutStarted,
  membershipActivated: sum.membershipActivated + item.membershipActivated,
}), { accounts: 0, registrationCompleted: 0, freeValueReached: 0, pricingViewed: 0, checkoutStarted: 0, membershipActivated: 0 });

function rate(numerator: number, denominator: number) {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

console.log("# Bourbon Signal paid-social acquisition\n");
console.log(`Checked: ${now.toISOString()}`);
console.log("Scope: registered Meta paid-social campaign tags; no visitor identifiers, emails, IP addresses, or raw event rows.\n");
console.log("## Tagged traffic · Vercel Web Analytics");
console.log(`- Homepage visitors: ${Number(homepage.visitors) || 0} (${Number(homepage.count) || 0} views)\n`);
console.log("## Attributed member funnel · Clerk first touch");
console.log(`- Accounts: ${totals.accounts} (${rate(totals.accounts, Number(homepage.visitors) || 0)} of tagged homepage visitors)`);
console.log(`- Registrations completed: ${totals.registrationCompleted}`);
console.log(`- Reached free value: ${totals.freeValueReached} (${rate(totals.freeValueReached, totals.accounts)} of accounts)`);
console.log(`- Pricing views: ${totals.pricingViewed}`);
console.log(`- Checkout starts: ${totals.checkoutStarted}`);
console.log(`- Membership activations: ${totals.membershipActivated}\n`);
if (!Number(homepage.visitors) && !totals.accounts) {
  console.log("No registered campaign traffic or attributed accounts have been observed yet.\n");
}
console.log("Measurement note: a boosted organic post and its organic distribution share the same tagged URL, so site totals combine both. Compare these figures with Meta's paid link-click and landing-page-view totals to estimate the paid portion.");
