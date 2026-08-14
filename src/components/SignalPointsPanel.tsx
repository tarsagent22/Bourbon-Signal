"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MemberReferralLink from "@/components/MemberReferralLink";
import type { MemberRewardsSummary } from "@/lib/sighting-rewards";

type CatalogItem = { key: string; name: string; points: number; fulfillmentType: "physical" | "digital"; inventoryRemaining: number | null; options: Record<string, unknown> };
type Redemption = { id: string; itemKey: string; itemSnapshot: Record<string, unknown>; pointsSpent: number; status: string; createdAt: string };
type Payload = { balance: number; debt: number; catalog: CatalogItem[]; redemptions: Redemption[]; redemptionEligible: boolean; shippingProfile: { recipientName: string; city: string; stateCode: string; postalCode: string } | null; error?: string };
type PreviewTab = "overview" | "rewards" | "badges" | "history";
type BadgeDescriptor = { id: string; label: string };

type SignalPointsPanelProps = {
  preview?: boolean;
  rewards?: MemberRewardsSummary | null;
  badgeIconFor?: (id: string) => string | null;
  badgeLabelFor?: (id: string, label: string) => string;
  badgeDescriptionFor?: (id: string) => string;
  badgeBaseKey?: (id: string) => string;
};

const BADGES: BadgeDescriptor[] = [
  { id: "first_sighting", label: "First Sighting" },
  { id: "helpful_neighbor", label: "Helpful Neighbor" },
  { id: "photo_finish", label: "Photo Finish" },
  { id: "spotter", label: "Spotter" },
  { id: "unicorn_hunter", label: "Unicorn Hunter" },
  { id: "sharp_eye", label: "Sharp Eye" },
  { id: "local_scout", label: "Local Scout" },
  { id: "weekend_warrior", label: "Weekend Warrior" },
  { id: "clean_signal", label: "Clean Signal" },
  { id: "streak", label: "Streak" },
];

const REWARD_MARKS: Record<string, string> = {
  sticker_pack: "BS",
  coaster_set: "◈",
  rocks_glass: "R",
  glencairn: "G",
  tshirt: "T",
  rocks_glass_pair: "R²",
  glencairn_pair: "G²",
  hoodie: "H",
  bourbon_shipping_gift_card_100: "$",
};

function DefaultLoading() {
  return <div className="signal-points-loading">Loading Signal Points…</div>;
}

export default function SignalPointsPanel(props: SignalPointsPanelProps) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [details, setDetails] = useState<Record<string, unknown>>({ glassStyle: "standard", size: "M", color: "black", age21Attested: false });
  const [confirmSavedAddress, setConfirmSavedAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("overview");
  const [showAllRewards, setShowAllRewards] = useState(false);
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
  const availableReward = useMemo(() => data?.catalog.find((item) => item.points <= data.balance && item.inventoryRemaining !== 0) || null, [data]);
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

  function selectReward(item: CatalogItem) {
    redemptionIntent.current = null;
    setSelected(item);
    setDetails({ glassStyle: "standard", size: "M", color: "black", age21Attested: false });
  }

  if (!data) return error ? <div className="signal-points-loading">{error}</div> : <DefaultLoading />;

  const redemptionModal = selected ? <div className="signal-modal" role="dialog" aria-modal="true" aria-label={`Redeem ${selected.name}`}><form onSubmit={(event) => { event.preventDefault(); void redeem(); }}><h3>{selected.name}</h3><p>{selectedCost} Signal Points</p>
    {glassQuantity ? <><label>Glass choice<select value={String(details.glassStyle)} onChange={(event) => setDetails((current) => ({ ...current, glassStyle: event.target.value }))}><option value="standard">Standard Bourbon Signal mark</option><option value="personal">Personal engraving (+125 per glass)</option></select></label>{details.glassStyle === "personal" ? <label>Engraving (1–18 characters)<input maxLength={18} required value={String(details.engravingText || "")} onChange={(event) => setDetails((current) => ({ ...current, engravingText: event.target.value }))} /></label> : null}</> : null}
    {selected.options.apparel ? <><label>Size<select value={String(details.size)} onChange={(event) => setDetails((current) => ({ ...current, size: event.target.value }))}>{["S","M","L","XL","2XL","3XL"].map((size) => <option key={size}>{size}</option>)}</select></label><label>Color<select value={String(details.color)} onChange={(event) => setDetails((current) => ({ ...current, color: event.target.value }))}>{["black","charcoal","cream"].map((color) => <option key={color}>{color}</option>)}</select></label></> : null}
    {selected.fulfillmentType === "digital" ? <label className="signal-check"><input type="checkbox" checked={details.age21Attested === true} onChange={(event) => setDetails((current) => ({ ...current, age21Attested: event.target.checked, accountEmail: "verified-account" }))} />I attest that I am 21 or older. This gift card is manually fulfilled by the owner to my verified account email.</label> : <label className="signal-check"><input type="checkbox" checked={confirmSavedAddress} onChange={(event) => setConfirmSavedAddress(event.target.checked)} />Confirm saved address: {data.shippingProfile ? `${data.shippingProfile.recipientName}, ${data.shippingProfile.city}, ${data.shippingProfile.stateCode} ${data.shippingProfile.postalCode}` : "No saved shipping profile—add one in account settings first."}</label>}
    <div className="signal-modal-actions"><button type="button" onClick={() => { redemptionIntent.current = null; setSelected(null); }}>Back</button><button type="submit" disabled={saving || selectedCost > data.balance || (selected.fulfillmentType === "physical" && (!data.shippingProfile || !confirmSavedAddress))}>{saving ? "Reserving…" : `Confirm ${selectedCost} pts`}</button></div>
  </form></div> : null;

  if (!props.preview) return (
    <section className="signal-points-panel" aria-label="Signal Points rewards">
      <div className="signal-points-total"><div><span>Available Signal Points</span><strong>{data.balance}</strong></div>{nextReward ? <p>{Math.max(0, nextReward.points - data.balance)} points to {nextReward.name}</p> : <p>Every active catalog reward is within reach.</p>}</div>
      {data.debt > 0 ? <div className="signal-paid-note"><strong>{data.debt} points pending correction</strong><span>Future Signal Points will settle this correction before becoming available to redeem.</span></div> : null}
      {!data.redemptionEligible ? <div className="signal-paid-note"><strong>Paid membership required</strong><span>Free members keep earning and accumulating Signal Points. Upgrade to Standard, Barrel, or Bottled-in-Bond to redeem.</span></div> : null}
      <div className="signal-earn"><strong>Ways to earn</strong><span>Sightings: 10 limited/unclassified · 20 allocated · 30 unicorn</span><span>Badges and qualifying streaks: 10 each</span><span>Referrals: 10 Free (first five awards) · 50 Standard · 100 Barrel · 150 Bottled-in-Bond, with upgrade differences only</span></div>
      <MemberReferralLink compact />
      <div className="signal-catalog"><h4>Reward catalog</h4><div>{data.catalog.map((item) => {
        const disabled = !data.redemptionEligible || data.balance < item.points || item.inventoryRemaining === 0;
        return <article key={item.key}><strong>{item.name}</strong><span>{item.points} pts{item.fulfillmentType === "physical" ? " · U.S. shipping included" : " · digital, owner fulfilled"}</span><button type="button" disabled={disabled} onClick={() => selectReward(item)}>{item.inventoryRemaining === 0 ? "Out of stock" : !data.redemptionEligible ? "Paid membership required" : data.balance < item.points ? `${item.points - data.balance} pts to go` : "Redeem"}</button></article>;
      })}</div></div>
      <div className="signal-history"><h4>Redemption history</h4>{data.redemptions.length ? data.redemptions.map((item) => <div key={item.id}><span><strong>{String(item.itemSnapshot.name || item.itemKey)}</strong><small>{item.pointsSpent} pts · {item.status.replaceAll("_", " ")}</small></span>{["reserved", "details_required", "submitted", "approved"].includes(item.status) ? <button disabled={saving} type="button" onClick={() => void cancel(item.id)}>Cancel</button> : null}</div>) : <p>No redemptions yet.</p>}</div>
      {error ? <p role="alert" className="signal-error">{error}</p> : null}
      {redemptionModal}
      <LegacyStyles />
    </section>
  );

  const rewardProgress = nextReward ? Math.min(100, Math.round((data.balance / nextReward.points) * 100)) : 100;
  const nextBadge = props.rewards?.badgeProgress.find((item) => !item.earned) || null;
  const badgeKey = props.badgeBaseKey || ((id: string) => id.replace(/_(bronze|silver|gold|platinum|diamond)$/u, ""));
  const badgeLabel = props.badgeLabelFor || ((_id: string, label: string) => label);
  const badgeDescription = props.badgeDescriptionFor || (() => "Keep contributing useful community signal.");
  const badgeIcon = props.badgeIconFor || (() => null);
  const visibleCatalog = showAllRewards ? data.catalog : data.catalog.slice(0, 4);

  return (
    <section className="points-preview" aria-label="Signal Points preview experience">
      <div className="points-preview-glow" aria-hidden="true" />
      <header className="points-hero">
        <div className="points-balance"><span>Available balance</span><strong>{data.balance}</strong><small>Signal Points</small></div>
        <div className="points-next">
          <span className="points-kicker">Next reward</span>
          <div><strong>{nextReward?.name || "Catalog unlocked"}</strong><b>{nextReward ? `${Math.max(0, nextReward.points - data.balance)} to go` : "Ready"}</b></div>
          <div className="points-progress" aria-label={`${rewardProgress}% progress to next reward`}><span style={{ width: `${rewardProgress}%` }} /></div>
          <small>{nextReward ? `${data.balance} / ${nextReward.points} points` : "Every active reward is within reach."}</small>
        </div>
        <button className="points-primary" type="button" onClick={() => setTab(availableReward ? "rewards" : "badges")}>{availableReward ? "Choose a reward" : "See how to earn"}<span>→</span></button>
      </header>

      {data.debt > 0 ? <div className="points-notice"><strong>{data.debt} points pending correction</strong><span>Future points settle this correction before becoming redeemable.</span></div> : null}
      {!data.redemptionEligible ? <div className="points-notice"><strong>Keep earning now</strong><span>A paid membership is required only when you redeem.</span></div> : null}

      <nav className="points-tabs" aria-label="Signal Points sections">
        {(["overview", "rewards", "badges", "history"] as PreviewTab[]).map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {tab === "overview" ? <div className="points-tab-panel">
        <section className="points-focus-grid">
          <button className="points-feature-card next-unlock-card" type="button" onClick={() => setTab("rewards")}>
            <span className="points-kicker">Next unlock</span>
            <div className="reward-mark">{REWARD_MARKS[nextReward?.key || availableReward?.key || ""] || "◈"}</div>
            <div><strong>{nextReward?.name || availableReward?.name || "Reward catalog"}</strong><small>{nextReward ? `${data.balance} / ${nextReward.points} points` : availableReward ? `${availableReward.points} points · ready` : "Explore everything available"}</small></div>
            <b>{nextReward ? `${Math.max(0, nextReward.points - data.balance)} to unlock` : "View rewards"} →</b>
          </button>
          <button className="points-feature-card badge-focus" type="button" onClick={() => setTab("badges")}>
            <span className="points-kicker">Next achievement</span>
            {nextBadge && badgeIcon(nextBadge.id) ? <img src={badgeIcon(nextBadge.id) || undefined} alt="" /> : <div className="reward-mark">★</div>}
            <div><strong>{nextBadge ? `${badgeLabel(nextBadge.id, nextBadge.label)}${nextBadge.tier ? ` · ${nextBadge.tier}` : ""}` : "Badge collection"}</strong><small>{nextBadge ? `${nextBadge.current} of ${nextBadge.target} complete` : "Your visible achievements are earned"}</small></div>
            <b>View badges →</b>
          </button>
        </section>
        <section className="points-earn-strip" aria-label="Ways to earn">
          <div><span>10</span><strong>Limited sighting</strong></div>
          <div><span>20</span><strong>Allocated sighting</strong></div>
          <div><span>30</span><strong>Unicorn sighting</strong></div>
          <div><span>10</span><strong>Badge or streak</strong></div>
        </section>
        <details className="points-referral"><summary><span><strong>Invite a bourbon friend</strong><small>Qualifying referrals earn up to 150 points.</small></span><b>+</b></summary><MemberReferralLink compact /></details>
        <Link className="points-sighting-cta" href="/sightings?tab=submit">Post a member sighting <span>→</span></Link>
      </div> : null}

      {tab === "rewards" ? <div className="points-tab-panel"><div className="points-section-heading"><div><span className="points-kicker">Spend your signal</span><h3>Reward catalog</h3></div><small>U.S. shipping is included on physical rewards.</small></div><div className="preview-catalog">{visibleCatalog.map((item, index) => {
        const disabled = !data.redemptionEligible || data.balance < item.points || item.inventoryRemaining === 0;
        const percent = Math.min(100, Math.round((data.balance / item.points) * 100));
        return <article key={item.key} data-ready={!disabled} data-distance={index > 1 ? "far" : "near"}><div className="reward-mark">{REWARD_MARKS[item.key] || "BS"}</div><div className="preview-reward-copy"><span>{item.fulfillmentType === "physical" ? "Physical reward" : "Digital reward"}</span><strong>{item.name}</strong><small>{item.points} points</small><div className="points-progress"><span style={{ width: `${percent}%` }} /></div></div><button type="button" disabled={disabled} onClick={() => selectReward(item)}>{item.inventoryRemaining === 0 ? "Sold out" : !data.redemptionEligible ? "Paid plan" : data.balance < item.points ? `${item.points - data.balance} to unlock` : "Redeem"}</button></article>;
      })}</div>{data.catalog.length > 4 ? <button className="points-show-all" type="button" aria-expanded={showAllRewards} onClick={() => setShowAllRewards((current) => !current)}>{showAllRewards ? "Show fewer rewards" : `Show all ${data.catalog.length} rewards`} <span>{showAllRewards ? "↑" : "↓"}</span></button> : null}</div> : null}

      {tab === "badges" ? <div className="points-tab-panel"><div className="points-section-heading"><div><span className="points-kicker">Your field record</span><h3>Sighting achievements</h3></div>{props.rewards ? <small>{props.rewards.eligibleSightings} sightings · {props.rewards.currentWeeklyStreak} week streak · {props.rewards.badges.length} earned</small> : null}</div>
        <div className="preview-progress-list">{props.rewards?.badgeProgress.filter((item) => !item.earned).slice(0, 4).map((item) => <article key={item.id}>{badgeIcon(item.id) ? <img src={badgeIcon(item.id) || undefined} alt="" /> : <div className="reward-mark">★</div>}<div><p><strong>{badgeLabel(item.id, item.label)}{item.tier ? ` · ${item.tier}` : ""}</strong><span>{item.current}/{item.target}</span></p><small>{badgeDescription(item.id)}</small><div className="points-progress"><span style={{ width: `${Math.min(100, Math.round((item.current / item.target) * 100))}%` }} /></div></div></article>)}</div>
        <div className="points-section-heading badge-heading"><div><span className="points-kicker">Collection</span><h3>Badges</h3></div></div><div className="preview-badge-grid">{BADGES.map((badge) => {
          const progress = props.rewards?.badgeProgress.filter((item) => badgeKey(item.id) === badge.id) || [];
          const earned = Boolean(props.rewards?.badges.some((item) => badgeKey(item.id) === badge.id) || progress.some((item) => item.earned));
          const next = progress.find((item) => !item.earned) || progress[0];
          return <article key={badge.id} data-earned={earned}>{badgeIcon(badge.id) ? <img src={badgeIcon(badge.id) || undefined} alt="" /> : <div className="reward-mark">★</div>}<span>{earned ? "Earned" : next ? `${next.current}/${next.target}` : "Locked"}</span><strong>{badge.label}</strong><small>{badgeDescription(badge.id)}</small></article>;
        })}</div>
      </div> : null}

      {tab === "history" ? <div className="points-tab-panel"><div className="points-section-heading"><div><span className="points-kicker">Redemptions</span><h3>Reward history</h3></div></div>{data.redemptions.length ? <div className="preview-history">{data.redemptions.map((item) => <article key={item.id}><div><strong>{String(item.itemSnapshot.name || item.itemKey)}</strong><small>{new Date(item.createdAt).toLocaleDateString()} · {item.pointsSpent} points</small></div><span>{item.status.replaceAll("_", " ")}</span>{["reserved", "details_required", "submitted", "approved"].includes(item.status) ? <button disabled={saving} type="button" onClick={() => void cancel(item.id)}>Cancel</button> : null}</article>)}</div> : <div className="points-empty"><span>◇</span><strong>No redemptions yet</strong><small>Your history will appear here after your first reward.</small><button type="button" onClick={() => setTab("rewards")}>Explore rewards</button></div>}</div> : null}

      {error ? <p role="alert" className="signal-error">{error}</p> : null}
      {redemptionModal}
      <PreviewStyles />
    </section>
  );
}

function LegacyStyles() {
  return <style jsx global>{`
    .signal-points-panel{display:grid;gap:14px}.signal-points-loading,.signal-paid-note,.signal-earn,.signal-catalog,.signal-history{border:1px solid rgba(245,237,214,.09);border-radius:16px;background:rgba(5,4,3,.22);padding:14px}.signal-points-total{display:flex;justify-content:space-between;gap:16px;align-items:end;border:1px solid rgba(196,148,58,.24);border-radius:18px;padding:16px;background:rgba(196,148,58,.07)}.signal-points-total div{display:grid;gap:4px}.signal-points-total span,.signal-points-total p,.signal-paid-note span,.signal-earn span,.signal-catalog span,.signal-history small,.signal-history p{font:12px/1.5 var(--font-dm-sans);color:rgba(245,237,214,.6)}.signal-points-total strong{font:34px/1 var(--font-playfair);color:var(--color-cream)}.signal-points-total p{margin:0;text-align:right}.signal-paid-note,.signal-earn{display:grid;gap:5px}.signal-paid-note strong,.signal-earn strong,.signal-points-panel h4{color:var(--color-cream);font:800 14px/1.3 var(--font-dm-sans)}.signal-points-panel h4{margin:0 0 10px}.signal-catalog>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.signal-catalog article{display:grid;gap:7px;border:1px solid rgba(245,237,214,.07);border-radius:12px;padding:11px}.signal-catalog article strong,.signal-history strong{color:rgba(245,237,214,.9);font:800 13px/1.3 var(--font-dm-sans)}.signal-points-panel button{border:1px solid rgba(196,148,58,.3);border-radius:9px;background:rgba(196,148,58,.12);color:#e5c77f;padding:9px;font:800 11px var(--font-dm-sans);cursor:pointer}.signal-points-panel button:disabled{opacity:.45;cursor:not-allowed}.signal-history>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid rgba(245,237,214,.07)}.signal-history span{display:grid;gap:3px}.signal-error{color:#ef9b85;font:12px var(--font-dm-sans)}.signal-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(0,0,0,.74);padding:18px}.signal-modal form{width:min(440px,100%);display:grid;gap:14px;border:1px solid rgba(196,148,58,.3);border-radius:18px;background:#12100d;padding:20px}.signal-modal h3,.signal-modal p{margin:0;color:var(--color-cream)}.signal-modal label{display:grid;gap:6px;color:rgba(245,237,214,.8);font:12px var(--font-dm-sans)}.signal-modal input,.signal-modal select{border:1px solid rgba(245,237,214,.14);border-radius:9px;background:#080705;color:var(--color-cream);padding:10px}.signal-check{grid-template-columns:auto 1fr!important;align-items:start}.signal-modal-actions{display:flex;justify-content:flex-end;gap:8px}@media(max-width:620px){.signal-catalog>div{grid-template-columns:1fr}.signal-points-total{align-items:start;flex-direction:column}.signal-points-total p{text-align:left}}
  `}</style>;
}

function PreviewStyles() {
  return <style jsx global>{`
    .points-preview{--gold:#e8c97a;--amber:#c4943a;--cream:#f5edd6;position:relative;display:grid;gap:13px;overflow:hidden}.points-preview-glow{position:absolute;inset:-180px -60px auto;height:300px;background:radial-gradient(ellipse,rgba(196,148,58,.14),transparent 67%);pointer-events:none}.points-hero{position:relative;display:grid;grid-template-columns:minmax(120px,.55fr) minmax(240px,1.2fr) auto;align-items:center;gap:22px;border:1px solid rgba(232,201,122,.19);border-radius:25px;background:linear-gradient(118deg,rgba(32,21,12,.97),rgba(10,8,5,.985) 60%,rgba(31,20,10,.86));padding:22px;box-shadow:0 25px 70px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.04)}.points-balance{display:grid;gap:2px}.points-balance span,.points-kicker{font:850 9px/1 var(--font-jetbrains);letter-spacing:.14em;text-transform:uppercase;color:rgba(232,201,122,.72)}.points-balance strong{font:58px/.94 var(--font-playfair);letter-spacing:-.04em;color:var(--cream)}.points-balance small,.points-next small,.points-feature-card small,.points-section-heading small,.preview-reward-copy small,.preview-progress-list small,.preview-badge-grid small,.preview-history small,.points-empty small{font:12px/1.45 var(--font-dm-sans);color:rgba(245,237,214,.5)}.points-next{display:grid;gap:8px}.points-next>div:nth-child(2){display:flex;justify-content:space-between;gap:12px}.points-next strong{font:800 15px/1.2 var(--font-dm-sans);color:var(--cream)}.points-next b{font:850 10px/1 var(--font-jetbrains);color:var(--gold);white-space:nowrap}.points-progress{height:7px;border-radius:99px;background:rgba(245,237,214,.08);overflow:hidden}.points-progress span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--amber),var(--gold));box-shadow:0 0 14px rgba(232,201,122,.3)}.points-preview button{font-family:var(--font-dm-sans)}.points-primary,.points-sighting-cta{display:inline-flex;align-items:center;justify-content:center;gap:16px;min-height:44px;border:1px solid rgba(232,201,122,.4);border-radius:999px;background:linear-gradient(135deg,var(--amber),var(--gold));color:#120d07;padding:11px 16px;font-size:12px;font-weight:900;text-decoration:none;cursor:pointer;box-shadow:0 12px 28px rgba(196,148,58,.18);transition:transform .2s ease,filter .2s ease}.points-primary:hover,.points-primary:focus-visible,.points-sighting-cta:hover,.points-sighting-cta:focus-visible{transform:translateY(-1px);filter:brightness(1.06);outline:none}.points-notice{display:flex;justify-content:space-between;gap:14px;border:1px solid rgba(232,201,122,.12);border-radius:13px;background:rgba(196,148,58,.045);padding:10px 13px;font:12px var(--font-dm-sans)}.points-notice strong{color:var(--cream)}.points-notice span{color:rgba(245,237,214,.56)}.points-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;border:1px solid rgba(245,237,214,.07);border-radius:14px;background:rgba(5,4,3,.28);padding:4px}.points-tabs button{min-height:38px;border:0;border-radius:10px;background:transparent;color:rgba(245,237,214,.48);font-size:11px;font-weight:850;text-transform:capitalize;cursor:pointer}.points-tabs button[aria-selected="true"]{background:rgba(196,148,58,.13);color:var(--gold);box-shadow:inset 0 0 0 1px rgba(232,201,122,.14)}.points-tabs button:focus-visible{outline:1px solid var(--gold);outline-offset:1px}.points-tab-panel{display:grid;gap:14px;animation:points-enter .35s cubic-bezier(.2,.7,.2,1) both}.points-focus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.points-feature-card{display:grid;grid-template-columns:64px minmax(0,1fr) auto;grid-template-rows:auto 1fr;align-items:center;gap:8px 13px;min-height:132px;border:1px solid rgba(245,237,214,.075);border-radius:20px;background:linear-gradient(145deg,rgba(24,17,11,.74),rgba(7,6,4,.74));padding:16px;text-align:left;cursor:pointer;transition:transform .2s ease,border-color .2s ease,background .2s ease}.points-feature-card:hover,.points-feature-card:focus-visible{transform:translateY(-2px);border-color:rgba(232,201,122,.26);background:linear-gradient(145deg,rgba(38,25,13,.78),rgba(8,6,4,.8));outline:none}.points-feature-card>.points-kicker{grid-column:1/-1}.points-feature-card img,.preview-progress-list img,.preview-badge-grid img{width:58px;height:58px;object-fit:contain}.reward-mark{width:58px;height:58px;display:grid;place-items:center;border:1px solid rgba(232,201,122,.22);border-radius:50%;background:radial-gradient(circle at 35% 28%,rgba(232,201,122,.2),rgba(196,148,58,.045) 55%,rgba(0,0,0,.25));font:800 19px var(--font-playfair);color:var(--gold)}.points-feature-card>div:nth-of-type(2){display:grid;gap:4px}.points-feature-card strong,.preview-reward-copy strong,.preview-progress-list strong,.preview-badge-grid strong,.preview-history strong,.points-empty strong{font:800 14px/1.25 var(--font-dm-sans);color:rgba(245,237,214,.9)}.points-feature-card>b{align-self:end;font:850 10px var(--font-jetbrains);color:var(--gold);white-space:nowrap}.points-earn-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;overflow:hidden;border:1px solid rgba(245,237,214,.07);border-radius:17px;background:rgba(245,237,214,.07)}.points-earn-strip div{display:flex;align-items:center;gap:9px;background:#0e0b08;padding:13px}.points-earn-strip span{font:800 22px var(--font-playfair);color:var(--gold)}.points-earn-strip strong{font:750 11px/1.25 var(--font-dm-sans);color:rgba(245,237,214,.67)}.points-referral{border:1px solid rgba(245,237,214,.07);border-radius:16px;background:rgba(5,4,3,.22);padding:0 14px}.points-referral summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;cursor:pointer;list-style:none}.points-referral summary::-webkit-details-marker{display:none}.points-referral summary span{display:grid;gap:3px}.points-referral summary strong{font:800 13px var(--font-dm-sans);color:var(--cream)}.points-referral summary small{font:11px var(--font-dm-sans);color:rgba(245,237,214,.46)}.points-referral summary b{color:var(--gold)}.points-sighting-cta{justify-self:start}.points-section-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;padding:5px 2px}.points-section-heading>div{display:grid;gap:7px}.points-section-heading h3{margin:0;font:30px/1 var(--font-playfair);color:var(--cream)}.preview-catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.preview-catalog article{display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:12px;border:1px solid rgba(245,237,214,.07);border-radius:18px;background:rgba(5,4,3,.22);padding:13px}.preview-catalog article[data-ready="true"]{border-color:rgba(232,201,122,.23);background:linear-gradient(145deg,rgba(196,148,58,.075),rgba(5,4,3,.27))}.preview-catalog .reward-mark{width:50px;height:50px;font-size:16px}.preview-reward-copy{display:grid;gap:4px;min-width:0}.preview-reward-copy>span{font:850 8px var(--font-jetbrains);letter-spacing:.11em;text-transform:uppercase;color:rgba(232,201,122,.58)}.preview-reward-copy .points-progress{margin-top:3px}.preview-catalog button,.preview-history button,.points-empty button{border:1px solid rgba(232,201,122,.25);border-radius:10px;background:rgba(196,148,58,.1);color:var(--gold);padding:9px 10px;font-size:10px;font-weight:850;cursor:pointer}.preview-catalog button:disabled{opacity:.5;cursor:not-allowed}.preview-progress-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.preview-progress-list article{display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center;gap:11px;border:1px solid rgba(245,237,214,.07);border-radius:18px;background:rgba(5,4,3,.22);padding:12px}.preview-progress-list img,.preview-progress-list .reward-mark{width:50px;height:50px}.preview-progress-list article>div:last-child{display:grid;gap:6px;min-width:0}.preview-progress-list p{display:flex;justify-content:space-between;gap:8px;margin:0}.preview-progress-list p span{font:850 9px var(--font-jetbrains);color:var(--gold);white-space:nowrap}.badge-heading{padding-top:10px}.preview-badge-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.preview-badge-grid article{display:grid;justify-items:start;gap:7px;min-width:0;border:1px dashed rgba(245,237,214,.08);border-radius:17px;background:rgba(5,4,3,.18);padding:12px;opacity:.52}.preview-badge-grid article[data-earned="true"]{border-style:solid;border-color:rgba(232,201,122,.2);background:linear-gradient(145deg,rgba(196,148,58,.07),rgba(5,4,3,.25));opacity:1}.preview-badge-grid img,.preview-badge-grid .reward-mark{width:48px;height:48px}.preview-badge-grid article>span{border:1px solid rgba(245,237,214,.1);border-radius:999px;padding:3px 6px;font:850 8px var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase;color:rgba(245,237,214,.48)}.preview-badge-grid article[data-earned="true"]>span{border-color:rgba(83,211,146,.24);color:rgba(198,255,222,.82)}.preview-history{display:grid;gap:7px}.preview-history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;border:1px solid rgba(245,237,214,.07);border-radius:15px;background:rgba(5,4,3,.2);padding:12px}.preview-history article>div{display:grid;gap:4px}.preview-history article>span{font:850 9px var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase;color:var(--gold)}.points-empty{display:grid;justify-items:center;gap:7px;border:1px dashed rgba(245,237,214,.1);border-radius:20px;padding:40px 18px;text-align:center}.points-empty>span{font:34px var(--font-playfair);color:var(--gold)}.points-empty button{margin-top:5px}.signal-error{color:#ef9b85;font:12px var(--font-dm-sans)}.signal-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(0,0,0,.78);padding:18px}.signal-modal form{width:min(440px,100%);display:grid;gap:14px;border:1px solid rgba(196,148,58,.3);border-radius:18px;background:#12100d;padding:20px}.signal-modal h3,.signal-modal p{margin:0;color:var(--cream)}.signal-modal label{display:grid;gap:6px;color:rgba(245,237,214,.8);font:12px var(--font-dm-sans)}.signal-modal input,.signal-modal select{border:1px solid rgba(245,237,214,.14);border-radius:9px;background:#080705;color:var(--cream);padding:10px}.signal-check{grid-template-columns:auto 1fr!important;align-items:start}.signal-modal-actions{display:flex;justify-content:flex-end;gap:8px}.signal-modal-actions button{border:1px solid rgba(196,148,58,.3);border-radius:9px;background:rgba(196,148,58,.12);color:#e5c77f;padding:9px;font:800 11px var(--font-dm-sans)}.next-unlock-card{position:relative;overflow:hidden;border-color:rgba(232,201,122,.25);background:linear-gradient(145deg,rgba(54,35,15,.82),rgba(10,7,4,.82));box-shadow:inset 0 1px rgba(255,255,255,.035),0 16px 34px rgba(196,148,58,.08)}.next-unlock-card::after{content:"";position:absolute;inset:-70% auto -70% -35%;width:34%;transform:rotate(16deg);background:linear-gradient(90deg,transparent,rgba(245,237,214,.08),transparent);animation:points-shimmer 5.8s ease-in-out infinite;pointer-events:none}.points-feature-card>b{white-space:normal;text-align:right;max-width:105px;line-height:1.35}.preview-catalog article[data-distance="far"]{opacity:.72}.preview-catalog article[data-distance="far"] .reward-mark,.preview-catalog article[data-distance="far"] .points-progress{opacity:.68}.preview-catalog article[data-ready="true"]{opacity:1}.points-show-all{justify-self:center;border:0;background:transparent;color:rgba(232,201,122,.8);padding:7px 12px;font:850 10px var(--font-jetbrains);letter-spacing:.04em;cursor:pointer}.points-show-all:hover,.points-show-all:focus-visible{color:var(--gold);outline:none;text-decoration:underline;text-underline-offset:4px}.preview-badge-grid article[data-earned="true"]{transform:translateY(-1px);border-color:rgba(232,201,122,.34);box-shadow:0 13px 28px rgba(196,148,58,.09),inset 0 1px rgba(255,255,255,.035)}.preview-badge-grid article[data-earned="true"] img,.preview-badge-grid article[data-earned="true"] .reward-mark{width:56px;height:56px;filter:drop-shadow(0 7px 12px rgba(196,148,58,.2))}@keyframes points-shimmer{0%,58%,100%{transform:translateX(-180%) rotate(16deg)}78%{transform:translateX(520%) rotate(16deg)}}@keyframes points-enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@media(max-width:760px){.points-preview{gap:12px}.points-hero{grid-template-columns:1fr auto;gap:15px;padding:17px}.points-balance strong{font-size:48px}.points-next{grid-column:1/-1;grid-row:2}.points-primary{grid-column:2;grid-row:1;padding:10px 12px;font-size:0;gap:0}.points-primary span{font-size:18px}.points-focus-grid,.preview-catalog,.preview-progress-list{grid-template-columns:1fr}.points-earn-strip{grid-template-columns:repeat(2,1fr)}.preview-badge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.points-section-heading{align-items:start;flex-direction:column;gap:7px}.points-section-heading h3{font-size:26px}.points-feature-card{grid-template-columns:56px minmax(0,1fr) auto;min-height:118px;padding:14px}.points-feature-card img,.reward-mark{width:50px;height:50px}.points-tabs button{font-size:10px}.preview-catalog article{grid-template-columns:50px minmax(0,1fr) auto;padding:11px}.points-notice{flex-direction:column;gap:3px}.points-sighting-cta{justify-self:stretch}.points-earn-strip div{padding:11px}}@media(prefers-reduced-motion:reduce){.points-tab-panel{animation:none}.next-unlock-card::after{display:none}.points-primary,.points-sighting-cta,.points-feature-card{transition:none}}
  `}</style>;
}
