"use client";

import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import FAQ from "@/components/sections/FAQ";
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

const checkoutPlanTiers: Record<PaidPlanId, MembershipTier> = {
  standard_monthly: "standard",
  standard_annual: "standard",
  barrel_monthly: "barrel",
  barrel_annual: "barrel",
  bib_lifetime: "bottled-in-bond",
};

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
    eyebrow: "Core Membership",
    monthlyPrice: "$2.99",
    annualPrice: "$24.99",
    monthlyPlan: "standard_monthly",
    annualPlan: "standard_annual",
    description: "Essential alerts and full access to most features with few limitations.",
    features: [
      "SMS, Email, and on-site alerts",
      "Up to 5 alert areas",
      "Up to 15 tracked bottles",
      "Full Drop Feed access with filter-by-state only",
      "Unlimited Bottle Check access",
      "Full Daily Briefing access",
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
    monthlyPrice: "$4.99",
    annualPrice: "$49.99",
    monthlyPlan: "barrel_monthly",
    annualPlan: "barrel_annual",
    description: "Everything in Standard Proof, plus unlimited alerts and advanced discovery tools.",
    features: [
      "Everything in Standard Proof",
      "No Alert Preference Limits",
      "Advanced Drop Feed filters",
      "Member Sightings alerts",
      "My Collection and Recommended Bottles",
    ],
    footnote: "Best recurring plan if you miss the founder pass.",
    accent: "barrel",
  },
  {
    tier: "bottled-in-bond",
    name: "Bottled in Bond",
    eyebrow: "Lifetime Founding Members",
    oneTimePrice: "$49.99",
    plan: "bib_lifetime",
    description: "Limited offer for members that want to experience the most that Bourbon Signal has to offer with no recurring fee.",
    features: [
      "Lifetime access to all current and future features",
      "Only 100 spots",
      "Founder badge & number on profile",
      "Numbered Founder’s glass",
      "Founder-only exclusive benefits",
    ],
    footnote: "Pay once before the founder allocation is gone.",
    accent: "founder",
    featured: true,
  },
];


const comparisonRows = [
  ["Drop Feed access", "Limited", "Full · state only", "Full · advanced", "Full · advanced"],
  ["Daily Briefing", "Limited", "Full", "Full", "Full"],
  ["Bottle Checks", "3", "Unlimited", "Unlimited", "Unlimited"],
  ["SMS, email, and on-site alerts", "—", "✓", "✓", "✓"],
  ["Alert preference limits", "—", "5 areas · 15 bottles", "No limits", "No limits"],
  ["Signal Strength meter", "—", "Markets + bottles + alerts", "Adds taste profile", "Adds taste profile + founder calibration"],
  ["Member Sightings", "—", "✓", "✓", "✓"],
  ["Sightings alerts", "—", "—", "✓", "✓"],
  ["My Collection", "—", "—", "✓", "✓"],
  ["Recommended Bottles", "—", "—", "✓", "✓"],
  ["Lifetime future features", "—", "—", "—", "✓"],
  ["Founder badge + number", "—", "—", "—", "✓"],
  ["Numbered Founder’s glass", "—", "—", "—", "✓"],
  ["Founder-only benefits", "—", "—", "—", "✓"],
];

function PricingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, memberTier } = useAuth();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [founderSpots, setFounderSpots] = useState<{ limit: number; remaining: number | null } | null>(null);

  const currentTierRank = tierRank[memberTier];
  const checkoutParam = searchParams.get("checkout") as PaidPlanId | null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/founder-spots")
      .then((res) => res.ok ? res.json() : null)
      .then((data: { limit?: number; remaining?: number | null } | null) => {
        if (!cancelled && data?.limit) setFounderSpots({ limit: data.limit, remaining: typeof data.remaining === "number" ? data.remaining : null });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (!isSignedIn || pendingPlan || !checkoutParam) return;
    const targetTier = checkoutPlanTiers[checkoutParam];
    if (!targetTier) return;
    void startCheckout(checkoutParam, targetTier);
  }, [checkoutParam, isSignedIn, pendingPlan]);

  function actionLabel(tier: PricingTier, plan: PaidPlanId | null) {
    if (tierRank[tier.tier] < currentTierRank) return "Included";
    if (tier.tier === memberTier) return "Current plan";
    if (plan !== null && pendingPlan === plan) return "Opening checkout…";
    if (tier.tier === "bottled-in-bond") return "Claim lifetime spot";
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
            <h1>Pick your proof.</h1>
            <div className="billing-toggle" aria-label="Billing cycle">
              <button type="button" data-active={billingCycle === "monthly"} onClick={() => setBillingCycle("monthly")}>
                Monthly
              </button>
              <button type="button" data-active={billingCycle === "annual"} onClick={() => setBillingCycle("annual")}>
                Annual <span>Save 17%</span>
              </button>
            </div>
          </ScrollReveal>
        </section>

        {!isSignedIn ? (
          <section className="free-preview-strip" aria-label="Free access account">
            <div>
              <p>Free access</p>
              <h2>Create an account first. Browse the signal before you pay.</h2>
            </div>
            <ul>
              <li>Limited Drop Feed access</li>
              <li>3 Bottle Checks</li>
              <li>Demo access to member tools</li>
            </ul>
            <button type="button" onClick={() => router.push("/sign-up?redirect_url=/pricing")}>Start free access</button>
          </section>
        ) : null}

        <section className="pricing-grid" aria-label="Bourbon Signal pricing tiers">
          {paidTiers.map((tier) => {
            const plan = selectedPlan(tier);
            const included = tierRank[tier.tier] < currentTierRank;
            const current = tier.tier === memberTier;
            const blocked = included || current || memberTier === "bottled-in-bond";
            const price = priceFor(tier);
            return (
              <motion.article
                key={tier.name}
                className={`pricing-card ${tier.accent} ${tier.featured ? "featured" : ""} ${current ? "current" : ""}`}
                whileHover={{ y: -4, transition: { duration: 0.25 } }}
              >
                {tier.featured ? <div className="pricing-ribbon">Lifetime offer · 100 spots</div> : null}
                {tier.tier === "bottled-in-bond" ? (
                  <div className="founder-spots-meter" aria-label="Bottled in Bond founder spots remaining">
                    <span className="founder-spots-label">Founder allocation</span>
                    <strong>{founderSpots?.remaining == null ? "Limited" : `${founderSpots.remaining} left`}</strong>
                    <span className="founder-spots-line"><i style={{ width: `${Math.max(0, Math.min(100, ((founderSpots?.remaining ?? 100) / (founderSpots?.limit || 100)) * 100))}%` }} /></span>
                  </div>
                ) : null}
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
            <h2>Compare Memberships</h2>
          </div>
          <div className="comparison-scroll" aria-label="Scroll plan comparison horizontally on small screens">
            <div className="comparison-table" role="table">
              <div className="comparison-row comparison-head" role="row">
                <span>Feature</span><span>Free access</span><span>Standard</span><span>Barrel</span><span>Bottled in Bond</span>
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

        <FAQ />
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
.billing-toggle { width:min(390px, 100%); margin:28px auto 0; display:grid; grid-template-columns:1fr 1fr; gap:6px; border:1px solid rgba(245,237,214,.10); border-radius:999px; padding:6px; background:rgba(255,255,255,.035); box-shadow:inset 0 1px 0 rgba(255,255,255,.04); }
.billing-toggle button { border:0; border-radius:999px; padding:11px 12px; color:var(--color-text-secondary); background:transparent; font:900 12px/1 var(--font-dm-sans); cursor:pointer; transition:background .18s ease, color .18s ease, transform .18s ease; }
.billing-toggle button[data-active="true"] { color:#17110B; background:linear-gradient(135deg, #C4943A, #D4A44A); box-shadow:0 10px 24px rgba(196,148,58,.18); }
.billing-toggle button:hover, .billing-toggle button:focus-visible { outline:none; transform:translateY(-1px); }
.billing-toggle span { margin-left:5px; font:900 10px/1 var(--font-jetbrains); letter-spacing:.08em; text-transform:uppercase; }
.free-preview-strip { width:min(940px, calc(100% - 40px)); margin:30px auto 0; display:grid; grid-template-columns:1.2fr 1fr auto; gap:18px; align-items:center; border:1px solid rgba(245,237,214,.08); border-radius:22px; padding:18px 20px; background:linear-gradient(135deg, rgba(255,255,255,.044), rgba(196,148,58,.035)); box-shadow:0 18px 70px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.04); }
.free-preview-strip p { margin:0 0 7px; color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.15em; text-transform:uppercase; }
.free-preview-strip h2 { margin:0; color:var(--color-cream); font:700 clamp(21px, 2.2vw, 30px)/1.06 var(--font-playfair); letter-spacing:-.03em; }
.free-preview-strip ul { margin:0; padding:0; list-style:none; display:grid; gap:7px; color:var(--color-text-secondary); font:800 12px/1.25 var(--font-dm-sans); }
.free-preview-strip li::before { content:"•"; color:var(--color-accent-amber); margin-right:7px; }
.free-preview-strip button { border:1px solid rgba(196,148,58,.38); border-radius:13px; padding:12px 15px; color:var(--color-cream); background:rgba(196,148,58,.10); font:900 12px/1 var(--font-dm-sans); cursor:pointer; white-space:nowrap; transition:background .18s ease, transform .18s ease; }
.free-preview-strip button:hover, .free-preview-strip button:focus-visible { outline:none; background:rgba(196,148,58,.17); transform:translateY(-1px); }
.pricing-grid { width:min(1200px, calc(100% - 40px)); margin:34px auto 0; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; align-items:stretch; }
.pricing-card { position:relative; display:flex; flex-direction:column; min-width:0; border:1px solid rgba(245,237,214,.09); border-radius:24px; padding:24px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); overflow:hidden; }
.pricing-card.standard { order:2; }
.pricing-card.barrel { order:3; }
.pricing-card.founder { order:1; }
.pricing-card.featured { border-color:rgba(196,148,58,.55); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.18), transparent 44%), linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.026)); box-shadow:0 0 70px rgba(196,148,58,.11), 0 28px 100px rgba(0,0,0,.34); }
.pricing-card.founder { border-color:rgba(212,164,74,.55); background:radial-gradient(circle at 18% 0%, rgba(212,164,74,.24), transparent 42%), radial-gradient(circle at 86% 12%, rgba(196,148,58,.15), transparent 36%), linear-gradient(180deg, rgba(255,255,255,.066), rgba(255,255,255,.028)); box-shadow:0 0 90px rgba(196,148,58,.16), 0 30px 110px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.06); }
.pricing-card.founder::after { content:""; position:absolute; inset:1px; pointer-events:none; border-radius:23px; background:linear-gradient(135deg, rgba(212,164,74,.18), transparent 30%, transparent 70%, rgba(212,164,74,.10)); }
.pricing-card.current { border-color:rgba(136,211,148,.38); }
.pricing-ribbon { margin:-24px -24px 20px; padding:9px 12px; text-align:center; color:#130F0A; background:linear-gradient(135deg, #C4943A, #D4A44A); font:900 11px/1 var(--font-dm-sans); letter-spacing:.12em; text-transform:uppercase; }
.current-badge { position:absolute; top:14px; right:14px; border:1px solid rgba(136,211,148,.28); border-radius:999px; padding:6px 8px; color:#c9f5d0; background:rgba(136,211,148,.08); font:900 9px/1 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.founder-spots-meter { position:relative; z-index:1; margin: -6px 0 16px; border:1px solid rgba(232,201,122,.22); border-radius:16px; padding:12px 13px; background:linear-gradient(135deg, rgba(10,8,5,.56), rgba(196,148,58,.07)); box-shadow:inset 0 1px 0 rgba(255,255,255,.045); }
.founder-spots-label { display:block; color:rgba(245,237,214,.48); font:900 9px/1 var(--font-jetbrains); letter-spacing:.14em; text-transform:uppercase; }
.founder-spots-meter strong { display:block; margin-top:5px; color:var(--color-cream); font:700 28px/.95 var(--font-playfair); letter-spacing:-.025em; }
.founder-spots-line { display:block; height:4px; margin-top:10px; border-radius:999px; overflow:hidden; background:rgba(245,237,214,.08); }
.founder-spots-line i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg, #E8C97A, #C4943A); box-shadow:0 0 18px rgba(232,201,122,.28); }
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
.comparison-table { display:grid; min-width:860px; gap:1px; overflow:visible; border-radius:16px; border:1px solid rgba(245,237,214,.07); background:rgba(245,237,214,.055); box-shadow:inset 0 1px 0 rgba(255,255,255,.035); isolation:isolate; }
.comparison-row { display:grid; grid-template-columns:minmax(190px, 1.35fr) repeat(4, minmax(132px, 1fr)); background:rgba(255,255,255,.026); }
.comparison-row span { min-width:0; min-height:46px; display:flex; align-items:center; justify-content:center; padding:13px 12px; color:var(--color-text-secondary); font:800 12px/1.35 var(--font-dm-sans); text-align:center; border-right:1px solid rgba(245,237,214,.055); }
.comparison-row span:first-child { justify-content:flex-start; text-align:left; position:sticky; left:0; z-index:3; color:var(--color-cream); background:linear-gradient(90deg, rgba(26,20,15,1), rgba(26,20,15,.98)); box-shadow:8px 0 14px rgba(10,7,5,.24); }
.comparison-row span:last-child { border-right:0; }
.comparison-row span.included { color:#17110B; font-size:0; }
.comparison-row span.included::before { content:"✓"; width:24px; height:24px; display:grid; place-items:center; border-radius:999px; color:#17110B; background:linear-gradient(135deg, #C4943A, #D4A44A); box-shadow:0 0 22px rgba(196,148,58,.18); font:950 14px/1 var(--font-dm-sans); }
.comparison-row span.not-included { color:rgba(245,237,214,.24); }
.comparison-head { background:rgba(196,148,58,.09); }
.comparison-head span { min-height:50px; color:var(--color-accent-amber); font:900 10px/1.15 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; }
.comparison-head span:first-child { z-index:4; background:linear-gradient(90deg, rgba(49,35,19,.99), rgba(39,29,18,.95)); color:var(--color-accent-amber); }
@media (max-width: 1120px) { .pricing-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) { .free-preview-strip { grid-template-columns:1fr; text-align:left; } .free-preview-strip button { width:100%; } }
@media (max-width: 760px) { .comparison-wrap { width:calc(100% - 28px); padding:16px 0 16px 16px; overflow:hidden; } .comparison-heading { display:grid; align-items:start; padding-right:16px; } .comparison-scroll { padding-right:16px; } .comparison-scroll::after { opacity:0; } .comparison-table { min-width:704px; border-radius:14px; } .comparison-row { grid-template-columns:132px repeat(4, 142px); } .comparison-row span { min-height:44px; padding:12px 9px; font-size:11px; } .comparison-row span:first-child { position:static; box-shadow:none; } .comparison-head span { font-size:9px; letter-spacing:.10em; } }
@media (max-width: 640px) { .launch-pricing-page { padding-top:108px; } .pricing-grid { grid-template-columns:1fr; width:calc(100% - 28px); } .pricing-card.founder { grid-column:auto; } .pricing-hero, .pricing-error { width:calc(100% - 28px); } .pricing-hero h1 { font-size:clamp(42px, 12vw, 58px); } .pricing-description { min-height:0; } }
`;



