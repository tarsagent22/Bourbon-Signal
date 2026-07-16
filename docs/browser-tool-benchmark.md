# Browser-tool benchmark

This benchmark compares Codex native browser support with the Hermes browser for exploratory debugging and visual QA. It does not choose the production collector: production ingestion remains the isolated deterministic CDP runtime.

The contract is [browser-benchmark-contract.json](../automation/bourbon-signal/browser-benchmark-contract.json), and `npm run ops:browser-benchmark` validates it. Each of its ten tasks records completion, elapsed time, model tokens, screenshots, tool calls, reproducibility, user-session dependence, and whether the finding can become a deterministic collector.

Current result: pending for both tools on all ten tasks. This change did not fabricate benchmark data. The available native-browser runtime reported no browser bindings, and no Hermes browser executor or telemetry was available here. Run the tasks in a controlled environment, attach the compact evidence for each completed task, then update only the relevant measurement from `pending` to `completed`.

Decision rule: prefer Codex native browser for integrated coding and visual QA only if the completed evidence materially improves completion/reproducibility. Keep the deterministic CDP lane for production ingestion regardless of the agent-browser result.
