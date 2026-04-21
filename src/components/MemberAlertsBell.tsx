"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, Archive, CheckCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemberAlerts } from "@/hooks/useMemberAlerts";

export default function MemberAlertsBell() {
  const [open, setOpen] = useState(false);
  const { alerts, unreadCount, isEligible, loading, markRead, markAllRead, archive } = useMemberAlerts(true);

  const recentAlerts = useMemo(() => alerts.filter((alert) => !alert.archivedAt).slice(0, 6), [alerts]);

  if (!isEligible) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label="Open alerts"
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "999px",
          border: open ? "1px solid rgba(196,148,58,0.48)" : "1px solid rgba(255,255,255,0.08)",
          background: open ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)",
          color: "var(--color-cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              minWidth: "18px",
              height: "18px",
              borderRadius: "999px",
              background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
              color: "#0D0B07",
              fontFamily: "var(--font-jetbrains)",
              fontSize: "10px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "calc(100% + 12px)",
              right: 0,
              width: "min(420px, calc(100vw - 32px))",
              background: "rgba(20, 16, 12, 0.98)",
              border: "1px solid rgba(196,148,58,0.16)",
              borderTop: "2px solid var(--color-accent-amber)",
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 18px 60px rgba(0,0,0,0.48)",
              zIndex: 300,
            }}
          >
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)" }}>Alert inbox</div>
                  <div style={{ marginTop: "4px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    Premium signals that follow you across the site.
                  </div>
                </div>
                {unreadCount > 0 ? (
                  <button
                    onClick={() => markAllRead().catch(() => undefined)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-accent-amber)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Mark all read
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ maxHeight: "420px", overflowY: "auto", padding: "10px" }}>
              {loading ? (
                <div style={{ padding: "14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  Loading alerts…
                </div>
              ) : recentAlerts.length === 0 ? (
                <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)", fontSize: "13px", lineHeight: 1.7 }}>
                  No alerts yet. Once a watched bottle hits your saved territory, it will land here.
                </div>
              ) : (
                recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      padding: "14px",
                      borderRadius: "14px",
                      border: alert.priorityClass === "major" ? "1px solid rgba(196,148,58,0.26)" : "1px solid rgba(255,255,255,0.06)",
                      background: alert.readAt ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.04)",
                      marginBottom: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-playfair)", fontSize: "18px", color: "var(--color-cream)" }}>{alert.bottleName}</span>
                          <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: alert.priorityClass === "major" ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>
                            {alert.priorityClass === "major" ? "Major hit" : alert.readAt ? "Seen" : "New"}
                          </span>
                        </div>
                        <div style={{ marginTop: "6px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                          {alert.storeLabel} · {alert.matchedArea}
                        </div>
                        <div style={{ marginTop: "4px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                          {new Date(alert.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        {!alert.readAt ? (
                          <button
                            onClick={() => markRead(alert.id).catch(() => undefined)}
                            aria-label="Mark read"
                            style={{ background: "none", border: "none", color: "var(--color-accent-amber)", cursor: "pointer" }}
                          >
                            <CheckCheck size={14} />
                          </button>
                        ) : null}
                        <button
                          onClick={() => archive(alert.id).catch(() => undefined)}
                          aria-label="Archive alert"
                          style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer" }}
                        >
                          <Archive size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <Link href="/alerts" onClick={() => setOpen(false)} style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-accent-amber)", textDecoration: "none" }}>
                Open full alert inbox →
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
