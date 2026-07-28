"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import FAQ from "@/components/sections/FAQ";
import { useAuth } from "@/lib/auth";
import type { BillingPlanId, MembershipTier } from "@/lib/entitlements";
import { isJulySaleEligiblePlan, julySalePriceLabel } from "@/lib/july-sale";

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

function checkoutContinueUrl(plan: PaidPlanId, source = "unknown", expectedPromotion?: string) {
  const promotion = expectedPromotion ? `&expectedPromotion=${encodeURIComponent(expectedPromotion)}` : "";
  return `/checkout/continue?plan=${plan}&source=${encodeURIComponent(source)}${promotion}&registration=1`;
}

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
    description: "Turn the state signal you just explored into a focused hunting plan.",
    features: [
      "Full state Drop Feed",
      "SMS, email, and on-site alerts",
      "Track up to 5 areas and 15 bottles",
      "Unlimited Bottle Checks",
    ],
    footnote: "Recommended for most hunters who know the markets and bottles they care about.",
    accent: "standard",
    featured: true,
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    monthlyPrice: "$4.99",
    annualPrice: "$49.99",
    monthlyPlan: "barrel_monthly",
    annualPlan: "barrel_annual",
    description: "Search more broadly, remove preference limits, and use advanced discovery tools.",
    features: [
      "Everything in Standard Proof",
      "Unlimited alert preferences",
      "Advanced Drop Feed filters and Sightings alerts",
      "Collection tools and bottle recommendations",
    ],
    footnote: "Best for hunters working across more areas with a larger watchlist.",
    accent: "barrel",
  },
  {
    tier: "bottled-in-bond",
    name: "Bottled in Bond",
    eyebrow: "Limited Founder Offer",
    oneTimePrice: "$49.99",
    plan: "bib_lifetime",
    description: "Get the complete Barrel Proof experience for one payment while founder spots remain.",
    features: [
      "Lifetime access to all current and future features",
      "Founder badge & number on profile",
      "Numbered Founder’s glass",
    ],
    footnote: "Pay once before the 100-member founder allocation is gone.",
    accent: "founder",
  },
];


function PricingPageContent({ julySaleEnabled }: { julySaleEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, memberTier } = useAuth();
  const julySaleActive = julySaleEnabled;
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(() => julySaleActive ? "annual" : "monthly");
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | "free" | null>(null);
  const checkoutInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [founderSpots, setFounderSpots] = useState<{ limit: number; remaining: number | null } | null>(null);

  const currentTierRank = tierRank[memberTier];
  const checkoutValue = searchParams.get("checkout");
  const checkoutParam = checkoutValue && Object.hasOwn(checkoutPlanTiers, checkoutValue)
    ? checkoutValue as PaidPlanId
    : null;
  const canceledValue = searchParams.get("canceled");
  const canceledPlan = canceledValue && Object.hasOwn(checkoutPlanTiers, canceledValue)
    ? canceledValue as PaidPlanId
    : null;
  const source = searchParams.get("source") || "unknown";

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

  function priceFor(tier: PricingTier, plan: PaidPlanId | null) {
    const regular = tier.oneTimePrice
      ? { price: tier.oneTimePrice, cadence: "one time" }
      : billingCycle === "annual"
        ? { price: tier.annualPrice || "", cadence: "per year" }
        : { price: tier.monthlyPrice || "", cadence: "per month" };
    const salePrice = julySaleActive && plan && isJulySaleEligiblePlan(plan)
      ? julySalePriceLabel(plan)
      : null;
    return { ...regular, salePrice };
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
    const expectedPromotion = julySaleActive && isJulySaleEligiblePlan(plan)
      ? "july_sale_2026"
      : undefined;
    if (!isSignedIn) {
      router.push(`/sign-up?redirect_url=${encodeURIComponent(checkoutContinueUrl(plan, source, expectedPromotion))}`);
      return;
    }
    if (checkoutInFlight.current) return;

    checkoutInFlight.current = true;
    setPendingPlan(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          source,
          expectedPromotion,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout is not available.");
      window.location.href = data.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is not available.");
    } finally {
      checkoutInFlight.current = false;
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
    if (!isSignedIn) return tier.tier === "bottled-in-bond" ? "Create account & claim spot" : "Create account & join";
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
                Annual <span>Save up to 30%</span>
              </button>
            </div>
          </ScrollReveal>
        </section>

        {isLoaded && (!isSignedIn || memberTier === "free") ? (
          <section className="free-preview-strip" aria-label="Continue with free access">
            <div>
              <p>Free · $0 · no card required</p>
              <h2>{isSignedIn ? "Your free account is active. Keep exploring without paying." : "Start free. Browse the signal before you pay."}</h2>
            </div>
            <ul>
              <li>7 recent Drop Feed signals</li>
              <li>3 Bottle Checks</li>
              <li>Release Radar and Member Sightings</li>
            </ul>
            <button type="button" onClick={() => router.push(isSignedIn ? "/dashboard" : "/sign-up?redirect_url=%2Fwelcome")}>
              {isSignedIn ? "Continue with Free" : "Create Free Account"}
            </button>
          </section>
        ) : null}

        {isLoaded && canceledPlan ? (
          <section className="checkout-canceled" role="status" aria-label="Checkout canceled">
            <div>
              <strong>Checkout canceled. You were not charged.</strong>
              <span>{memberTier === "free" ? "Your free access is still active." : "Your current membership is still active."} Nothing restarts unless you choose it.</span>
            </div>
            <div className="checkout-canceled-actions">
              <button
                type="button"
                disabled={pendingPlan === canceledPlan}
                onClick={() => startCheckout(canceledPlan, checkoutPlanTiers[canceledPlan])}
              >{pendingPlan === canceledPlan ? "Opening checkout…" : "Resume checkout"}</button>
              <button
                type="button"
                onClick={() => router.replace(source === "unknown" ? "/pricing" : `/pricing?source=${encodeURIComponent(source)}`)}
              >Choose another plan</button>
              <button type="button" onClick={() => router.push(isSignedIn ? "/dashboard" : "/sign-up?redirect_url=%2Fwelcome")}>{memberTier === "free" ? "Continue with Free" : "Continue with current plan"}</button>
            </div>
          </section>
        ) : null}

        {julySaleActive ? (
          <section className="july-sale-banner" aria-label="July membership sale">
            <p>July member sale</p>
            <div>
              <strong>15% off through July 31 at 11:00 PM ET</strong>
              <span>Standard annual $21.24 · Barrel annual $42.49 · Bottled in Bond Founder lifetime $42.49</span>
            </div>
            <em>Discount applied automatically at checkout · annual savings apply to the first annual payment</em>
          </section>
        ) : null}

        <section className="pricing-grid" aria-label="Bourbon Signal pricing tiers">
          {paidTiers.map((tier) => {
            const plan = selectedPlan(tier);
            const included = tierRank[tier.tier] < currentTierRank;
            const current = tier.tier === memberTier;
            const blocked = included || current || memberTier === "bottled-in-bond";
            const price = priceFor(tier, plan);
            return (
              <motion.article
                key={tier.name}
                className={`pricing-card ${tier.accent} ${tier.featured ? "featured" : ""} ${current ? "current" : ""}`}
                whileHover={{ y: -4, transition: { duration: 0.25 } }}
              >
                {tier.tier === "standard" ? <div className="pricing-ribbon">Recommended · Standard Proof</div> : null}
                {tier.tier === "bottled-in-bond" ? <div className="pricing-ribbon">Limited lifetime offer · 100 spots</div> : null}
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
                <div className={`pricing-price-row ${price.salePrice ? "sale" : ""}`}>
                  {price.salePrice ? (
                    <div className="sale-price-line"><del>{price.price}</del><strong>{price.salePrice}</strong></div>
                  ) : <strong>{price.price}</strong>}
                  <span>{price.cadence}</span>
                  {price.salePrice ? <small>15% off · applied automatically at checkout</small> : null}
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

        <section className="compact-differences" aria-labelledby="compact-differences-title">
          <h2 id="compact-differences-title">The differences that drive the decision</h2>
          <div>
            <article><strong>Standard keeps the hunt focused.</strong><span>Choose it for a defined set of states, areas, and bottles.</span></article>
            <article><strong>Barrel removes the working limits.</strong><span>Choose it for advanced filtering, Sightings alerts, collection tools, and broader tracking.</span></article>
            <article><strong>Founder changes how you pay.</strong><span>It carries Barrel-level access without a recurring fee while the limited allocation remains.</span></article>
          </div>
        </section>

        <FAQ variant="pricing" founderSpotsRemaining={founderSpots?.remaining ?? null} />
      </motion.main>
      <Footer />
    </>
  );
}

export default function PricingPageClient({ julySaleEnabled }: { julySaleEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <PricingPageContent julySaleEnabled={julySaleEnabled} />
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
.july-sale-banner { width:min(940px, calc(100% - 40px)); margin:24px auto 0; display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; border:1px solid rgba(232,201,122,.38); border-radius:18px; padding:16px 18px; background:linear-gradient(135deg, rgba(196,148,58,.19), rgba(82,54,24,.15)); box-shadow:0 18px 60px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.06); }
.july-sale-banner p { margin:0; border-radius:999px; padding:7px 9px; color:#17110B; background:linear-gradient(135deg, #E8C97A, #C4943A); font:950 9px/1 var(--font-jetbrains); letter-spacing:.12em; text-transform:uppercase; white-space:nowrap; }
.july-sale-banner div { display:grid; gap:5px; min-width:0; }
.july-sale-banner strong { color:var(--color-cream); font:700 22px/1.05 var(--font-playfair); }
.july-sale-banner span { color:var(--color-text-secondary); font:800 12px/1.35 var(--font-dm-sans); }
.july-sale-banner em { color:#E8C97A; font:900 11px/1.35 var(--font-dm-sans); font-style:normal; text-align:right; }
.free-preview-strip { width:min(940px, calc(100% - 40px)); margin:30px auto 0; display:grid; grid-template-columns:1.2fr 1fr auto; gap:18px; align-items:center; border:1px solid rgba(245,237,214,.08); border-radius:22px; padding:18px 20px; background:linear-gradient(135deg, rgba(255,255,255,.044), rgba(196,148,58,.035)); box-shadow:0 18px 70px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.04); }
.free-preview-strip p { margin:0 0 7px; color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.15em; text-transform:uppercase; }
.free-preview-strip h2 { margin:0; color:var(--color-cream); font:700 clamp(21px, 2.2vw, 30px)/1.06 var(--font-playfair); letter-spacing:-.03em; }
.free-preview-strip ul { margin:0; padding:0; list-style:none; display:grid; gap:7px; color:var(--color-text-secondary); font:800 12px/1.25 var(--font-dm-sans); }
.free-preview-strip li::before { content:"•"; color:var(--color-accent-amber); margin-right:7px; }
.free-preview-strip button { border:1px solid rgba(196,148,58,.38); border-radius:13px; padding:12px 15px; color:var(--color-cream); background:rgba(196,148,58,.10); font:900 12px/1 var(--font-dm-sans); cursor:pointer; white-space:nowrap; transition:background .18s ease, transform .18s ease; }
.free-preview-strip button:hover, .free-preview-strip button:focus-visible { outline:none; background:rgba(196,148,58,.17); transform:translateY(-1px); }
.checkout-canceled { width:min(940px, calc(100% - 40px)); margin:20px auto 0; display:grid; gap:14px; border:1px solid rgba(136,211,148,.3); border-radius:18px; padding:16px 18px; background:rgba(136,211,148,.06); }
.checkout-canceled > div:first-child { display:grid; gap:5px; }
.checkout-canceled strong { color:#d7f4dc; font:800 16px/1.25 var(--font-dm-sans); }
.checkout-canceled span { color:var(--color-text-secondary); font:13px/1.5 var(--font-dm-sans); }
.checkout-canceled-actions { display:flex; flex-wrap:wrap; gap:8px; }
.checkout-canceled-actions button { border:1px solid rgba(245,237,214,.16); border-radius:10px; padding:10px 12px; color:var(--color-cream); background:rgba(245,237,214,.04); font:800 12px/1 var(--font-dm-sans); cursor:pointer; }
.checkout-canceled-actions button:first-child { border-color:rgba(196,148,58,.4); color:#17110B; background:linear-gradient(135deg, #C4943A, #D4A44A); }
.checkout-canceled-actions button:disabled { cursor:wait; opacity:.62; }
.checkout-canceled-actions button:hover:not(:disabled), .checkout-canceled-actions button:focus-visible:not(:disabled) { outline:2px solid rgba(232,201,122,.55); outline-offset:2px; }
.pricing-grid { width:min(980px, calc(100% - 40px)); margin:34px auto 0; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; align-items:stretch; }
.pricing-card { position:relative; display:flex; flex-direction:column; min-width:0; border:1px solid rgba(245,237,214,.09); border-radius:24px; padding:24px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); overflow:hidden; }
.pricing-card.standard { order:1; }
.pricing-card.barrel { order:2; }
.pricing-card.founder { order:3; grid-column:1 / -1; margin-top:30px; }
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
.sale-price-line { display:flex; align-items:baseline; gap:11px; flex-wrap:wrap; }
.sale-price-line del { color:rgba(245,237,214,.46); font:700 20px/1 var(--font-playfair); text-decoration-thickness:2px; }
.pricing-price-row small { margin-top:4px; color:#E8C97A; font:900 11px/1.35 var(--font-dm-sans); }
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
.compact-differences { width:min(980px, calc(100% - 40px)); margin:42px auto 0; border-top:1px solid rgba(245,237,214,.09); padding-top:30px; }
.compact-differences h2 { margin:0; color:var(--color-cream); font:700 clamp(26px, 3vw, 36px)/1.05 var(--font-playfair); letter-spacing:-.03em; }
.compact-differences > div { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; margin-top:18px; }
.compact-differences article { display:grid; gap:7px; padding:16px; border-radius:14px; background:rgba(245,237,214,.035); }
.compact-differences strong { color:rgba(245,237,214,.9); font:800 13px/1.35 var(--font-dm-sans); }
.compact-differences span { color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
@media (max-width: 900px) { .july-sale-banner { grid-template-columns:1fr; text-align:left; } .july-sale-banner p { width:max-content; } .july-sale-banner em { text-align:left; } .free-preview-strip { grid-template-columns:1fr; text-align:left; } .free-preview-strip button { width:100%; } }
@media (max-width: 760px) { .compact-differences > div { grid-template-columns:1fr; } }
@media (max-width: 640px) {
  .launch-pricing-page { width:100%; max-width:100vw; padding-top:108px; overflow-x:clip; }
  .pricing-hero,
  .july-sale-banner,
  .free-preview-strip,
  .pricing-grid,
  .pricing-error,
  .checkout-canceled,
  .compact-differences { width:calc(100vw - 28px); max-width:calc(100vw - 28px); box-sizing:border-box; }
  .pricing-grid { grid-template-columns:minmax(0, 1fr); }
  .pricing-card { width:100%; max-width:100%; box-sizing:border-box; }
  .pricing-card.founder { grid-column:auto; margin-top:20px; }
  .checkout-canceled-actions { display:grid; }
  .checkout-canceled-actions button { width:100%; }
  .pricing-hero h1 { max-width:100%; font-size:clamp(38px, 11vw, 50px); overflow-wrap:anywhere; }
  .billing-toggle { width:100%; min-width:0; box-sizing:border-box; }
  .billing-toggle button { min-width:0; padding:10px 6px; }
  .billing-toggle span { display:block; margin:4px 0 0; font-size:8px; }
  .july-sale-banner strong,
  .july-sale-banner span,
  .july-sale-banner em,
  .pricing-description,
  .tier-footnote { overflow-wrap:anywhere; }
  .pricing-description { min-height:0; }
}
`;
