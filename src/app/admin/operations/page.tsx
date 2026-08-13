import { requireOwnerPageAccess } from "@/lib/owner-auth";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";
import SignalPointRewardQueue from "@/components/admin/SignalPointRewardQueue";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (["healthy", "monitoring", "ok"].includes(status)) return "border-emerald-700/50 bg-emerald-950/30 text-emerald-200";
  if (["degraded", "stale_useful"].includes(status)) return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  return "border-red-700/50 bg-red-950/30 text-red-100";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function shortTime(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default async function OperationsPage() {
  await requireOwnerPageAccess("/admin/operations");

  const [stats, stateHealth] = await Promise.all([
    readSiteExport("stats") as Promise<Record<string, unknown> | null>,
    readSiteExport("state-health").catch(() => null) as Promise<Record<string, unknown> | null>,
  ]);
  const heartbeat = await readAlertDeliveryHeartbeat();
  const refreshHealth = stats?.refreshHealth && typeof stats.refreshHealth === "object"
    ? stats.refreshHealth as Record<string, unknown>
    : null;
  const health = buildOpsHealth({
    heartbeat,
    engineGeneratedAt: typeof stats?.engineGeneratedAt === "string"
      ? stats.engineGeneratedAt
      : typeof stats?.generatedAt === "string" ? stats.generatedAt : null,
    refreshHealth,
    currentDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
  });
  const operatingStates = Array.isArray(stateHealth?.states)
    ? stateHealth.states as Array<Record<string, unknown>>
    : Array.isArray(refreshHealth?.states) ? refreshHealth.states as Array<Record<string, unknown>> : [];

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] px-5 py-10 text-[var(--color-text-primary)] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-3 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--color-accent-amber)]">Bourbon Signal operations</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">Engine control room</h1>
          </div>
          <p className="font-mono text-xs text-[var(--color-text-tertiary)]">Checked {health.checkedAt}</p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <article className={`border p-5 ${statusTone(health.ok ? "healthy" : "failed")}`}>
            <p className="font-mono text-xs uppercase tracking-wider">Overall</p>
            <p className="mt-3 text-2xl font-semibold">{health.ok ? "Healthy" : "Attention required"}</p>
            <p className="mt-2 text-sm opacity-80">Deployment {health.release.deploymentId || "unknown"}</p>
          </article>
          <article className={`border p-5 ${statusTone(health.engine.status)}`}>
            <p className="font-mono text-xs uppercase tracking-wider">Engine freshness</p>
            <p className="mt-3 text-2xl font-semibold">{health.engine.ageMinutes ?? "—"} min</p>
            <p className="mt-2 text-sm opacity-80">{health.engine.generatedAt || "No engine timestamp"}</p>
          </article>
          <article className={`border p-5 ${statusTone(health.cron.status)}`}>
            <p className="font-mono text-xs uppercase tracking-wider">Alert monitor</p>
            <p className="mt-3 text-2xl font-semibold">{health.cron.status.replaceAll("_", " ")}</p>
            <p className="mt-2 text-sm opacity-80">Last run {health.cron.ageMinutes ?? "—"} min ago · dry-run {String(health.cron.lastRunDryRun)}</p>
          </article>
        </section>

        <section className="mt-8 border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h2 className="font-serif text-xl font-semibold">All-state operating contract</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
              <thead className="border-b border-[var(--color-border)] font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="px-2 py-3">State</th><th className="px-2 py-3">Health</th><th className="px-2 py-3">Collected</th>
                  <th className="px-2 py-3">Published</th><th className="px-2 py-3">Freshness</th><th className="px-2 py-3">Signals</th>
                  <th className="px-2 py-3">Cards</th><th className="px-2 py-3">Fallback</th><th className="px-2 py-3">Failure / anomaly</th>
                  <th className="px-2 py-3">Recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {operatingStates.map((state) => {
                  const collection = record(state.collection);
                  const freshness = record(state.freshness);
                  const fallback = record(state.fallback);
                  const anomalies = Array.isArray(state.anomalyCodes) ? state.anomalyCodes.map(String) : [];
                  return (
                    <tr key={String(state.state)} className="align-top">
                      <td className="px-2 py-3 font-semibold">{String(state.state || "?")}</td>
                      <td className="px-2 py-3"><span className={`inline-block border px-2 py-1 font-mono uppercase ${statusTone(String(state.health || "blocked"))}`}>{String(state.health || "blocked").replaceAll("_", " ")}</span></td>
                      <td className="px-2 py-3 font-mono" title={String(collection.status || "unknown")}>{shortTime(collection.lastSuccessAt)}</td>
                      <td className="px-2 py-3 font-mono">{shortTime(state.lastPublicationAt)}</td>
                      <td className="px-2 py-3">{String(freshness.status || "unknown")}{typeof freshness.ageHours === "number" ? ` · ${freshness.ageHours}h` : ""}</td>
                      <td className="px-2 py-3 font-mono">{String(state.signalCount ?? 0)}</td>
                      <td className="px-2 py-3 font-mono">{String(state.customerVisibleDropCount ?? 0)}</td>
                      <td className="px-2 py-3">{String(fallback.status || "none").replaceAll("_", " ")}</td>
                      <td className="max-w-[260px] px-2 py-3 text-[var(--color-text-secondary)]">{anomalies[0]?.replaceAll("_", " ") || String(fallback.reason || collection.status || "none")}</td>
                      <td className="px-2 py-3 font-mono">{String(state.recoveryAction || "none").replaceAll("_", " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!operatingStates.length && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">State operating contract unavailable.</p>}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
            <h2 className="font-serif text-xl font-semibold">Delivery safety</h2>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
              <dt>Monitor-only lock</dt><dd className="font-mono">{String(health.delivery.monitorOnly)}</dd>
              <dt>On-site enabled</dt><dd className="font-mono">{String(health.delivery.onSiteEnabled)}</dd>
              <dt>Email enabled</dt><dd className="font-mono">{String(health.delivery.emailEnabled)}</dd>
              <dt>SMS enabled</dt><dd className="font-mono">{String(health.delivery.smsEnabled)}</dd>
              <dt>Failed states</dt><dd className="font-mono">{health.engine.failedStateCount}</dd>
            </dl>
          </article>
        </section>
        <SignalPointRewardQueue />
      </div>
    </main>
  );
}
