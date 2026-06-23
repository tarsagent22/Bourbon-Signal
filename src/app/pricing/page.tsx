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

type BillingCycle = "monthly" | "annual";
type PaidPlanId = BillingPlanId;

type PricingTier = {
  tier: MembershipTier;
  name: string;
  eyebrow: string;
  monthlyPrice?: string;
  annualPrice?: string;
  oneTimePrice?: string;
  monthlyPlan?: PaidPlanId;
  annualPlan?: PaidPlanId;
  plan?: PaidPlanId;
  description: string;
  features: string[];
  footnote?: string;
  accent: "quiet" | "standard" | "barrel" | "founder";
  featured?: boolean;
};

const paidTiers: PricingTier[] = [
  {
    tier: "standard",
    name: "Standard Proof",
    eyebrow: "Core alerts",
    monthlyPrice: "$4.99",
    annualPrice: "$39.99",
    monthlyPlan: "standard_monthly",
    annualPlan: "standard_annual",
    description: "Essential email and SMS alerts with focused Drop Feed access.",
    features: [
      "Email and SMS alerts",
      "Up to 5 alert areas",
      "Up to 15 tracked bottles",
      "Full Drop Feed access with filter-by-state only",
      "Unlimited Bottle Check access",
      "Member Sightings",
      "No advanced feed filters or Sightings alerts",
    ],
    footnote: "Best for focused tracking without advanced feed filters.",
    accent: "standard",
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    monthlyPrice: "$9.99",
    annualPrice: "$79.99",
    monthlyPlan: "barrel_monthly",
    annualPlan: "barrel_annual",
    description: "Everything in Standard Proof, plus unlimited alerts and advanced discovery tools.",
    features: [
      "Everything in Standard Proof",
      "Unlimited alerts",
      "Advanced Drop Feed filters",
      "Member Sightings alerts",
      "My Collection and Recommended Bottles",
    ],
    footnote: "Best recurring plan if you miss the founder pass.",
    accent: "barrel",
  },
  {
    tier: "bottled-in-bond",
    name: "Bottled in Bond Founder",
    eyebrow: "Limited founder offer",
    oneTimePrice: "$59.99",
    plan: "bib_lifetime",
    description: "Lifetime access to all current and future Bourbon Signal features.",
    features: [
      "Lifetime access to all current and future features",
      "Only 100 spots",
      "Founder badge and number",
      "Numbered Founder’s glass",
      "Founder-only exclusive benefits",
    ],
    footnote: "Pay once before the founder allocation is gone.",
    accent: "founder",
    featured: true,
  },
];

const freeFeatures = ["Limited Drop Feed access", "3 Bottle Checks", "Upgrade anytime for instant alerts"];

const comparisonRows = [
  ["Drop Feed access", "Limited", "Full · state filter only", "Full · advanced filters", "Full · advanced filters"],
  ["Bottle Checks", "3", "Unlimited", "Unlimited", "Unlimited"],
  ["Email and SMS alerts", "—", "✓", "✓", "✓"],
  ["Alert areas", "—", "Up to 5", "Unlimited", "Unlimited"],
  ["Tracked bottles", "—", "Up to 15", "Unlimited", "Unlimited"],
  ["Member Sightings", "—", "✓", "✓", "✓"],
  ["Sightings alerts", "—", "—", "✓", "✓"],
  ["My Collection / recommendations", "—", "—", "✓", "✓"],
  ["Lifetime current and future features", "—", "—", "—", "✓"],
  ["Founder badge and number", "—", "—", "—", "✓"],
  ["Numbered Founder’s glass", "—", "—", "—", "✓"],
  ["Founder-only benefits", "—", "—", "—", "✓"],
];

function PricingPageContent() {
  const router = useRouter();
  const { isSignedIn, memberTier } = useAuth();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTierRank = tierRank[memberTier];
  const highestTier = memberTier === "bottled-in-bond";

  const memberStatus = useMemo(() => {
    if (!isSignedIn) return "Bottled in Bond is the limited founder pass. Standard and Barrel are regular memberships.";
    if (highestTier) return "You have the Bottled in Bond founder pass.";
    if (memberTier === "barrel") return "Barrel Proof is included if you claim Bottled in Bond while spots remain.";
    if (memberTier === "standard") return "Upgrade to Barrel Proof, or claim Bottled in Bond for lifetime access before founder spots are gone.";
    return "Free previews the signal. Alerts start with Standard Proof; lifetime access starts with Bottled in Bond.";
  }, [highestTier, isSignedIn, memberTier]);

  function selectedPlan(tier: PricingTier): PaidPlanId | null {
    if (tier.plan) return tier.plan;
    if (billingCycle === "annual" && tier.annualPlan) return tier.annualPlan;
    return tier.monthlyPlan || null;
  }

  function priceFor(tier: PricingTier) {
    if (tier.oneTimePrice) return { price: tier.oneTimePrice, cadence: "one time" };
    if (billingCycle === "annual") return { price: tier.annualPrice || "", cadence: "per year" };
    return { price: tier.monthlyPrice || "", cadence: "per month" };
  }

  async function startCheckout(plan: PaidPlanId | null, targetTier: MembershipTier) {
    setError(null);
    if (!plan) {
      router.push("/sign-up?redirect_url=/dashboard");
      return;
    }
    if (tierRank[targetTier] <= currentTierRank) {
      setError(targetTier === memberTier ? "You already have this membership." : "Your current membership already includes this tier.");
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
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout is not available.");
      window.location.href = data.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is not available.");
    } finally {
      setPendingPlan(null);
    }
  }

  function actionLabel(tier: PricingTier, plan: PaidPlanId | null) {
    if (tierRank[tier.tier] < currentTierRank) return "Included";
    if (tier.tier === memberTier) return "Current plan";
    if (plan !== null && pendingPlan === plan) return "Opening checkout…";
    if (tier.tier === "bottled-in-bond") return "Claim founder spot";
    return `Choose ${tier.name}`;
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
            <p className="pricing-kicker">Bourbon Signal Membership</p>
            <h1>The first 100 members get Bourbon Signal for life.</h1>
            <p className="pricing-deck">
              Bottled in Bond is the founder pass: one payment, Barrel Proof included, and every current and future paid feature. Prefer a regular membership? Standard and Barrel stay available below.
            </p>
            <div className="billing-toggle" aria-label="Billing cycle">
              <button type="button" data-active={billingCycle === "monthly"} onClick={() => setBillingCycle("monthly")}>
                Monthly
              </button>
              <button type="button" data-active={billingCycle === "annual"} onClick={() => setBillingCycle("annual")}>
                Annual <span>Save 33%</span>
              </button>
            </div>
            <p className="member-status">{memberStatus}</p>
          </ScrollReveal>
        </section>

        <section className="pricing-grid" aria-label="Bourbon Signal pricing tiers">
          <article className={`pricing-card quiet ${memberTier === "free" ? "current" : ""}`}>
            {memberTier === "free" ? <div className="current-badge">Current</div> : null}
            <p className="pricing-eyebrow">Preview</p>
            <h2>Free</h2>
            <div className="pricing-price-row">
              <strong>$0</strong>
              <span>preview access</span>
            </div>
            <p className="pricing-description">See what Bourbon Signal tracks before turning on alerts.</p>
            <ul>{freeFeatures.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
            <div className="pricing-actions">
              <button type="button" disabled={memberTier === "free"} onClick={() => router.push("/sign-up?redirect_url=/dashboard")}>
                {memberTier === "free" ? "Current plan" : "Included"}
              </button>
            </div>
          </article>

          {paidTiers.map((tier) => {
            const plan = selectedPlan(tier);
            const included = tierRank[tier.tier] < currentTierRank;
            const current = tier.tier === memberTier;
            const blocked = included || current || highestTier;
            const price = priceFor(tier);
            return (
              <motion.article
                key={tier.name}
                className={`pricing-card ${tier.accent} ${tier.featured ? "featured" : ""} ${current ? "current" : ""}`}
                whileHover={{ y: -4, transition: { duration: 0.25 } }}
              >
                {tier.featured ? <div className="pricing-ribbon">Founder pass · 100 spots</div> : null}
                {current ? <div className="current-badge">Current</div> : null}
                <p className="pricing-eyebrow">{tier.eyebrow}</p>
                <h2>{tier.name}</h2>
                <div className="pricing-price-row">
                  <strong>{price.price}</strong>
                  <span>{price.cadence}</span>
                </div>
                <p className="pricing-description">{tier.description}</p>
                <ul>{tier.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
                {tier.footnote ? <p className="tier-footnote">{tier.footnote}</p> : null}
                <div className="pricing-actions">
                  <button type="button" onClick={() => startCheckout(plan, tier.tier)} disabled={blocked || (plan !== null && pendingPlan === plan)}>
                    {actionLabel(tier, plan)}
                  </button>
                </div>
              </motion.article>
            );
          })}
        </section>

        {error ? <p className="pricing-error" role="alert">{error}</p> : null}

        <section className="comparison-wrap" aria-label="Membership feature comparison">
          <div className="comparison-heading">
            <p>Compare access</p>
            <h2>Founder pass vs. regular memberships</h2>
          </div>
          <div className="comparison-scroll" aria-label="Scroll plan comparison horizontally on small screens">
            <div className="comparison-table" role="table">
              <div className="comparison-row comparison-head" role="row">
                <span>Feature</span><span>Free preview</span><span>Standard</span><span>Barrel</span><span>Founder Pass<br />Includes Barrel</span>
              </div>
              {comparisonRows.map(([feature, free, standard, barrel, founder]) => (
                <div className="comparison-row" role="row" key={feature}>
                  {[feature, free, standard, barrel, founder].map((value, index) => (
                    <span key={`${feature}-${index}`} className={value === "✓" ? "included" : value === "—" ? "not-included" : undefined}>
                      {value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
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
.launch-pricing-page { min-height:100vh; padding:124px 0 86px; color:var(--color-text-primary); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.15), transparent 34%), radial-gradient(circle at 86% 18%, rgba(184,115,51,.08), transparent 28%), var(--color-bg-primary); }
.pricing-hero { width:min(980px, calc(100% - 40px)); margin:0 auto; text-align:center; }
.pricing-kicker { margin:0; color:var(--color-accent-amber); font:900 11px/1 var(--font-jetbrains); letter-spacing:.16em; text-transform:uppercase; }
.pricing-hero h1 { max-width:860px; margin:16px auto 0; color:var(--color-cream); font:700 clamp(44px, 7vw, 80px)/.93 var(--font-playfair); letter-spacing:-.052em; }
.pricing-deck { max-width:660px; margin:20px auto 0; color:var(--color-text-secondary); font:16px/1.75 var(--font-dm-sans); }
.billing-toggle { width:min(390px, 100%); margin:28px auto 0; display:grid; grid-template-columns:1fr 1fr; gap:6px; border:1px solid rgba(245,237,214,.10); border-radius:999px; padding:6px; background:rgba(255,255,255,.035); box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
.billing-toggle button { border:0; border-radius:999px; padding:11px 12px; color:var(--color-text-secondary); background:transparent; font:900 12px/1 var(--font-dm-sans); cursor:pointer; transition:background .18s ease, color .18s ease, transform .18s ease; }
.billing-toggle button[data-active="true"] { color:#17110B; background:linear-gradient(135deg, #C4943A, #D4A44A); box-shadow:0 10px 24px rgba(196,148,58,.18); }
.billing-toggle button:hover, .billing-toggle button:focus-visible { outline:none; transform:translateY(-1px); }
.billing-toggle span { margin-left:5px; font:900 10px/1 var(--font-jetbrains); letter-spacing:.08em; text-transform:uppercase; }
.member-status { width:min(640px, 100%); margin:18px auto 0; color:var(--color-text-tertiary); font:13px/1.55 var(--font-dm-sans); }
.pricing-grid { width:min(1200px, calc(100% - 40px)); margin:46px auto 0; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; align-items:stretch; }
.pricing-card { position:relative; display:flex; flex-direction:column; min-width:0; border:1px solid rgba(245,237,214,.09); border-radius:24px; padding:24px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); overflow:hidden; }
.pricing-card.quiet { order:4; }
.pricing-card.standard { order:2; }
.pricing-card.barrel { order:3; }
.pricing-card.founder { order:1; grid-column:span 2; }
.pricing-card.featured { border-color:rgba(196,148,58,.55); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.18), transparent 44%), linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.026)); box-shadow:0 0 70px rgba(196,148,58,.11), 0 28px 100px rgba(0,0,0,.34); }
.pricing-card.founder { border-color:rgba(212,164,74,.55); background:radial-gradient(circle at 18% 0%, rgba(212,164,74,.24), transparent 42%), radial-gradient(circle at 86% 12%, rgba(196,148,58,.15), transparent 36%), linear-gradient(180deg, rgba(255,255,255,.066), rgba(255,255,255,.028)); box-shadow:0 0 90px rgba(196,148,58,.16), 0 30px 110px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.06); }
.pricing-card.founder::after { content:""; position:absolute; inset:1px; pointer-events:none; border-radius:23px; background:linear-gradient(135deg, rgba(212,164,74,.18), transparent 30%, transparent 70%, rgba(212,164,74,.10)); }
.pricing-card.current { border-color:rgba(136,211,148,.38); }
.pricing-ribbon { margin:-24px -24px 20px; padding:9px 12px; text-align:center; color:#130F0A; background:linear-gradient(135deg, #C4943A, #D4A44A); font:900 11px/1 var(--font-dm-sans); letter-spacing:.12em; text-transform:uppercase; }
.current-badge { position:absolute; top:14px; right:14px; border:1px solid rgba(136,211,148,.28); border-radius:999px; padding:6px 8px; color:#c9f5d0; background:rgba(136,211,148,.08); font:900 9px/1 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.pricing-eyebrow { margin:0; color:rgba(245,237,214,.42); font:900 11px/1 var(--font-dm-sans); letter-spacing:.14em; text-transform:uppercase; }
.pricing-card.barrel .pricing-eyebrow, .pricing-card.founder .pricing-eyebrow { color:var(--color-accent-amber); }
.pricing-card h2 { margin:10px 0 0; color:var(--color-cream); font:700 31px/1.02 var(--font-playfair); letter-spacing:-.032em; }
.pricing-price-row { margin-top:18px; display:grid; gap:4px; }
.pricing-price-row strong { color:var(--color-cream); font:800 48px/.9 var(--font-playfair); }
.pricing-card.founder .pricing-price-row strong, .pricing-card.featured .pricing-price-row strong { color:var(--color-accent-amber); }
.pricing-price-row span { color:var(--color-text-tertiary); font:800 12px/1.4 var(--font-dm-sans); }
.pricing-description { min-height:54px; margin:18px 0 0; color:var(--color-text-secondary); font:14px/1.62 var(--font-dm-sans); }
.pricing-card ul { margin:20px 0 0; padding:0; list-style:none; display:grid; gap:10px; }
.pricing-card li { display:flex; gap:9px; align-items:flex-start; color:rgba(245,237,214,.80); font:13px/1.42 var(--font-dm-sans); }
.pricing-card li span { flex:0 0 auto; color:var(--color-accent-amber); }
.tier-footnote { margin:16px 0 0; border-top:1px solid rgba(245,237,214,.08); padding-top:14px; color:var(--color-text-tertiary); font:12px/1.55 var(--font-dm-sans); }
.pricing-actions { margin-top:auto; padding-top:24px; display:grid; gap:9px; }
.pricing-actions button { width:100%; border:1px solid rgba(196,148,58,.46); border-radius:13px; background:linear-gradient(135deg, rgba(196,148,58,.98), rgba(212,164,74,.98)); color:#17110B; padding:13px 14px; font:900 13px/1 var(--font-dm-sans); cursor:pointer; transition:transform .18s ease, border-color .18s ease, opacity .18s ease; }
.pricing-actions button:hover:not(:disabled), .pricing-actions button:focus-visible:not(:disabled) { transform:translateY(-1px); outline:none; border-color:rgba(245,237,214,.62); }
.pricing-actions button:disabled { cursor:default; opacity:.58; }
.pricing-error { width:min(760px, calc(100% - 40px)); margin:20px auto 0; color:#ffb4a8; text-align:center; font:800 13px/1.5 var(--font-dm-sans); }
.comparison-wrap { width:min(1040px, calc(100% - 40px)); margin:56px auto 0; border:1px solid rgba(245,237,214,.08); border-radius:26px; padding:24px; background:rgba(255,255,255,.026); box-shadow:0 24px 80px rgba(0,0,0,.22); }
.comparison-heading { display:flex; align-items:end; justify-content:space-between; gap:18px; margin-bottom:18px; }
.comparison-heading p { margin:0; color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.16em; text-transform:uppercase; }
.comparison-heading h2 { margin:0; color:var(--color-cream); font:700 clamp(26px, 3vw, 38px)/1 var(--font-playfair); letter-spacing:-.03em; }
.comparison-scroll { position:relative; overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; padding-bottom:6px; scrollbar-width:thin; scrollbar-color:rgba(196,148,58,.55) rgba(255,255,255,.04); }
.comparison-scroll::after { content:""; position:absolute; top:0; right:0; width:42px; height:100%; pointer-events:none; background:linear-gradient(90deg, transparent, rgba(16,12,9,.84)); opacity:0; }
.comparison-table { display:grid; min-width:860px; gap:1px; overflow:visible; border-radius:16px; border:1px solid rgba(245,237,214,.07); background:rgba(245,237,214,.055); box-shadow:inset 0 1px 0 rgba(255,255,255,.035); }
.comparison-row { display:grid; grid-template-columns:minmax(190px, 1.35fr) repeat(4, minmax(132px, 1fr)); background:rgba(255,255,255,.026); }
.comparison-row span { min-width:0; min-height:46px; display:flex; align-items:center; justify-content:center; padding:13px 12px; color:var(--color-text-secondary); font:800 12px/1.35 var(--font-dm-sans); text-align:center; border-right:1px solid rgba(245,237,214,.055); }
.comparison-row span:first-child { justify-content:flex-start; text-align:left; position:sticky; left:0; z-index:3; color:var(--color-cream); background:linear-gradient(90deg, rgba(26,20,15,.99), rgba(26,20,15,.94)); box-shadow:18px 0 30px rgba(10,7,5,.38); }
.comparison-row span:last-child { border-right:0; }
.comparison-row span.included { color:#17110B; font-size:0; }
.comparison-row span.included::before { content:"✓"; width:24px; height:24px; display:grid; place-items:center; border-radius:999px; color:#17110B; background:linear-gradient(135deg, #C4943A, #D4A44A); box-shadow:0 0 22px rgba(196,148,58,.18); font:950 14px/1 var(--font-dm-sans); }
.comparison-row span.not-included { color:rgba(245,237,214,.24); }
.comparison-head { background:rgba(196,148,58,.09); }
.comparison-head span { min-height:50px; color:var(--color-accent-amber); font:900 10px/1.15 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.comparison-head span:first-child { z-index:4; background:linear-gradient(90deg, rgba(49,35,19,.99), rgba(39,29,18,.95)); color:var(--color-accent-amber); }
@media (max-width: 1120px) { .pricing-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .comparison-wrap { width:calc(100% - 28px); padding:16px 0 16px 16px; overflow:hidden; } .comparison-heading { display:grid; align-items:start; padding-right:16px; } .comparison-scroll { padding-right:16px; } .comparison-scroll::after { opacity:1; } .comparison-table { min-width:760px; } .comparison-row { grid-template-columns:minmax(150px, .95fr) repeat(4, minmax(118px, 1fr)); } .comparison-row span { min-height:44px; padding:12px 10px; font-size:11px; } }
@media (max-width: 640px) { .launch-pricing-page { padding-top:108px; } .pricing-grid { grid-template-columns:1fr; width:calc(100% - 28px); } .pricing-card.founder { grid-column:auto; } .pricing-hero, .pricing-error { width:calc(100% - 28px); } .pricing-hero h1 { font-size:clamp(42px, 12vw, 58px); } .pricing-description { min-height:0; } }
`;
