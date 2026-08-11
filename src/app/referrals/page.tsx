"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

type ReferralSummary = {
  code: string;
  referralLink: string;
  referralPoints: number;
  communityPoints: number;
  totalPoints: number;
  freePointsAwarded: number;
  referrals: { total: number; free: number; standard: number; barrel: number; founder: number };
  founderGlassesEarned: number;
  founderGlassesAwaitingAddress: number;
  redemptionEligible: boolean;
  tier: string;
};

const tiers = [
  ["Free", "1 point", "Up to 5 points from Free-only referrals"],
  ["Standard", "5 points", "Total value after an upgrade"],
  ["Barrel", "10 points", "Total value after an upgrade"],
  ["Founder", "15 points + glass", "One unnumbered Glencairn per Founder referral"],
] as const;

export default function ReferralsPage() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmingAddress, setConfirmingAddress] = useState(false);
  const [glassMessage, setGlassMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/referrals/me", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load referrals");
        if (active) setSummary(body);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Could not load referrals"));
    return () => { active = false; };
  }, []);

  const copyLink = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary.referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  async function shareLink() {
    if (!summary) return;
    if (navigator.share) {
      await navigator.share({ title: "Join Bourbon Signal", text: "Join me on Bourbon Signal.", url: summary.referralLink });
      return;
    }
    await copyLink();
  }

  async function confirmGlassAddress() {
    if (!summary || confirmingAddress) return;
    setConfirmingAddress(true);
    setGlassMessage("");
    const response = await fetch("/api/referrals/glasses/confirm", { method: "POST" });
    const payload = await response.json().catch(() => ({})) as { error?: string; confirmed?: number };
    if (!response.ok) setGlassMessage(payload.error || "Address confirmation failed.");
    else {
      setSummary({ ...summary, founderGlassesAwaitingAddress: 0 });
      setGlassMessage(`${payload.confirmed || 0} glass${payload.confirmed === 1 ? "" : "es"} confirmed for fulfillment.`);
    }
    setConfirmingAddress(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      <Navigation />
      <main className="referral-page">
        <header className="referral-header">
          <p className="referral-eyebrow">Member referrals</p>
          <h1>Share Bourbon Signal.</h1>
          <p>Your link stays tied to you. Points update when a referred member joins or upgrades.</p>
        </header>

        {error ? <div className="referral-error">{error}</div> : null}
        {!summary && !error ? <div className="referral-loading">Loading your referral link…</div> : null}

        {summary ? (
          <>
            <section className="referral-card referral-share-card">
              <div>
                <p className="referral-label">Your referral link</p>
                <p className="referral-link">{summary.referralLink}</p>
                <p className="referral-code">Code <strong>{summary.code}</strong></p>
              </div>
              <div className="referral-actions">
                <button type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                <button type="button" className="secondary" onClick={shareLink}>Share</button>
              </div>
            </section>

            <section className="referral-stats" aria-label="Referral totals">
              <article><strong>{summary.totalPoints}</strong><span>Total points</span><small>{summary.referralPoints} referral · {summary.communityPoints} sightings</small></article>
              <article><strong>{summary.referrals.total}</strong><span>Referrals</span><small>{summary.freePointsAwarded}/5 Free points used</small></article>
              <article><strong>{summary.founderGlassesEarned}</strong><span>Founder glasses</span><small>{summary.founderGlassesAwaitingAddress ? "Address confirmation comes before shipping" : "One for every Founder referral"}</small></article>
            </section>

            {summary.founderGlassesAwaitingAddress > 0 ? (
              <section className="referral-card">
                <p className="referral-label">Shipping confirmation</p>
                <h2>Confirm the address for {summary.founderGlassesAwaitingAddress} glass{summary.founderGlassesAwaitingAddress === 1 ? "" : "es"}</h2>
                <p>Save or review your encrypted shipping profile, then confirm it here. Newly earned glasses require a new confirmation.</p>
                <div className="referral-actions"><a href="/settings#shipping">Review shipping address</a><button type="button" onClick={confirmGlassAddress} disabled={confirmingAddress}>{confirmingAddress ? "Confirming…" : "Confirm saved address"}</button></div>
                {glassMessage ? <p role="status">{glassMessage}</p> : null}
              </section>
            ) : null}

            <section className="referral-card">
              <div className="referral-section-heading">
                <div><p className="referral-label">How points work</p><h2>Highest tier reached</h2></div>
                <p>Upgrade awards add only the difference. The same referral never stacks duplicate tier totals.</p>
              </div>
              <div className="referral-tiers">
                {tiers.map(([name, points, detail]) => (
                  <article key={name}><div><strong>{name}</strong><span>{points}</span></div><p>{detail}</p></article>
                ))}
              </div>
              {!summary.redemptionEligible ? (
                <p className="referral-note">Free members can earn and keep points. A paid membership will be required when point redemption opens.</p>
              ) : null}
            </section>

            <section className="referral-card">
              <div className="referral-section-heading">
                <div><p className="referral-label">Your referrals</p><h2>Current highest tiers</h2></div>
              </div>
              <div className="referral-breakdown">
                <span>Free <strong>{summary.referrals.free}</strong></span>
                <span>Standard <strong>{summary.referrals.standard}</strong></span>
                <span>Barrel <strong>{summary.referrals.barrel}</strong></span>
                <span>Founder <strong>{summary.referrals.founder}</strong></span>
              </div>
            </section>
          </>
        ) : null}
      </main>
      <Footer />
      <style jsx>{`
        .referral-page { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 132px 0 84px; color: var(--color-text-primary); }
        .referral-header { max-width: 680px; margin-bottom: 28px; }
        .referral-eyebrow, .referral-label { margin: 0 0 8px; color: var(--color-accent-amber); font: 700 10px/1.2 var(--font-jetbrains); letter-spacing: .15em; text-transform: uppercase; }
        .referral-header h1 { margin: 0; font: 700 clamp(40px, 7vw, 64px)/.98 var(--font-playfair); letter-spacing: -.03em; }
        .referral-header > p:last-child { max-width: 610px; margin: 16px 0 0; color: var(--color-text-secondary); font: 15px/1.7 var(--font-dm-sans); }
        .referral-card, .referral-loading, .referral-error { border: 1px solid rgba(196,148,58,.2); border-radius: 20px; background: linear-gradient(180deg, rgba(25,20,15,.94), rgba(13,10,8,.97)); box-shadow: 0 22px 54px rgba(0,0,0,.25); padding: clamp(20px, 4vw, 28px); }
        .referral-error { color: #f3b3a8; }
        .referral-share-card { display: flex; align-items: center; justify-content: space-between; gap: 22px; }
        .referral-link { margin: 0; color: var(--color-cream); font: 700 15px/1.5 var(--font-dm-sans); overflow-wrap: anywhere; }
        .referral-code { margin: 7px 0 0; color: var(--color-text-secondary); font: 12px/1.4 var(--font-jetbrains); }
        .referral-actions { display: flex; gap: 8px; flex-shrink: 0; }
        button { min-height: 42px; border: 1px solid rgba(232,201,122,.45); border-radius: 999px; padding: 10px 16px; background: linear-gradient(135deg, #c4943a, #e8c97a); color: #100c08; font: 800 13px var(--font-dm-sans); cursor: pointer; }
        button.secondary { background: transparent; color: var(--color-cream); }
        .referral-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
        .referral-stats article { min-width: 0; border: 1px solid var(--boundary-subtle); border-radius: 16px; background: rgba(255,255,255,.018); padding: 20px; }
        .referral-stats strong { display: block; color: var(--color-cream); font: 700 32px/1 var(--font-playfair); }
        .referral-stats span { display: block; margin-top: 8px; font: 700 13px var(--font-dm-sans); }
        .referral-stats small { display: block; margin-top: 7px; color: var(--color-text-secondary); font: 11px/1.45 var(--font-dm-sans); }
        .referral-card + .referral-card { margin-top: 12px; }
        .referral-section-heading { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 18px; }
        .referral-section-heading h2 { margin: 0; font: 700 27px/1.1 var(--font-playfair); }
        .referral-section-heading > p { max-width: 410px; margin: 0; color: var(--color-text-secondary); font: 13px/1.55 var(--font-dm-sans); }
        .referral-tiers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .referral-tiers article { border: 1px solid var(--boundary-subtle); border-radius: 14px; padding: 15px; }
        .referral-tiers article div { display: flex; flex-direction: column; gap: 4px; }
        .referral-tiers strong { font: 800 14px var(--font-dm-sans); }
        .referral-tiers span { color: var(--color-accent-amber); font: 700 12px var(--font-jetbrains); }
        .referral-tiers p, .referral-note { margin: 10px 0 0; color: var(--color-text-secondary); font: 11px/1.5 var(--font-dm-sans); }
        .referral-note { border-top: 1px solid var(--boundary-subtle); padding-top: 14px; }
        .referral-breakdown { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .referral-breakdown span { display: flex; justify-content: space-between; border: 1px solid var(--boundary-subtle); border-radius: 12px; padding: 13px; color: var(--color-text-secondary); font: 12px var(--font-dm-sans); }
        .referral-breakdown strong { color: var(--color-cream); }
        @media (max-width: 720px) { .referral-share-card, .referral-section-heading { align-items: stretch; flex-direction: column; } .referral-actions button { flex: 1; } .referral-stats { grid-template-columns: 1fr; } .referral-tiers, .referral-breakdown { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
    </div>
  );
}
