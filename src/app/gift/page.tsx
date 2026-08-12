"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import type { GiftPlanId } from "@/lib/gifts";

const cards: Array<{ id: GiftPlanId; name: string; price: string; detail: string }> = [
  { id: "standard_annual_gift", name: "Standard Proof", price: "$30", detail: "One year of Standard Proof, beginning when the gift is redeemed. No subscription or renewal." },
  { id: "barrel_annual_gift", name: "Barrel Proof", price: "$60", detail: "One year of Barrel Proof, beginning when the gift is redeemed. No subscription or renewal." },
  { id: "founder_lifetime_gift", name: "Bottled-in-Bond", price: "$50", detail: "Lifetime membership plus a numbered Founder glass. The Founder number is reserved after payment and claimed when the gift is redeemed." },
];

export default function GiftPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const requestId = useRef<string | null>(null);
  const [plan, setPlan] = useState<GiftPlanId>("standard_annual_gift");
  const [deliveryMode, setDeliveryMode] = useState<"now" | "scheduled">("now");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/gift")}`);
      return;
    }
    if (pending) return;
    setPending(true);
    const data = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    try {
      const orderResponse = await fetch("/api/gifts/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaserRequestId: requestId.current.replace(/-/g, "_"),
          plan,
          purchaserName: data.get("purchaserName"),
          recipientName: data.get("recipientName"),
          recipientEmail: data.get("recipientEmail"),
          message: data.get("message"),
          deliveryMode,
          scheduledLocalDateTime: deliveryMode === "scheduled" ? data.get("scheduledLocalDateTime") : null,
          deliveryTimezone: deliveryMode === "scheduled" ? data.get("deliveryTimezone") : null,
        }),
      });
      const order = await orderResponse.json() as { orderId?: string; error?: string };
      if (!orderResponse.ok || !order.orderId) throw new Error(order.error || "Unable to create the gift order.");
      const checkoutResponse = await fetch("/api/gifts/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const checkout = await checkoutResponse.json() as { url?: string; error?: string };
      if (!checkoutResponse.ok || !checkout.url) throw new Error(checkout.error || "Unable to open checkout.");
      window.location.href = checkout.url;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Gift checkout is unavailable.");
      setPending(false);
    }
  }

  return (
    <>
      <Navigation />
      <main className="gift-page">
        <style>{giftCss}</style>
        <header className="gift-hero">
          <p>GIFT BOURBON SIGNAL</p>
          <h1>Give them a stronger signal.</h1>
          <span>Annual gifts begin when redeemed and never renew. Bottled-in-Bond includes lifetime access and a numbered Founder glass.</span>
        </header>
        <form onSubmit={submit} className="gift-form">
          <fieldset className="gift-cards">
            <legend className="gift-section-title">Choose a gift</legend>
            {cards.map((card) => (
              <label key={card.id} className={plan === card.id ? "selected" : ""}>
                <input type="radio" name="plan" value={card.id} checked={plan === card.id} onChange={() => setPlan(card.id)} />
                <span className="gift-card-heading"><span className="gift-card-name"><i aria-hidden="true" /><strong>{card.name}</strong></span><b>{card.price}</b></span>
                <em>{card.detail}</em>
              </label>
            ))}
          </fieldset>
          <section className="gift-details">
            <h2>Gift details</h2>
            <div className="gift-grid">
              <label>Recipient name<input name="recipientName" required maxLength={100} autoComplete="name" /></label>
              <label>Recipient email<input name="recipientEmail" required maxLength={254} type="email" autoComplete="email" /></label>
              <label>Purchaser name (optional)<input name="purchaserName" maxLength={100} autoComplete="name" /></label>
              <label className="wide">Optional message<textarea name="message" maxLength={1000} rows={4} /></label>
            </div>
            <fieldset className="delivery-choice">
              <legend>Delivery</legend>
              <label><input type="radio" checked={deliveryMode === "now"} onChange={() => setDeliveryMode("now")} />Send now</label>
              <label><input type="radio" checked={deliveryMode === "scheduled"} onChange={() => setDeliveryMode("scheduled")} />Schedule delivery</label>
            </fieldset>
            {deliveryMode === "scheduled" ? (
              <div className="gift-grid schedule">
                <label>Local date and time<input type="datetime-local" name="scheduledLocalDateTime" required /></label>
                <label>IANA timezone<input name="deliveryTimezone" required defaultValue={defaultTimeZone} placeholder="America/New_York" /></label>
              </div>
            ) : null}
            <p className="gift-security">Recipient details stay with Bourbon Signal and are never placed in Stripe metadata. The purchaser receives no membership access or referral points.</p>
            {error ? <p className="gift-error" role="alert">{error}</p> : null}
            <button className="gift-submit" type="submit" disabled={pending || !isLoaded}>{pending ? "Opening secure checkout…" : isSignedIn ? "Continue to secure checkout" : "Sign in to continue"}</button>
          </section>
        </form>
      </main>
      <Footer />
    </>
  );
}

const giftCss = `
.gift-page{min-height:100vh;padding:128px 20px 90px;color:var(--color-text-primary);background:radial-gradient(circle at 50% 0,rgba(196,148,58,.18),transparent 34%),var(--color-bg-primary)}
.gift-hero,.gift-form{width:min(980px,100%);margin:0 auto}.gift-hero{text-align:center}.gift-hero>p{margin:0;color:var(--color-accent-amber);font:900 11px/1 var(--font-jetbrains);letter-spacing:.18em}.gift-hero h1{margin:18px 0 0;font:700 clamp(43px,7vw,76px)/.95 var(--font-playfair);letter-spacing:-.045em}.gift-hero span{display:block;max-width:720px;margin:20px auto 0;color:var(--color-text-secondary);font:15px/1.7 var(--font-dm-sans)}
.gift-form{margin-top:42px;display:grid;gap:22px}.gift-details{border:1px solid rgba(245,237,214,.1);border-radius:24px;padding:24px;background:rgba(255,255,255,.035)}fieldset{min-width:0}.gift-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin:0;padding:0;border:0}.gift-cards .gift-section-title{grid-column:1/-1;width:100%;margin:0 0 5px;padding:0;color:var(--color-cream);font:700 22px/1 var(--font-playfair)}.delivery-choice legend{padding:0 8px;color:var(--color-cream);font:700 22px/1 var(--font-playfair)}.gift-cards>label{display:grid;align-content:start;gap:14px;min-height:150px;border:1px solid rgba(245,237,214,.12);border-radius:18px;padding:18px;cursor:pointer;transition:border-color .2s ease,background-color .2s ease,transform .2s ease}.gift-cards>label:hover{border-color:rgba(196,148,58,.55);background:rgba(196,148,58,.055)}.gift-cards>label:active{transform:translateY(1px)}.gift-cards>label.selected{border-color:var(--color-accent-amber);background:rgba(196,148,58,.1)}.gift-cards input{position:absolute;opacity:0}.gift-cards>label:focus-within{outline:2px solid var(--color-accent-amber);outline-offset:3px}.gift-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.gift-card-name{display:flex;align-items:flex-start;gap:9px;min-width:0}.gift-card-name i{flex:0 0 auto;width:10px;height:10px;margin-top:5px;border:1px solid rgba(245,237,214,.38);border-radius:50%;box-shadow:inset 0 0 0 2px transparent}.gift-cards>label.selected .gift-card-name i{border-color:var(--color-accent-amber);background:var(--color-accent-amber);box-shadow:inset 0 0 0 2px #21170e}.gift-cards strong,.gift-cards b{font:700 19px/1.1 var(--font-playfair)}.gift-cards strong{overflow-wrap:anywhere}.gift-cards b{flex:0 0 auto;color:var(--color-accent-amber);font-variant-numeric:tabular-nums}.gift-cards em{color:var(--color-text-secondary);font:normal 13px/1.55 var(--font-dm-sans)}
.gift-details h2{margin:0 0 20px;font:700 28px/1 var(--font-playfair)}.gift-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.gift-grid label{display:grid;gap:8px;color:var(--color-text-secondary);font:800 12px/1 var(--font-dm-sans)}.gift-grid .wide{grid-column:1/-1}.gift-grid input,.gift-grid textarea{width:100%;border:1px solid rgba(245,237,214,.16);border-radius:12px;padding:13px;color:#17110b;background:#f7f0e0;font:15px/1.4 var(--font-dm-sans)}.delivery-choice{display:flex;gap:22px;margin-top:22px;padding:16px 0;border:0}.delivery-choice label{display:flex;gap:8px;align-items:center;color:var(--color-cream);font:800 14px/1 var(--font-dm-sans)}.schedule{margin-top:4px}.gift-security{color:var(--color-text-tertiary);font:12px/1.6 var(--font-dm-sans)}.gift-error{color:#ffb4a8;font:800 13px/1.5 var(--font-dm-sans)}.gift-submit{width:100%;margin-top:10px;border:0;border-radius:14px;padding:15px;color:#17110b;background:linear-gradient(135deg,#c4943a,#e0b557);font:900 14px/1 var(--font-dm-sans);cursor:pointer}.gift-submit:disabled{opacity:.6;cursor:wait}@media(max-width:720px){.gift-page{padding-inline:24px}.gift-form{margin-top:36px}.gift-cards,.gift-grid{grid-template-columns:1fr}.gift-grid .wide{grid-column:auto}.gift-cards>label{min-height:0;padding:19px 18px}.gift-details{padding:20px}}@media(max-width:390px){.gift-page{padding-inline:18px}.gift-card-heading{gap:9px}.gift-cards strong,.gift-cards b{font-size:18px}}@media(prefers-reduced-motion:reduce){.gift-cards>label{transition:none}}
`;
