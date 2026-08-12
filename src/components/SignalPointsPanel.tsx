"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MemberReferralLink from "@/components/MemberReferralLink";

type CatalogItem = { key: string; name: string; points: number; fulfillmentType: "physical" | "digital"; inventoryRemaining: number | null; options: Record<string, unknown> };
type Redemption = { id: string; itemKey: string; itemSnapshot: Record<string, unknown>; pointsSpent: number; status: string; createdAt: string };
type Payload = { balance: number; debt: number; catalog: CatalogItem[]; redemptions: Redemption[]; redemptionEligible: boolean; shippingProfile: { recipientName: string; city: string; stateCode: string; postalCode: string } | null; error?: string };

export default function SignalPointsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [details, setDetails] = useState<Record<string, unknown>>({ glassStyle: "standard", size: "M", color: "black", age21Attested: false });
  const [confirmSavedAddress, setConfirmSavedAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const redemptionIntent = useRef<{ signature: string; idempotencyKey: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/signal-points", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(payload.error || "Signal Points unavailable");
      setData(payload); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Signal Points unavailable"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const nextReward = useMemo(() => data?.catalog.find((item) => item.points > data.balance && item.inventoryRemaining !== 0) || null, [data]);
  const glassQuantity = Number(selected?.options.glassQuantity || 0);
  const surcharge = details.glassStyle === "personal" ? glassQuantity * 125 : 0;
  const selectedCost = (selected?.points || 0) + surcharge;

  function redemptionIntentKey() {
    const signature = JSON.stringify({ itemKey: selected?.key, details, confirmSavedAddress });
    if (redemptionIntent.current?.signature !== signature) redemptionIntent.current = { signature, idempotencyKey: crypto.randomUUID() };
    return redemptionIntent.current.idempotencyKey;
  }

  async function redeem() {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/signal-points/redemptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: selected.key, details, confirmSavedAddress, idempotencyKey: redemptionIntentKey() }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Redemption unavailable");
      redemptionIntent.current = null; setSelected(null); setConfirmSavedAddress(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Redemption unavailable"); }
    finally { setSaving(false); }
  }

  async function cancel(redemptionId: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/signal-points/redemptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", redemptionId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Cancellation unavailable");
      redemptionIntent.current = null;
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Cancellation unavailable"); }
    finally { setSaving(false); }
  }

  if (!data) return <div className="signal-points-loading">{error || "Loading Signal Points…"}</div>;
  return (
    <section className="signal-points-panel" aria-label="Signal Points rewards">
      <div className="signal-points-total"><div><span>Available Signal Points</span><strong>{data.balance}</strong></div>{nextReward ? <p>{Math.max(0, nextReward.points - data.balance)} points to {nextReward.name}</p> : <p>Every active catalog reward is within reach.</p>}</div>
      {data.debt > 0 ? <div className="signal-paid-note"><strong>{data.debt} points pending correction</strong><span>Future Signal Points will settle this correction before becoming available to redeem.</span></div> : null}
      {!data.redemptionEligible ? <div className="signal-paid-note"><strong>Paid membership required</strong><span>Free members keep earning and accumulating Signal Points. Upgrade to Standard, Barrel, or Bottled-in-Bond to redeem.</span></div> : null}
      <div className="signal-earn"><strong>Ways to earn</strong><span>Sightings: 10 limited/unclassified · 20 allocated · 30 unicorn</span><span>Badges and qualifying streaks: 10 each</span><span>Referrals: 10 Free (first five awards) · 50 Standard · 100 Barrel · 150 Bottled-in-Bond, with upgrade differences only</span></div>
      <MemberReferralLink compact />
      <div className="signal-catalog"><h4>Reward catalog</h4><div>{data.catalog.map((item) => {
        const disabled = !data.redemptionEligible || data.balance < item.points || item.inventoryRemaining === 0;
        return <article key={item.key}><strong>{item.name}</strong><span>{item.points} pts{item.fulfillmentType === "physical" ? " · U.S. shipping included" : " · digital, owner fulfilled"}</span><button type="button" disabled={disabled} onClick={() => { redemptionIntent.current = null; setSelected(item); setDetails({ glassStyle: "standard", size: "M", color: "black", age21Attested: false }); }}>{item.inventoryRemaining === 0 ? "Out of stock" : !data.redemptionEligible ? "Paid membership required" : data.balance < item.points ? `${item.points - data.balance} pts to go` : "Redeem"}</button></article>;
      })}</div></div>
      <div className="signal-history"><h4>Redemption history</h4>{data.redemptions.length ? data.redemptions.map((item) => <div key={item.id}><span><strong>{String(item.itemSnapshot.name || item.itemKey)}</strong><small>{item.pointsSpent} pts · {item.status.replaceAll("_", " ")}</small></span>{["reserved", "details_required", "submitted", "approved"].includes(item.status) ? <button disabled={saving} type="button" onClick={() => void cancel(item.id)}>Cancel</button> : null}</div>) : <p>No redemptions yet.</p>}</div>
      {error ? <p role="alert" className="signal-error">{error}</p> : null}
      {selected ? <div className="signal-modal" role="dialog" aria-modal="true" aria-label={`Redeem ${selected.name}`}><form onSubmit={(event) => { event.preventDefault(); void redeem(); }}><h3>{selected.name}</h3><p>{selectedCost} Signal Points</p>
        {glassQuantity ? <><label>Glass choice<select value={String(details.glassStyle)} onChange={(event) => setDetails((current) => ({ ...current, glassStyle: event.target.value }))}><option value="standard">Standard Bourbon Signal mark</option><option value="personal">Personal engraving (+125 per glass)</option></select></label>{details.glassStyle === "personal" ? <label>Engraving (1–18 characters)<input maxLength={18} required value={String(details.engravingText || "")} onChange={(event) => setDetails((current) => ({ ...current, engravingText: event.target.value }))} /></label> : null}</> : null}
        {selected.options.apparel ? <><label>Size<select value={String(details.size)} onChange={(event) => setDetails((current) => ({ ...current, size: event.target.value }))}>{["S","M","L","XL","2XL","3XL"].map((size) => <option key={size}>{size}</option>)}</select></label><label>Color<select value={String(details.color)} onChange={(event) => setDetails((current) => ({ ...current, color: event.target.value }))}>{["black","charcoal","cream"].map((color) => <option key={color}>{color}</option>)}</select></label></> : null}
        {selected.fulfillmentType === "digital" ? <label className="signal-check"><input type="checkbox" checked={details.age21Attested === true} onChange={(event) => setDetails((current) => ({ ...current, age21Attested: event.target.checked, accountEmail: "verified-account" }))} />I attest that I am 21 or older. This gift card is manually fulfilled by the owner to my verified account email.</label> : <label className="signal-check"><input type="checkbox" checked={confirmSavedAddress} onChange={(event) => setConfirmSavedAddress(event.target.checked)} />Confirm saved address: {data.shippingProfile ? `${data.shippingProfile.recipientName}, ${data.shippingProfile.city}, ${data.shippingProfile.stateCode} ${data.shippingProfile.postalCode}` : "No saved shipping profile—add one in account settings first."}</label>}
        <div className="signal-modal-actions"><button type="button" onClick={() => { redemptionIntent.current = null; setSelected(null); }}>Back</button><button type="submit" disabled={saving || selectedCost > data.balance || (selected.fulfillmentType === "physical" && (!data.shippingProfile || !confirmSavedAddress))}>{saving ? "Reserving…" : `Confirm ${selectedCost} pts`}</button></div>
      </form></div> : null}
      <style jsx>{`
        .signal-points-panel{display:grid;gap:14px}.signal-points-loading,.signal-paid-note,.signal-earn,.signal-catalog,.signal-history{border:1px solid rgba(245,237,214,.09);border-radius:16px;background:rgba(5,4,3,.22);padding:14px}.signal-points-total{display:flex;justify-content:space-between;gap:16px;align-items:end;border:1px solid rgba(196,148,58,.24);border-radius:18px;padding:16px;background:rgba(196,148,58,.07)}.signal-points-total div{display:grid;gap:4px}.signal-points-total span,.signal-points-total p,.signal-paid-note span,.signal-earn span,.signal-catalog span,.signal-history small,.signal-history p{font:12px/1.5 var(--font-dm-sans);color:rgba(245,237,214,.6)}.signal-points-total strong{font:34px/1 var(--font-playfair);color:var(--color-cream)}.signal-points-total p{margin:0;text-align:right}.signal-paid-note,.signal-earn{display:grid;gap:5px}.signal-paid-note strong,.signal-earn strong,h4{color:var(--color-cream);font:800 14px/1.3 var(--font-dm-sans)}h4{margin:0 0 10px}.signal-catalog>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.signal-catalog article{display:grid;gap:7px;border:1px solid rgba(245,237,214,.07);border-radius:12px;padding:11px}.signal-catalog article strong,.signal-history strong{color:rgba(245,237,214,.9);font:800 13px/1.3 var(--font-dm-sans)}button{border:1px solid rgba(196,148,58,.3);border-radius:9px;background:rgba(196,148,58,.12);color:#e5c77f;padding:9px;font:800 11px var(--font-dm-sans);cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.signal-history>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid rgba(245,237,214,.07)}.signal-history span{display:grid;gap:3px}.signal-error{color:#ef9b85;font:12px var(--font-dm-sans)}.signal-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(0,0,0,.74);padding:18px}.signal-modal form{width:min(440px,100%);display:grid;gap:14px;border:1px solid rgba(196,148,58,.3);border-radius:18px;background:#120e0b;padding:20px}.signal-modal h3,.signal-modal p{margin:0;color:var(--color-cream)}.signal-modal label{display:grid;gap:6px;color:rgba(245,237,214,.8);font:12px var(--font-dm-sans)}.signal-modal input,.signal-modal select{border:1px solid rgba(245,237,214,.14);border-radius:8px;background:#080604;color:var(--color-cream);padding:10px}.signal-check{grid-template-columns:auto 1fr!important;align-items:start}.signal-check input{margin:2px 0}.signal-modal-actions{display:flex;justify-content:flex-end;gap:8px}@media(max-width:620px){.signal-catalog>div{grid-template-columns:1fr}.signal-points-total{align-items:start;flex-direction:column}.signal-points-total p{text-align:left}}
      `}</style>
    </section>
  );
}
