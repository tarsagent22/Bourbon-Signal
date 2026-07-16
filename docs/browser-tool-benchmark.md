# Browser-tool benchmark

This benchmark compares Codex native browser support with the Hermes browser for exploratory debugging and visual QA. It does **not** choose the production collector: unattended ingestion remains the isolated, bounded deterministic CDP runtime.

The machine-readable contract is [`browser-benchmark-contract.json`](../automation/bourbon-signal/browser-benchmark-contract.json), and `npm run ops:browser-benchmark` validates it. The ten tasks cover local visual QA, responsive QA, dynamic endpoint discovery, owner navigation, redirects, and difficult JavaScript sources. Completed measurements include elapsed wall time, tool calls, screenshots, reproducibility, session dependence, and collector convertibility. Model-token telemetry is `null` where the runtime does not expose it.

## Recorded result

| Tool | Completed | Pending/blocker | What the run established |
|---|---:|---:|---|
| Codex native browser | 0 | 10 | A real native-browser invocation failed before navigation with Windows OS error 2. No completion or timing data was fabricated. |
| Hermes browser | 3 | 7 | Real runs measured OHLQ, New Hampshire, and Oregon. Local-only, fixed-viewport, authenticated-owner, and retailer-redirect tasks remain pending where the tool/runtime could not satisfy the contract safely. |

### Hermes measured tasks

- **OHLQ dynamic endpoint:** `15,233 ms`, one browser call. The security-verification blocker reproduced; no endpoint or inventory claim was made. Existing isolated CDP remains the production collector.
- **New Hampshire dynamic endpoint:** `33,411 ms`, three browser calls. The official product/stock surface rendered. Browser-console inspection failed in the runtime, so no undocumented endpoint was claimed.
- **Oregon difficult JavaScript source:** `38,802 ms`, one browser call. The age-gated Oregon Liquor Search shell rendered, but no repeatable current-inventory endpoint was proven.
- **Owner guard (partial evidence):** the signed-out route redirected to `/sign-in?redirect_url=%2Fadmin%2Fcontrol-room` in `12,946 ms`. This remains pending as an owner-navigation benchmark because no controlled owner session was available and no credentials were typed.
- **Apex redirect (partial evidence):** `https://bourbonsignal.com` reached the canonical `www` origin in `11,396 ms`. This remains pending because the benchmark asks for a retailer-source identity redirect.

## Decision

- Keep **Brave + direct HTTP/platform probes** as the broad discovery and classification path.
- Keep **isolated headless CDP** as the only unattended browser collector. It is bounded, reproducible, session-isolated, and token-free.
- Use **Hermes browser** for read-only investigation and visual/product QA where its environment fits.
- Do not adopt Codex native browser in this Windows background runtime until its browser binding starts successfully and the same ten tasks can be rerun.
- Compile any successful agent investigation into deterministic source code; do not make recurring production collection depend on an agent browser.
