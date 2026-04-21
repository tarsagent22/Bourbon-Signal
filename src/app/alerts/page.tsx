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
  const { alerts, unreadCount, loading, isEligible, markRead, markAllRead, archive } = useMemberAlerts(true);

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
              This is where your on-site alerts live. New drops stay here until you read or archive them, so you can move across the site without losing the thread.
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
            Alert inbox is available for paid members. Upgrade and turn on on-site alerts to keep your drop signals in one place.
          </div>
        ) : (
          <>
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
