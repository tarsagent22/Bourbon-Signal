"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Check, Radar, Search, Users } from "lucide-react";
import { track } from "@vercel/analytics";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useDrops } from "@/hooks/useDrops";
import { useAuth } from "@/lib/auth";
import { getDisplayName, type DropEvent } from "@/lib/drops";
import styles from "./FreeMemberDashboard.module.css";

const CHECKLIST_KEY = "bourbon_signal_free_onboarding";
const PRODUCTION_HOSTS = new Set(["bourbonsignal.com", "www.bourbonsignal.com"]);

type ChecklistKey = "bottle_check" | "drop_feed" | "release_radar";

const onboardingSteps: Array<{ key: ChecklistKey; title: string; detail: string; href: string }> = [
  { key: "bottle_check", title: "Check a bottle", detail: "Use one of your three free Bottle Checks.", href: "/bottle-check" },
  { key: "drop_feed", title: "Read the latest signal", detail: "Preview the seven newest Drop Feed results.", href: "/#drops" },
  { key: "release_radar", title: "See what is coming", detail: "Explore upcoming releases in Release Radar.", href: "/release-radar" },
];

function trackFreeEvent(name: string, properties: Record<string, string>) {
  if (typeof window === "undefined" || !PRODUCTION_HOSTS.has(window.location.hostname)) return;
  track(name, properties);
}

function checklistStorageKey(userId: string | undefined) {
  return userId ? `${CHECKLIST_KEY}:${userId}` : CHECKLIST_KEY;
}

function readChecklist(userId: string | undefined): ChecklistKey[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(checklistStorageKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is ChecklistKey => onboardingSteps.some((step) => step.key === value)) : [];
  } catch {
    return [];
  }
}

function signalLocation(drop: DropEvent) {
  return drop.display_location || drop.locationName || drop.store_name || drop.store_city || drop.display_state || drop.state_code || drop.state || "Location available in the feed";
}

function signalAge(drop: DropEvent) {
  const timestamp = Date.parse(drop.timestamp || drop.observed_at || "");
  if (!Number.isFinite(timestamp)) return "Recently";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Within the hour";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FreeMemberDashboard() {
  const { drops, loading, error } = useDrops({ limit: 7 });
  const { user, entitlements } = useAuth();
  const [completed, setCompleted] = useState<ChecklistKey[]>([]);

  useEffect(() => {
    setCompleted(readChecklist(user?.id));
    trackFreeEvent("free_dashboard_viewed", { tier: "free", surface: "dashboard" });
  }, [user?.id]);

  useEffect(() => {
    void user?.reload().catch(() => undefined);
  }, [user?.id]);

  const bottleChecksRemaining = useMemo(() => {
    const rawUsage = user?.publicMetadata?.bottleCheckUsage;
    const metadataUsed = rawUsage && typeof rawUsage === "object" && typeof (rawUsage as Record<string, unknown>).used === "number"
      ? Math.max(0, Math.floor((rawUsage as { used: number }).used))
      : 0;
    const configuredLimit = entitlements.bottleCheckLimit;
    const limit = typeof configuredLimit === "number" && Number.isFinite(configuredLimit) ? Math.max(0, configuredLimit) : 3;
    return Math.max(0, limit - metadataUsed);
  }, [entitlements.bottleCheckLimit, user?.publicMetadata?.bottleCheckUsage]);

  const completeStep = (key: ChecklistKey) => {
    const next = completed.includes(key) ? completed : [...completed, key];
    setCompleted(next);
    try {
      window.localStorage.setItem(checklistStorageKey(user?.id), JSON.stringify(next));
    } catch {
      // Navigation and product use must still work when browser storage is unavailable.
    }
    trackFreeEvent("free_onboarding_action_clicked", { tier: "free", surface: key });
  };

  return (
    <div className={styles.root}>
      <Navigation />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Free member access</p>
            <h1>Your free dashboard</h1>
            <p>Explore real Bourbon Signal value now. Upgrade only when you want saved alerts, the full feed, and advanced hunting tools.</p>
          </div>
          <div className={styles.accountBadge}><Check size={15} /> Free account active</div>
        </section>

        <section className={styles.stats} aria-label="Free account benefits">
          <article><Radar size={19} /><strong>{entitlements.feedPreviewLimit}</strong><span>recent signals included</span></article>
          <article><Search size={19} /><strong>{bottleChecksRemaining}</strong><span>Bottle Checks remaining</span></article>
          <article><Users size={19} /><strong>{entitlements.sightingsPreviewLimit}</strong><span>member sightings preview</span></article>
        </section>

        <section className={styles.workspace}>
          <div className={styles.signalsPanel}>
            <div className={styles.sectionHeading}>
              <div><p>Free feed preview</p><h2>Latest signals</h2></div>
              <Link href="/#drops" onClick={() => completeStep("drop_feed")}>Open feed <ArrowRight size={14} /></Link>
            </div>

            <div className={styles.signalList}>
              {loading ? <div className={styles.empty}>Loading the latest signals…</div> : null}
              {!loading && error ? <div className={styles.empty}>The feed preview could not load. Try the full feed again shortly.</div> : null}
              {!loading && !error && drops.length === 0 ? <div className={styles.empty}>No public signals are available right now. Release Radar and Bottle Check are still ready.</div> : null}
              {drops.map((drop, index) => (
                <article className={styles.signal} key={`${drop.canonical_id || drop.bottle_id || getDisplayName(drop)}-${drop.store_id || drop.store_name || index}-${drop.timestamp}`}>
                  <div className={styles.signalIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <div><strong>{getDisplayName(drop)}</strong><span>{signalLocation(drop)}</span></div>
                  <time>{signalAge(drop)}</time>
                </article>
              ))}
            </div>
          </div>

          <aside className={styles.checklistPanel}>
            <div className={styles.sectionHeading}>
              <div><p>Make the account useful</p><h2>Getting started</h2></div>
              <span className={styles.progress}>{completed.length} / {onboardingSteps.length}</span>
            </div>
            <div className={styles.checklist}>
              {onboardingSteps.map((step, index) => {
                const done = completed.includes(step.key);
                return (
                  <Link key={step.key} href={step.href} onClick={() => completeStep(step.key)} data-complete={done}>
                    <span className={styles.check}>{done ? <Check size={14} /> : index + 1}</span>
                    <span><strong>{step.title}</strong><small>{step.detail}</small></span>
                    <ArrowRight size={15} />
                  </Link>
                );
              })}
            </div>
            <Link className={styles.sightingsAction} href="/sightings"><Users size={16} /> Preview or submit a member sighting</Link>
          </aside>
        </section>

        <section className={styles.upgradePanel}>
          <div className={styles.upgradeIcon}><BellRing size={22} /></div>
          <div>
            <p>Standard Proof</p>
            <h2>Unlock alerts when you are ready.</h2>
            <span>Keep using Free for as long as you like. Upgrade when saved areas, tracked bottles, email, on-site, and SMS alerts would make your hunt easier.</span>
          </div>
          <Link href="/pricing?source=dashboard">Compare memberships <ArrowRight size={15} /></Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
