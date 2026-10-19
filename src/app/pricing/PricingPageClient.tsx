"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import FAQ from "@/components/sections/FAQ";
import { useAuth } from "@/lib/auth";
import { MEMBERSHIP_COMPARISON_ROWS, PAID_MEMBERSHIP_PLANS, type PublicCheckoutPlanId } from "@/lib/membership-plan-catalog";

function comparisonLabel(value: string) {
  return value === "✓" ? "Included" : value === "—" ? "Not included" : undefined;
}

function PricingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn, memberTier } = useAuth();
  const [pendingPlan, setPendingPlan] = useState<PublicCheckoutPlanId | null>(null);
  const pending = pendingPlan !== null;
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const paid = memberTier !== "free";
  const plan = PAID_MEMBERSHIP_PLANS.find(item => item.tier === "barrel")!;
  const founder = PAID_MEMBERSHIP_PLANS.find(item => item.tier === "bottled-in-bond")!;
  const alreadyFounder = memberTier === "bottled-in-bond";
  const source = params.get("source") || "pricing";
  const canceledPlan = params.get("canceled") === "bib_lifetime" ? "bib_lifetime" : "barrel_monthly";
  async function checkout(planId: PublicCheckoutPlanId = "barrel_monthly") {
    if (!isLoaded || inFlight.current || (planId === "bib_lifetime" ? alreadyFounder : paid)) return;
    if (!isSignedIn) {
      const destination = `/checkout/continue?plan=${planId}&source=${encodeURIComponent(source)}&registration=1`;
      router.push(`/sign-up?intent=paid&redirect_url=${encodeURIComponent(destination)}`);
      return;
    }
    inFlight.current = true; setPendingPlan(planId); setError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planId, source }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout is unavailable. Please try again.");
      window.location.href = result.url;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Checkout is unavailable. Please try again.");
      inFlight.current = false; setPendingPlan(null);
    }
  }
  useEffect(() => { if (isLoaded && isSignedIn && !paid && (params.get("checkout") === "barrel_monthly" || params.get("checkout") === "bib_lifetime")) void checkout(params.get("checkout") as PublicCheckoutPlanId); }, [isLoaded, isSignedIn, paid]);
  return <>
    <Navigation />
    <main className="membership-pricing"><style>{css}</style>
      <header><p className="eyebrow">BOURBON SIGNAL MEMBERSHIP</p><h1>Choose your membership.</h1><p>Get alerts when bottles you love show up in your area.</p></header>
      {isLoaded && params.has("canceled") ? <section className="notice" role="status"><p>Checkout canceled. You were not charged. Your current access continues.</p><button disabled={pending || (canceledPlan === "bib_lifetime" ? alreadyFounder : paid)} onClick={() => void checkout(canceledPlan)}>Resume checkout</button>{" "}<button onClick={() => router.push(isSignedIn ? "/welcome" : "/sign-up")}>{paid ? "Continue with current plan" : "Continue with Free"}</button></section> : null}
      <section className="plans" aria-label="Membership options">
        <article className="plan"><p className="eyebrow">EXPLORE BOURBON SIGNAL</p><h2>Free</h2><p className="price">$0</p><p>Browse the signal and start your collection.</p><ul><li>6 recent Intel signals</li><li>Coverage Map and Member Sightings</li><li>3 bottle lookups</li><li>10 bottles on My Shelf</li><li>Post sightings and earn Signal Points</li></ul><button onClick={() => router.push(isSignedIn ? "/welcome" : "/sign-up")}>{isSignedIn ? "Continue to Bourbon Signal" : "Create Free Account"}</button></article>
        <article className="plan barrel"><p className="eyebrow">FULL MEMBERSHIP</p><h2>{plan.name}</h2><p className="price">{plan.monthlyPrice}<span>/month</span></p><p>Full access. Billed monthly. Cancel anytime.</p><ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul><button disabled={!isLoaded || pending || paid} onClick={() => void checkout()}>{paid ? "Your membership includes full access" : pendingPlan === "barrel_monthly" ? "Opening checkout…" : "Get Barrel Proof"}</button></article>
        <article className="plan founder"><p className="eyebrow">LIFETIME MEMBERSHIP</p><h2>{founder.name}</h2><p className="price">{founder.oneTimePrice}<span>once</span></p><p>{founder.description}</p><ul>{founder.features.map(feature => <li key={feature}>{feature}</li>)}</ul><p className="availability">Availability is confirmed at checkout. An existing subscription is managed separately.</p><button disabled={!isLoaded || pending || alreadyFounder} onClick={() => void checkout("bib_lifetime")}>{alreadyFounder ? "You're a Founder" : pendingPlan === "bib_lifetime" ? "Opening checkout..." : "Become a Founder"}</button></article>
      </section>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      <p className="terms">Barrel Proof renews monthly until canceled. Founder is a one-time purchase. Cancellation stops the next renewal; access continues through the period already paid for.</p>
      {memberTier === "standard" ? <p className="notice">Your existing Standard Proof subscription now includes every Barrel Proof feature. Your existing billing rate continues while your subscription remains active.</p> : null}
      {memberTier === "bottled-in-bond" ? <p className="notice">Your Founder membership keeps full lifetime access and your Founder recognition.</p> : null}
      <section className="comparison" aria-label="Compare Free and Barrel Proof"><h2>What’s included</h2><table><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Barrel Proof</th></tr></thead><tbody>{MEMBERSHIP_COMPARISON_ROWS.map(([feature, free, member]) => <tr key={feature}><th scope="row">{feature}</th><td aria-label={comparisonLabel(free)}>{free}</td><td aria-label={comparisonLabel(member)}>{member}</td></tr>)}</tbody></table></section>
      <FAQ variant="pricing" />
    </main><Footer />
  </>;
}
export default function PricingPageClient() {
  return <Suspense fallback={<main aria-busy="true">Loading membership…</main>}><PricingPageContent /></Suspense>;
}
const css = `
.membership-pricing{padding:140px 20px 40px;max-width:1100px;margin:auto;color:var(--color-cream,#f5edd6)}.membership-pricing header{text-align:center;margin:0 auto 44px;max-width:680px}.membership-pricing h1{font-family:var(--font-playfair);font-size:clamp(38px,6vw,64px);line-height:1.12;margin:16px 0 24px}.membership-pricing p{line-height:1.65;color:#c0b6a5}.membership-pricing .eyebrow{font-size:11px;font-weight:700;letter-spacing:.15em;color:#c4943a}
.membership-pricing .plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;max-width:1100px;margin:auto}.membership-pricing .plan{display:flex;flex-direction:column;padding:32px;border:1px solid #40362b;border-radius:20px;background:#17130f}.membership-pricing .barrel{border-color:#b18a50;background:#231b12}.membership-pricing h2{font-family:var(--font-playfair);font-size:30px;margin:8px 0}.membership-pricing .price{font-size:54px;line-height:1;margin:24px 0 10px;color:#f5edd6}.membership-pricing .price span{font-size:16px;margin-left:8px;color:#b4a58e}.membership-pricing ul{padding-left:20px;margin:20px 0 32px;flex:1}.membership-pricing li{padding:7px 0;line-height:1.5}.membership-pricing button{border:1px solid #b18a50;border-radius:10px;min-height:48px;padding:12px 18px;background:#30251a;color:#f5edd6;font-weight:600;cursor:pointer}.membership-pricing .barrel button{background:#d3a365;color:#21170b}.membership-pricing button:disabled{opacity:.65;cursor:default}.membership-pricing .terms,.membership-pricing .notice{text-align:center;max-width:800px;margin:24px auto;font-size:13px}.membership-pricing .notice{padding:16px;border:1px solid #55432c;border-radius:12px}.membership-pricing .comparison{margin:60px auto;max-width:880px;overflow-x:auto}.membership-pricing table{width:100%;border-collapse:collapse;font-size:14px}.membership-pricing th,.membership-pricing td{text-align:left;padding:16px 12px;border-bottom:1px solid #352c23}.membership-pricing tbody th{font-weight:400}.membership-pricing button:focus-visible{outline:2px solid #f5edd6;outline-offset:4px}@media(max-width:860px){.membership-pricing{padding-top:115px}.membership-pricing .plans{grid-template-columns:1fr}.membership-pricing .plan{padding:24px}.membership-pricing th,.membership-pricing td{padding:12px 7px;font-size:12px}}
`;
