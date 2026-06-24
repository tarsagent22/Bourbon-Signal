#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const targets = [
  { name: "live", baseUrl: process.env.BOURBON_SIGNAL_LIVE_URL || "https://www.bourbonsignal.com" },
  { name: "launch-preview", baseUrl: process.env.BOURBON_SIGNAL_PREVIEW_URL || "https://bourbonsignal-git-launch-membershi-5dff05-tarsagent22s-projects.vercel.app" },
];

const outputDir = process.env.BOURBON_SIGNAL_HEALTH_DIR || path.join(process.cwd(), ".hermes", "bourbon-signal", "health");
const maxFreshnessHours = Number(process.env.BOURBON_SIGNAL_MAX_ENGINE_AGE_HOURS || 8);
const previewQaPages = ["/", "/pricing", "/dashboard", "/alerts", "/bottle-check", "/sightings"];
const livePages = ["/"];
const requiredApiPaths = ["/api/stats", "/api/drops?limit=1", "/api/user/preferences", "/api/sightings"];

function ageHours(value) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  return Math.round(((Date.now() - ms) / 36_000) ) / 100;
}

async function fetchText(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "BourbonSignalHealthCheck/1.0" } });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, location: res.headers.get("location"), ms: Date.now() - started, text: text.slice(0, 1000) };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error), text: "" };
  }
}

async function fetchJson(url) {
  const result = await fetchText(url);
  if (!result.ok) return { ...result, json: null };
  try {
    return { ...result, json: JSON.parse(result.text) };
  } catch {
    // refetch full json if first text slice truncated an API response
    try {
      const res = await fetch(url, { headers: { "user-agent": "BourbonSignalHealthCheck/1.0" } });
      return { ...result, json: await res.json() };
    } catch (error) {
      return { ...result, json: null, parseError: error instanceof Error ? error.message : String(error) };
    }
  }
}

async function inspectTarget(target) {
  const pages = {};
  const pagesToCheck = target.name.includes("preview") ? previewQaPages : livePages;
  for (const page of pagesToCheck) {
    const result = await fetchText(`${target.baseUrl}${page}`);
    pages[page] = {
      ok: result.ok,
      status: result.status,
      location: result.location,
      ms: result.ms,
      protectedByVercel: result.status === 401 || result.status === 403 || /vercel.*login|sso-api|\/login|Redirecting/i.test(`${result.location || ""} ${result.text || ""}`),
      hasExpectedShell: /Bourbon Signal|Pick your proof|Dashboard|Member Sightings|Bottle Check/i.test(result.text || ""),
    };
  }

  const apis = {};
  for (const apiPath of requiredApiPaths) {
    const result = await fetchJson(`${target.baseUrl}${apiPath}`);
    apis[apiPath] = { ok: result.ok, status: result.status, location: result.location, ms: result.ms, protectedByVercel: result.status === 401 || result.status === 403 || /vercel.*login|sso-api|\/login|Redirecting/i.test(`${result.location || ""} ${result.text || ""}`), json: result.json };
  }

  const stats = apis["/api/stats"]?.json || {};
  const drops = apis["/api/drops?limit=1"]?.json || {};
  const engineGeneratedAt = stats.engineGeneratedAt || stats.generatedAt || drops.lastUpdated || drops.generatedAt || null;
  const freshnessHours = ageHours(engineGeneratedAt);
  const activeStates = Array.isArray(stats.activeStates) ? stats.activeStates : [];
  const dropTotal = typeof drops.total === "number" ? drops.total : Array.isArray(drops.drops) ? drops.drops.length : null;

  const problems = [];
  if (target.name.includes("preview") && !pages["/pricing"]?.ok && !pages["/pricing"]?.protectedByVercel) problems.push("pricing_page_not_ok");
  if (target.name.includes("preview") && pages["/dashboard"]?.status >= 300 && !pages["/dashboard"]?.protectedByVercel) problems.push("preview_dashboard_not_accessible");
  if (freshnessHours === null) problems.push("engine_freshness_unknown");
  else if (freshnessHours > maxFreshnessHours) problems.push(`engine_stale_${freshnessHours}h`);
  if (dropTotal === 0) problems.push("drops_zero");

  return { ...target, checkedAt: new Date().toISOString(), pages, apis, summary: { engineGeneratedAt, freshnessHours, activeStates, dropTotal, problems } };
}

const results = [];
for (const target of targets) results.push(await inspectTarget(target));
const report = { checkedAt: new Date().toISOString(), maxFreshnessHours, results };

await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await fs.writeFile(path.join(outputDir, "latest-health.json"), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(outputDir, `${stamp}-health.json`), JSON.stringify(report, null, 2));

const allProblems = results.flatMap((target) => target.summary.problems.map((problem) => `${target.name}:${problem}`));
if (allProblems.length) {
  console.log(`Bourbon Signal health issues: ${allProblems.join(", ")}`);
  console.log(JSON.stringify(report.results.map((result) => ({ name: result.name, summary: result.summary })), null, 2));
  process.exitCode = 1;
} else {
  console.log(`Bourbon Signal health OK: ${results.map((result) => `${result.name} drops=${result.summary.dropTotal ?? "?"} freshness=${result.summary.freshnessHours ?? "?"}h`).join(" | ")}`);
}
