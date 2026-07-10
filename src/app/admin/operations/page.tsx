import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { isRewardsAdminEmail } from "@/lib/sighting-rewards";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";

export const dynamic = "force-dynamic";

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

function statusTone(status: string) {
  if (["healthy", "monitoring", "ok"].includes(status)) return "border-emerald-700/50 bg-emerald-950/30 text-emerald-200";
  if (["degraded", "stale_useful"].includes(status)) return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  return "border-red-700/50 bg-red-950/30 text-red-100";
}

export default async function OperationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/operations");
  const user = await (await clerkClient()).users.getUser(userId);
  if (!isRewardsAdminEmail(primaryEmail(user))) notFound();

  const stats = await readSiteExport("stats") as Record<string, unknown> | null;
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
  const degradedStates = Array.isArray(refreshHealth?.degradedStates)
    ? refreshHealth.degradedStates as Array<Record<string, unknown>>
    : [];

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

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
            <h2 className="font-serif text-xl font-semibold">State fallbacks</h2>
            {degradedStates.length ? (
              <ul className="mt-4 divide-y divide-[var(--color-border)]">
                {degradedStates.map((state) => (
                  <li key={String(state.state)} className="grid gap-1 py-3 sm:grid-cols-[80px_130px_1fr]">
                    <strong>{String(state.state || "Unknown")}</strong>
                    <span className="font-mono text-xs uppercase text-amber-200">{String(state.status || "degraded")}</span>
                    <span className="text-sm text-[var(--color-text-secondary)]">{String(state.staleReason || "Last-known-good data retained")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-[var(--color-text-secondary)]">No degraded state collectors.</p>}
          </article>

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
      </div>
    </main>
  );
}
