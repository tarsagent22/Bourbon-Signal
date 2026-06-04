"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useMemberAlerts } from "@/hooks/useMemberAlerts";
import { useMemo, useState } from "react";

const tabs = [
  { key: "unread", label: "Unread" },
  { key: "all", label: "All alerts" },
  { key: "archived", label: "Archived" },
] as const;

export default function AlertsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("unread");
  const [syncState, setSyncState] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });
  const { alerts, unreadCount, loading, isEligible, candidateAlerts, candidateAlertCount, reliabilitySummary, alertDeliveryEnabled, alertPolicyNote, markRead, markAllRead, archive, refresh } = useMemberAlerts(true);

  const syncCandidates = async () => {
    setSyncState({ loading: true, message: null });
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_candidates", limit: 10 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Sync failed");
      await refresh();
      setSyncState({ loading: false, message: `Synced ${data.created || 0} beta inbox alert${data.created === 1 ? "" : "s"}.` });
    } catch (error) {
      setSyncState({ loading: false, message: error instanceof Error ? error.message : "Sync failed" });
    }
  };

  const visibleAlerts = useMemo(() => {
    if (tab === "unread") return alerts.filter((alert) => !alert.readAt && !alert.archivedAt);
    if (tab === "archived") return alerts.filter((alert) => !!alert.archivedAt);
    return alerts.filter((alert) => !alert.archivedAt);
  }, [alerts, tab]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      <Navigation />
      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "118px 24px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", flexWrap: "wrap", marginBottom: "28px" }}>
          <div>
            <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent-amber)" }}>
              Premium alert inbox
            </p>
            <h1 style={{ margin: "10px 0 0", fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 5vw, 52px)", color: "var(--color-cream)" }}>
              Your signal inbox
            </h1>
            <p style={{ margin: "12px 0 0", maxWidth: "680px", fontFamily: "var(--font-dm-sans)", fontSize: "15px", lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
              This is your live beta alert inbox. New drops stay here until you read or archive them, so you can move across the site without losing the thread.
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              onClick={() => markAllRead().catch(() => undefined)}
              style={{
                borderRadius: "999px",
                border: "1px solid rgba(196,148,58,0.22)",
                background: "rgba(196,148,58,0.08)",
                color: "var(--color-accent-amber)",
                padding: "11px 16px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Mark all read
            </button>
          ) : null}
        </div>

        {!isEligible ? (
          <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "22px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            Sign in to test the beta alert inbox. Payments are intentionally soft-gated while Bourbon Signal validates alert quality.
          </div>
        ) : (
          <>
            <div style={{ borderRadius: "18px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(196,148,58,0.055)", padding: "18px", marginBottom: "22px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <strong style={{ display: "block", color: "var(--color-cream)", fontSize: 15 }}>Beta alert reliability check</strong>
                  <span style={{ fontSize: 13 }}>{alertPolicyNote || "Engine candidates are visible for QA; external delivery remains disabled until explicitly enabled."}</span>
                </div>
                <span style={{ border: "1px solid rgba(196,148,58,0.28)", borderRadius: 999, padding: "7px 10px", color: "var(--color-accent-amber)", fontSize: 12, fontWeight: 700 }}>
                  {reliabilitySummary?.eligibleForDelivery || 0}/{candidateAlertCount} sendable · delivery {alertDeliveryEnabled ? "on" : "off"}
                </span>
              </div>
              {reliabilitySummary ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 14 }}>
                  {[
                    ["Avg reliability", `${reliabilitySummary.averageReliability}/100`],
                    ["Major", String(reliabilitySummary.major)],
                    ["Standard", String(reliabilitySummary.standard)],
                    ["Review only", String(reliabilitySummary.reviewOnly)],
                  ].map(([label, value]) => (
                    <div key={label} style={{ borderRadius: 12, background: "rgba(0,0,0,0.14)", padding: "10px 12px" }}>
                      <div style={{ color: "var(--color-text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                      <strong style={{ color: "var(--color-cream)", fontSize: 17 }}>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
                <button
                  onClick={() => syncCandidates().catch(() => undefined)}
                  disabled={syncState.loading || !reliabilitySummary?.eligibleForDelivery}
                  style={{ borderRadius: 999, border: "1px solid rgba(196,148,58,0.28)", background: syncState.loading || !reliabilitySummary?.eligibleForDelivery ? "rgba(255,255,255,0.04)" : "rgba(196,148,58,0.12)", color: syncState.loading || !reliabilitySummary?.eligibleForDelivery ? "var(--color-text-tertiary)" : "var(--color-accent-amber)", padding: "9px 12px", fontSize: 12, fontWeight: 800, cursor: syncState.loading || !reliabilitySummary?.eligibleForDelivery ? "not-allowed" : "pointer" }}
                >
                  {syncState.loading ? "Syncing…" : "Sync sendable to inbox"}
                </button>
                {syncState.message ? <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{syncState.message}</span> : null}
              </div>
              {candidateAlerts.length ? (
                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  {candidateAlerts.slice(0, 3).map((candidate, index) => (
                    <div key={String(candidate.id || index)} style={{ borderRadius: 12, background: "rgba(0,0,0,0.16)", padding: "10px 12px", fontSize: 13 }}>
                      <strong style={{ color: "var(--color-cream)" }}>{String(candidate.bottle || "Bottle signal")}</strong>
                      <span> · {String(candidate.state || "")}</span>
                      <span> · reliability {String(candidate.reliabilityScore || candidate.score || "—")}</span>
                      <span> · {candidate.eligibleForDelivery ? "sendable" : "review"}</span>
                      <div style={{ color: "var(--color-text-tertiary)", marginTop: 3 }}>{String(candidate.reason || candidate.evidence || "Candidate pending review.").slice(0, 180)}</div>
                      {Array.isArray(candidate.blockers) && candidate.blockers.length ? (
                        <div style={{ color: "#ffb3a5", marginTop: 3 }}>Blocked: {candidate.blockers.map(String).slice(0, 3).join(", ")}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "22px" }}>
              {tabs.map((item) => {
                const active = item.key === tab;
                return (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    style={{
                      borderRadius: "999px",
                      border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)",
                      background: active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)",
                      color: active ? "var(--color-cream)" : "var(--color-text-secondary)",
                      padding: "10px 14px",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)" }}>Loading alerts…</div>
            ) : visibleAlerts.length === 0 ? (
              <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "22px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                {tab === "archived"
                  ? "No archived alerts yet."
                  : "No alerts yet. Once a watched bottle hits your saved territory, it will show up here."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {visibleAlerts.map((alert) => (
                  <article
                    key={alert.id}
                    style={{
                      borderRadius: "18px",
                      border: alert.priorityClass === "major" ? "1px solid rgba(196,148,58,0.24)" : "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      padding: "18px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>
                            {alert.bottleName}
                          </h2>
                          <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: alert.priorityClass === "major" ? "var(--color-accent-amber)" : "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {alert.priorityClass === "major" ? "Major hit" : alert.readAt ? "Seen" : "New"}
                          </span>
                        </div>
                        <p style={{ margin: "10px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "15px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                          {alert.storeLabel}
                        </p>
                        <p style={{ margin: "4px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                          Matched area: {alert.matchedArea} · State: {alert.state}
                        </p>
                        <p style={{ margin: "10px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                          {new Date(alert.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {!alert.readAt && !alert.archivedAt ? (
                          <button
                            onClick={() => markRead(alert.id).catch(() => undefined)}
                            style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.08)", color: "var(--color-accent-amber)", padding: "10px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Mark read
                          </button>
                        ) : null}
                        {!alert.archivedAt ? (
                          <button
                            onClick={() => archive(alert.id).catch(() => undefined)}
                            style={{ borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", padding: "10px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
