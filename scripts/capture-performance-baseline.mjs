#!/usr/bin/env node
import { performance } from "node:perf_hooks";

const baseUrl = process.argv[2] || "https://www.bourbonsignal.com";
const probes = [
  { path: "/api/stats", expectedStatuses: [200] },
  { path: "/api/drops?limit=50", expectedStatuses: [200] },
  { path: "/api/locations", expectedStatuses: [200, 401] },
];
const results = [];

for (const { path, expectedStatuses } of probes) {
  const started = performance.now();
  const response = await fetch(new URL(path, baseUrl), { headers: { Accept: "application/json" } });
  const body = new Uint8Array(await response.arrayBuffer());
  results.push({
    path,
    status: response.status,
    durationMs: Math.round((performance.now() - started) * 10) / 10,
    bytes: body.byteLength,
    cacheControl: response.headers.get("cache-control"),
    engineContract: response.headers.get("x-engine-contract"),
    apiSource: response.headers.get("x-api-source"),
    expected: expectedStatuses.includes(response.status),
  });
}

console.log(JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, results }, null, 2));
if (results.some((result) => !result.expected)) process.exitCode = 1;
