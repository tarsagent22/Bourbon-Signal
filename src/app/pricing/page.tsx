"use client";

import { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import type { BillingPlanId } from "@/lib/entitlements";

type PaidPlanId = Exclude<BillingPlanId, never>;

const tiers = [
  {
    eyebrow: "Free",
    name: "Public Signal",
    price: "$0",
    cadence: "preview access",
    description: "A narrow look at the newest drops before you decide to join.",
    features: ["5 newest feed items", "3 Bottle Checks after sign-up", "Upgrade CTA when a bottle is alert-worthy"],
    cta: "Start free",
    plan: null,
    accent: "quiet",
  },
  {
    eyebrow: "Standard Proof",
    name: "The daily hunter",
    price: "$4.99",
    cadence: "monthly · $39.99 yearly",
    description: "For members who want clean alerts without opening every liquor-board page themselves.",
    features: ["5 alert areas", "15 tracked bottles", "State-level filters", "Full Bottle Check", "Read and submit Member Sightings"],
    cta: "Choose Standard",
    plan: "standard_monthly" as PaidPlanId,
    annualPlan: "standard_annual" as PaidPlanId,
    accent: "standard",
  },
  {
    eyebrow: "Barrel Proof",
    name: "The serious chase",
    price: "$9.99",
    cadence: "monthly · $79.99 yearly",
    description: "The fuller intelligence layer for people who want fewer false starts and better timing.",
    features: ["Effectively unlimited alert areas", "Effectively unlimited tracked bottles", "Advanced filters", "Sightings alerts", "Early and beta access"],
    cta: "Choose Barrel",
    plan: "barrel_monthly" as PaidPlanId,
    annualPlan: "barrel_annual" as PaidPlanId,
    accent: "barrel",
    featured: true,
  },
  {
    eyebrow: "Bottled-in-Bond Founder",
    name: "One of 100",
    price: "$59.99",
    cadence: "one-time lifetime",
    description: "Lifetime access to every current and future member feature. When 100 spots sell, this tier disappears.",
    features: ["All Barrel Proof features", "All future paid member features", "Founder status", "100 total lifetime spots", "Private early-member positioning"],
    cta: "Claim Founder spot",
    plan: "bib_lifetime" as PaidPlanId,
    accent: "founder",
  },
];

function PricingPageContent() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: PaidPlanId | null) {
    setError(null);
    if (!plan) {
      router.push("/sign-up?redirect_url=/dashboard");
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
            <h1>Choose the proof level for how you hunt.</h1>
            <p className="pricing-deck">
              Bourbon Signal is built for people who would rather get a clean, source-backed lead than refresh scattered store pages all day.
              Pick the level that matches how serious your chase is.
            </p>
          </ScrollReveal>
        </section>

        <section className="pricing-grid" aria-label="Bourbon Signal launch pricing tiers">
          {tiers.map((tier) => (
            <motion.article
              key={tier.name}
              className={`pricing-card ${tier.accent} ${tier.featured ? "featured" : ""}`}
              whileHover={{ y: -4, transition: { duration: 0.25 } }}
            >
              {tier.featured ? <div className="pricing-ribbon">Best for launch</div> : null}
              <p className="pricing-eyebrow">{tier.eyebrow}</p>
              <h2>{tier.name}</h2>
              <div className="pricing-price-row">
                <strong>{tier.price}</strong>
                <span>{tier.cadence}</span>
              </div>
              <p className="pricing-description">{tier.description}</p>
              <ul>
                {tier.features.map((feature) => (
                  <li key={feature}><span>✓</span>{feature}</li>
                ))}
              </ul>
              <div className="pricing-actions">
                <button type="button" onClick={() => startCheckout(tier.plan)} disabled={tier.plan !== null && pendingPlan === tier.plan}>
                  {tier.plan !== null && pendingPlan === tier.plan ? "Opening checkout…" : tier.cta}
                </button>
                {tier.annualPlan ? (
                  <button type="button" className="secondary" onClick={() => startCheckout(tier.annualPlan)} disabled={pendingPlan === tier.annualPlan}>
                    {pendingPlan === tier.annualPlan ? "Opening checkout…" : "Go annual"}
                  </button>
                ) : null}
              </div>
            </motion.article>
          ))}
        </section>

        {error ? <p className="pricing-error" role="alert">{error}</p> : null}

        <section className="pricing-note">
          <p>Founder spots are intentionally scarce. Standard and Barrel are designed to grow with coverage and member sightings after launch.</p>
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
.launch-pricing-page { min-height:100vh; padding:132px 0 86px; color:var(--color-text-primary); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.18), transparent 34%), radial-gradient(circle at 86% 18%, rgba(184,115,51,.09), transparent 28%), var(--color-bg-primary); }
.pricing-hero { width:min(1040px, calc(100% - 40px)); margin:0 auto; text-align:center; }
.pricing-kicker { margin:0; color:var(--color-accent-amber); font:900 11px/1 var(--font-jetbrains); letter-spacing:.16em; text-transform:uppercase; }
.pricing-hero h1 { max-width:840px; margin:16px auto 0; color:var(--color-cream); font:700 clamp(42px, 7vw, 76px)/.94 var(--font-playfair); letter-spacing:-.045em; }
.pricing-deck { max-width:740px; margin:20px auto 0; color:var(--color-text-secondary); font:16px/1.8 var(--font-dm-sans); }
.pricing-grid { width:min(1180px, calc(100% - 40px)); margin:46px auto 0; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; align-items:stretch; }
.pricing-card { position:relative; display:flex; flex-direction:column; min-width:0; border:1px solid rgba(245,237,214,.09); border-radius:24px; padding:24px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); overflow:hidden; }
.pricing-card.featured { border-color:rgba(196,148,58,.55); background:radial-gradient(circle at 50% 0%, rgba(196,148,58,.19), transparent 44%), linear-gradient(180deg, rgba(255,255,255,.058), rgba(255,255,255,.026)); box-shadow:0 0 70px rgba(196,148,58,.11), 0 28px 100px rgba(0,0,0,.34); }
.pricing-card.founder { border-color:rgba(212,164,74,.32); background:radial-gradient(circle at 18% 0%, rgba(212,164,74,.18), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.024)); }
.pricing-ribbon { margin:-24px -24px 20px; padding:9px 12px; text-align:center; color:#130F0A; background:linear-gradient(135deg, #C4943A, #D4A44A); font:900 11px/1 var(--font-dm-sans); letter-spacing:.12em; text-transform:uppercase; }
.pricing-eyebrow { margin:0; color:rgba(245,237,214,.42); font:900 11px/1 var(--font-dm-sans); letter-spacing:.14em; text-transform:uppercase; }
.pricing-card.barrel .pricing-eyebrow, .pricing-card.founder .pricing-eyebrow { color:var(--color-accent-amber); }
.pricing-card h2 { margin:10px 0 0; color:var(--color-cream); font:700 28px/1.05 var(--font-playfair); letter-spacing:-.025em; }
.pricing-price-row { margin-top:18px; display:grid; gap:4px; }
.pricing-price-row strong { color:var(--color-cream); font:800 46px/.9 var(--font-playfair); }
.pricing-card.founder .pricing-price-row strong, .pricing-card.featured .pricing-price-row strong { color:var(--color-accent-amber); }
.pricing-price-row span { color:var(--color-text-tertiary); font:800 12px/1.4 var(--font-dm-sans); }
.pricing-description { min-height:74px; margin:18px 0 0; color:var(--color-text-secondary); font:13px/1.65 var(--font-dm-sans); }
.pricing-card ul { margin:20px 0 0; padding:0; list-style:none; display:grid; gap:10px; }
.pricing-card li { display:flex; gap:9px; align-items:flex-start; color:rgba(245,237,214,.76); font:13px/1.42 var(--font-dm-sans); }
.pricing-card li span { flex:0 0 auto; color:var(--color-accent-amber); }
.pricing-actions { margin-top:auto; padding-top:24px; display:grid; gap:9px; }
.pricing-actions button { width:100%; border:1px solid rgba(196,148,58,.46); border-radius:13px; background:linear-gradient(135deg, rgba(196,148,58,.98), rgba(212,164,74,.98)); color:#17110B; padding:13px 14px; font:900 13px/1 var(--font-dm-sans); cursor:pointer; }
.pricing-actions button.secondary { background:rgba(255,255,255,.035); border-color:rgba(245,237,214,.13); color:var(--color-cream); }
.pricing-actions button:disabled { cursor:default; opacity:.68; }
.pricing-error { width:min(760px, calc(100% - 40px)); margin:20px auto 0; color:#ffb4a8; text-align:center; font:800 13px/1.5 var(--font-dm-sans); }
.pricing-note { width:min(820px, calc(100% - 40px)); margin:34px auto 0; border:1px solid rgba(196,148,58,.15); border-radius:20px; padding:18px 20px; background:rgba(196,148,58,.055); text-align:center; }
.pricing-note p { margin:0; color:var(--color-text-secondary); font:13px/1.65 var(--font-dm-sans); }
@media (max-width: 1100px) { .pricing-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .launch-pricing-page { padding-top:112px; } .pricing-grid { grid-template-columns:1fr; width:calc(100% - 28px); } .pricing-hero, .pricing-note, .pricing-error { width:calc(100% - 28px); } .pricing-hero h1 { font-size:clamp(42px, 12vw, 58px); } .pricing-description { min-height:0; } }
`;
