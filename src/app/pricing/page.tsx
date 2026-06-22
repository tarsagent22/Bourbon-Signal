"use client";

import { Suspense, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { useAuth } from "@/lib/auth";
import type { BillingPlanId, MembershipTier } from "@/lib/entitlements";

const tierRank: Record<MembershipTier, number> = {
  free: 0,
  standard: 1,
  barrel: 2,
  "bottled-in-bond": 3,
};

type PaidPlanId = BillingPlanId;

type PricingTier = {
  tier: MembershipTier;
  eyebrow: string;
  name: string;
  price: string;
  cadence: string;
  annual?: string;
  description: string;
  signalPromise: string;
  features: string[];
  limits: string[];
  cta: string;
  plan: PaidPlanId | null;
  annualPlan?: PaidPlanId;
  accent: "quiet" | "standard" | "barrel" | "founder";
  featured?: boolean;
};

const tiers: PricingTier[] = [
  {
    tier: "free",
    eyebrow: "Free",
    name: "Public Signal",
    price: "$0",
    cadence: "preview access",
    description: "A small window into the feed while you decide whether Bourbon Signal belongs in your hunt.",
    signalPromise: "Newest-feed preview only. No saved alert setup.",
    features: ["5 newest feed items", "3 Bottle Checks after sign-up", "Upgrade prompts when a bottle is worth tracking"],
    limits: ["No email alerts", "No SMS alerts", "No Member Sightings"],
    cta: "Start free",
    plan: null,
    accent: "quiet",
  },
  {
    tier: "standard",
    eyebrow: "Standard",
    name: "Daily Watch",
    price: "$4.99",
    cadence: "monthly",
    annual: "$39.99 yearly",
    description: "For members who want Bourbon Signal to watch the right markets and text or email when real leads match.",
    signalPromise: "Paid alerts without turning the product into a control panel.",
    features: ["Email + SMS alerts for major drops", "5 alert areas", "15 tracked bottles", "Full Bottle Check", "Read and submit Member Sightings"],
    limits: ["State-level filters", "Conservative SMS caps", "No Sightings-triggered alerts yet"],
    cta: "Choose Standard",
    plan: "standard_monthly",
    annualPlan: "standard_annual",
    accent: "standard",
  },
  {
    tier: "barrel",
    eyebrow: "Barrel",
    name: "Serious Hunt",
    price: "$9.99",
    cadence: "monthly",
    annual: "$79.99 yearly",
    description: "The fuller intelligence layer for people who want more saved territory, more bottles, and sharper filtering.",
    signalPromise: "More room to track the bottles and markets you actually care about.",
    features: ["Higher-limit email + SMS alerts", "Effectively unlimited alert areas", "Effectively unlimited tracked bottles", "Advanced area filters", "Sightings alerts when enabled"],
    limits: ["Beta access", "Early feature access", "Built for multi-market hunters"],
    cta: "Choose Barrel",
    plan: "barrel_monthly",
    annualPlan: "barrel_annual",
    accent: "barrel",
    featured: true,
  },
  {
    tier: "bottled-in-bond",
    eyebrow: "Bottled-in-Bond Founder",
    name: "One of 100",
    price: "$59.99",
    cadence: "one-time lifetime",
    description: "Lifetime access to every current and future paid Bourbon Signal feature. When 100 spots sell, this tier disappears.",
    signalPromise: "A launch-window founder pass, not another subscription.",
    features: ["All Barrel features", "Highest launch SMS caps", "All future paid member features", "Founder status", "100 total lifetime spots"],
    limits: ["One-time purchase", "No recurring billing", "Best value if you believe in the product"],
    cta: "Claim Founder spot",
    plan: "bib_lifetime",
    accent: "founder",
  },
];

const comparisonRows = [
  ["Public feed", "5 newest", "Full feed", "Full feed", "Full feed"],
  ["Bottle Check", "3 checks", "Unlimited", "Unlimited", "Unlimited"],
  ["Alert areas", "—", "5", "Unlimited", "Unlimited"],
  ["Tracked bottles", "—", "15", "Unlimited", "Unlimited"],
  ["Email alerts", "—", "Major drops", "Higher limit", "Highest limit"],
  ["SMS alerts", "—", "Major drops", "Higher limit", "Highest limit"],
  ["Member Sightings", "—", "Read + submit", "Read + submit + alerts", "Read + submit + alerts"],
  ["Advanced filters", "—", "State-level", "Advanced", "Advanced"],
];

function PricingPageContent() {
  const router = useRouter();
  const { isSignedIn, memberTier } = useAuth();
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTierRank = tierRank[memberTier];
  const highestTier = memberTier === "bottled-in-bond";

  const memberStatus = useMemo(() => {
    if (!isSignedIn) return "Sign up first, then pick a paid level when checkout opens.";
    if (highestTier) return "You already have the highest Bourbon Signal membership.";
    if (memberTier === "barrel") return "You are on Barrel. Founder lifetime access is still available while spots last.";
    if (memberTier === "standard") return "You are on Standard. Barrel and Founder remain available from this page.";
    return "You are on Free. Paid alert channels unlock with Standard and above.";
  }, [highestTier, isSignedIn, memberTier]);

  async function startCheckout(plan: PaidPlanId | null, targetTier: MembershipTier) {
    setError(null);
    if (!plan) {
      router.push("/sign-up?redirect_url=/dashboard");
      return;
    }
    if (tierRank[targetTier] <= currentTierRank) {
      setError(targetTier === memberTier ? "You already have this membership level." : "Your current membership already includes this level.");
      return;
    }
    if (!isSignedIn) {
      router.push(`/sign-up?redirect_url=${encodeURIComponent(`/pricing?checkout=${plan}`)}`);
      return;
    }

    setPendingPlan(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout is not ready yet.");
      window.location.href = data.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is not ready yet.");
    } finally {
      setPendingPlan(null);
    }
  }

  function actionLabel(tier: PricingTier, plan: PaidPlanId | null) {
    if (tierRank[tier.tier] < currentTierRank) return "Included";
    if (tier.tier === memberTier) return "Current plan";
    if (plan !== null && pendingPlan === plan) return "Opening checkout…";
    return tier.cta;
  }

  return (
    <>
      <Navigation />
      <motion.main
        className="launch-pricing-page overflow-x-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <style>{pricingCss}</style>

        <section className="pricing-hero">
          <ScrollReveal>
            <p className="pricing-kicker">Memberships open July 1</p>
            <h1>Choose how loud Bourbon Signal should ring.</h1>
            <p className="pricing-deck">
              Keep the free feed quiet, give paid members real alert channels, and reserve deeper filtering for the hunters who want the full board.
            </p>
            <div className="member-status" data-highest={highestTier}>
              <span>{highestTier ? "Bonded" : "Upgrade path"}</span>
              <p>{memberStatus}</p>
            </div>
          </ScrollReveal>
        </section>

        <section className="pricing-grid" aria-label="Bourbon Signal launch pricing tiers">
          {tiers.map((tier) => {
            const included = tierRank[tier.tier] < currentTierRank;
            const current = tier.tier === memberTier;
            const blocked = included || current || highestTier;
            return (
              <motion.article
                key={tier.name}
                className={`pricing-card ${tier.accent} ${tier.featured ? "featured" : ""} ${current ? "current" : ""}`}
                whileHover={{ y: -4, transition: { duration: 0.25 } }}
              >
                {tier.featured ? <div className="pricing-ribbon">Best paid monthly value</div> : null}
                {current ? <div className="current-badge">Current level</div> : null}
                <p className="pricing-eyebrow">{tier.eyebrow}</p>
                <h2>{tier.name}</h2>
                <div className="pricing-price-row">
                  <strong>{tier.price}</strong>
                  <span>{tier.cadence}{tier.annual ? ` · ${tier.annual}` : ""}</span>
                </div>
                <p className="pricing-description">{tier.description}</p>
                <p className="signal-promise">{tier.signalPromise}</p>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}><span>✓</span>{feature}</li>
                  ))}
                </ul>
                <div className="limit-stack">
                  {tier.limits.map((limit) => <span key={limit}>{limit}</span>)}
                </div>
                <div className="pricing-actions">
                  <button type="button" onClick={() => startCheckout(tier.plan, tier.tier)} disabled={blocked || (tier.plan !== null && pendingPlan === tier.plan)}>
                    {actionLabel(tier, tier.plan)}
                  </button>
                  {tier.annualPlan && !blocked ? (
                    <button type="button" className="secondary" onClick={() => startCheckout(tier.annualPlan!, tier.tier)} disabled={pendingPlan === tier.annualPlan}>
                      {pendingPlan === tier.annualPlan ? "Opening checkout…" : "Go annual"}
                    </button>
                  ) : null}
                </div>
              </motion.article>
            );
          })}
        </section>

        {error ? <p className="pricing-error" role="alert">{error}</p> : null}

        <section className="comparison-wrap" aria-label="Membership feature comparison">
          <div className="comparison-heading">
            <p>Feature map</p>
            <h2>What each level actually unlocks</h2>
          </div>
          <div className="comparison-table" role="table">
            <div className="comparison-row comparison-head" role="row">
              <span>Feature</span><span>Free</span><span>Standard</span><span>Barrel</span><span>BiB Founder</span>
            </div>
            {comparisonRows.map(([feature, free, standard, barrel, founder]) => (
              <div className="comparison-row" role="row" key={feature}>
                <span>{feature}</span><span>{free}</span><span>{standard}</span><span>{barrel}</span><span>{founder}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pricing-note">
          <p>
            SMS is now planned for all paid members, with conservative launch caps so the channel stays useful and affordable. Checkout stays gated until launch flags and Stripe configuration are intentionally enabled.
          </p>
        </section>
      </motion.main>
      <Footer />
    </>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageContent />
    </Suspense>
  );
}

const pricingCss = `
.launch-pricing-page { min-height:100vh; padding:124px 0 86px; color:var(--color-text-primary); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.16), transparent 34%), radial-gradient(circle at 88% 18%, rgba(184,115,51,.09), transparent 28%), linear-gradient(180deg, rgba(13,10,7,.25), transparent 42%), var(--color-bg-primary); }
.pricing-hero { width:min(1040px, calc(100% - 40px)); margin:0 auto; text-align:center; }
.pricing-kicker { margin:0; color:var(--color-accent-amber); font:900 11px/1 var(--font-jetbrains); letter-spacing:.16em; text-transform:uppercase; }
.pricing-hero h1 { max-width:880px; margin:16px auto 0; color:var(--color-cream); font:700 clamp(44px, 7vw, 82px)/.92 var(--font-playfair); letter-spacing:-.052em; }
.pricing-deck { max-width:710px; margin:20px auto 0; color:var(--color-text-secondary); font:16px/1.8 var(--font-dm-sans); }
.member-status { width:min(680px, 100%); margin:26px auto 0; border:1px solid rgba(245,237,214,.09); border-radius:999px; padding:10px 16px; display:flex; align-items:center; justify-content:center; gap:12px; background:rgba(255,255,255,.035); box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
.member-status[data-highest="true"] { border-color:rgba(196,148,58,.32); background:rgba(196,148,58,.07); }
.member-status span { color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.14em; text-transform:uppercase; }
.member-status p { margin:0; color:var(--color-text-secondary); font:13px/1.5 var(--font-dm-sans); }
.pricing-grid { width:min(1200px, calc(100% - 40px)); margin:46px auto 0; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; align-items:stretch; }
.pricing-card { position:relative; display:flex; flex-direction:column; min-width:0; border:1px solid rgba(245,237,214,.09); border-radius:24px; padding:24px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); overflow:hidden; }
.pricing-card::after { content:""; position:absolute; inset:auto 18px 0; height:1px; background:linear-gradient(90deg, transparent, rgba(196,148,58,.36), transparent); opacity:.7; }
.pricing-card.featured { border-color:rgba(196,148,58,.55); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.19), transparent 44%), linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.026)); box-shadow:0 0 70px rgba(196,148,58,.11), 0 28px 100px rgba(0,0,0,.34); }
.pricing-card.founder { border-color:rgba(212,164,74,.32); background:radial-gradient(circle at 18% 0%, rgba(212,164,74,.18), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.024)); }
.pricing-card.current { border-color:rgba(136,211,148,.38); }
.pricing-ribbon { margin:-24px -24px 20px; padding:9px 12px; text-align:center; color:#130F0A; background:linear-gradient(135deg, #C4943A, #D4A44A); font:900 11px/1 var(--font-dm-sans); letter-spacing:.12em; text-transform:uppercase; }
.current-badge { position:absolute; top:14px; right:14px; border:1px solid rgba(136,211,148,.28); border-radius:999px; padding:6px 8px; color:#c9f5d0; background:rgba(136,211,148,.08); font:900 9px/1 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.pricing-eyebrow { margin:0; color:rgba(245,237,214,.42); font:900 11px/1 var(--font-dm-sans); letter-spacing:.14em; text-transform:uppercase; }
.pricing-card.barrel .pricing-eyebrow, .pricing-card.founder .pricing-eyebrow { color:var(--color-accent-amber); }
.pricing-card h2 { margin:10px 0 0; color:var(--color-cream); font:700 29px/1.05 var(--font-playfair); letter-spacing:-.028em; }
.pricing-price-row { margin-top:18px; display:grid; gap:4px; }
.pricing-price-row strong { color:var(--color-cream); font:800 46px/.9 var(--font-playfair); }
.pricing-card.founder .pricing-price-row strong, .pricing-card.featured .pricing-price-row strong { color:var(--color-accent-amber); }
.pricing-price-row span { color:var(--color-text-tertiary); font:800 12px/1.4 var(--font-dm-sans); }
.pricing-description { min-height:88px; margin:18px 0 0; color:var(--color-text-secondary); font:13px/1.65 var(--font-dm-sans); }
.signal-promise { margin:14px 0 0; border-left:2px solid rgba(196,148,58,.46); padding-left:10px; color:var(--color-cream); font:800 12px/1.55 var(--font-dm-sans); }
.pricing-card ul { margin:20px 0 0; padding:0; list-style:none; display:grid; gap:10px; }
.pricing-card li { display:flex; gap:9px; align-items:flex-start; color:rgba(245,237,214,.78); font:13px/1.42 var(--font-dm-sans); }
.pricing-card li span { flex:0 0 auto; color:var(--color-accent-amber); }
.limit-stack { margin-top:16px; display:flex; flex-wrap:wrap; gap:7px; }
.limit-stack span { border:1px solid rgba(245,237,214,.09); border-radius:999px; padding:6px 8px; color:var(--color-text-tertiary); background:rgba(255,255,255,.03); font:800 10px/1 var(--font-dm-sans); }
.pricing-actions { margin-top:auto; padding-top:24px; display:grid; gap:9px; }
.pricing-actions button { width:100%; border:1px solid rgba(196,148,58,.46); border-radius:13px; background:linear-gradient(135deg, rgba(196,148,58,.98), rgba(212,164,74,.98)); color:#17110B; padding:13px 14px; font:900 13px/1 var(--font-dm-sans); cursor:pointer; transition:transform .18s ease, border-color .18s ease, opacity .18s ease; }
.pricing-actions button:hover:not(:disabled), .pricing-actions button:focus-visible:not(:disabled) { transform:translateY(-1px); outline:none; border-color:rgba(245,237,214,.62); }
.pricing-actions button.secondary { background:rgba(255,255,255,.035); border-color:rgba(245,237,214,.13); color:var(--color-cream); }
.pricing-actions button:disabled { cursor:default; opacity:.58; }
.pricing-error { width:min(760px, calc(100% - 40px)); margin:20px auto 0; color:#ffb4a8; text-align:center; font:800 13px/1.5 var(--font-dm-sans); }
.comparison-wrap { width:min(1040px, calc(100% - 40px)); margin:56px auto 0; border:1px solid rgba(245,237,214,.08); border-radius:26px; padding:24px; background:rgba(255,255,255,.026); box-shadow:0 24px 80px rgba(0,0,0,.22); }
.comparison-heading { display:flex; align-items:end; justify-content:space-between; gap:18px; margin-bottom:18px; }
.comparison-heading p { margin:0; color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.16em; text-transform:uppercase; }
.comparison-heading h2 { margin:0; color:var(--color-cream); font:700 clamp(26px, 3vw, 38px)/1 var(--font-playfair); letter-spacing:-.03em; }
.comparison-table { display:grid; gap:1px; overflow:hidden; border-radius:16px; border:1px solid rgba(245,237,214,.07); }
.comparison-row { display:grid; grid-template-columns:1.3fr repeat(4, 1fr); background:rgba(255,255,255,.026); }
.comparison-row span { min-width:0; padding:13px 12px; color:var(--color-text-secondary); font:800 12px/1.35 var(--font-dm-sans); border-right:1px solid rgba(245,237,214,.055); }
.comparison-row span:first-child { color:var(--color-cream); }
.comparison-row span:last-child { border-right:0; }
.comparison-head { background:rgba(196,148,58,.09); }
.comparison-head span { color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.pricing-note { width:min(820px, calc(100% - 40px)); margin:34px auto 0; border:1px solid rgba(196,148,58,.15); border-radius:20px; padding:18px 20px; background:rgba(196,148,58,.055); text-align:center; }
.pricing-note p { margin:0; color:var(--color-text-secondary); font:13px/1.65 var(--font-dm-sans); }
@media (max-width: 1120px) { .pricing-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .member-status { border-radius:20px; align-items:flex-start; text-align:left; justify-content:flex-start; } .comparison-wrap { overflow-x:auto; padding:16px; } .comparison-heading { display:grid; align-items:start; } .comparison-row { min-width:760px; } }
@media (max-width: 640px) { .launch-pricing-page { padding-top:108px; } .pricing-grid { grid-template-columns:1fr; width:calc(100% - 28px); } .pricing-hero, .pricing-note, .pricing-error, .comparison-wrap { width:calc(100% - 28px); } .pricing-hero h1 { font-size:clamp(42px, 12vw, 58px); } .pricing-description { min-height:0; } }
`;
