"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MemberRow = {
  userId: string;
  name: string;
  email: string;
  tier: string;
  balance: number;
  debt: number;
  redemptionCount: number;
  lastRedemptionAt: string | null;
};

type ShippingAddress = {
  recipientName?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
};

type RedemptionRow = {
  id: string;
  userId: string;
  accountEmail: string;
  itemKey: string;
  itemSnapshot: Record<string, unknown>;
  details: Record<string, unknown>;
  pointsSpent: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  fulfillmentType: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippingAddress: ShippingAddress | null;
};

type OwnerPayload = {
  members: MemberRow[];
  redemptions: RedemptionRow[];
  summary: {
    totalMembers: number;
    membersWithPoints: number;
    totalPoints: number;
    redemptionCount: number;
    openRedemptionCount: number;
  };
  error?: string;
};

const number = new Intl.NumberFormat("en-US");
const CLOSED = new Set(["delivered", "canceled"]);

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "—";
}

function tierLabel(value: string) {
  if (value === "bottled-in-bond") return "Founder";
  return value ? value[0].toUpperCase() + value.slice(1) : "Free";
}

function rewardName(item: RedemptionRow) {
  return typeof item.itemSnapshot.name === "string" && item.itemSnapshot.name.trim()
    ? item.itemSnapshot.name
    : item.itemKey.replaceAll("_", " ");
}

function fulfillmentChoices(item: RedemptionRow) {
  if (item.status === "reserved" || item.status === "details_required") return ["submitted", "canceled"];
  if (item.status === "submitted") return ["approved", "canceled"];
  if (item.status === "approved") return [item.fulfillmentType === "digital" ? "digital_fulfillment" : "packed", "canceled"];
  if (item.status === "packed") return ["shipped"];
  if (item.status === "shipped" || item.status === "digital_fulfillment") return ["delivered"];
  return [];
}

function usefulDetails(details: Record<string, unknown>) {
  return Object.entries(details).filter(([, value]) => value !== "" && value !== null && value !== false);
}

export default function SignalPointsAdminBoard() {
  const [data, setData] = useState<OwnerPayload | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [shipments, setShipments] = useState<Record<string, { carrier: string; trackingNumber: string }>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/signal-points?view=board", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as OwnerPayload;
      if (!response.ok) throw new Error(payload.error || "Signal Points owner board unavailable");
      setData(payload);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Signal Points owner board unavailable");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const members = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.members || [];
    return (data?.members || []).filter((member) => `${member.name} ${member.email} ${member.tier}`.toLowerCase().includes(needle));
  }, [data, query]);

  const redemptions = useMemo(() => [...(data?.redemptions || [])].sort((left, right) => {
    const leftOpen = !CLOSED.has(left.status);
    const rightOpen = !CLOSED.has(right.status);
    if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  }), [data]);

  async function transition(item: RedemptionRow, status: string) {
    setSaving(item.id);
    setError("");
    try {
      const tracking = shipments[item.id] || { carrier: item.carrier || "", trackingNumber: item.trackingNumber || "" };
      const response = await fetch("/api/admin/signal-points", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redemptionId: item.id, status, ...tracking }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Reward status could not be updated");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reward status could not be updated");
    } finally {
      setSaving("");
    }
  }

  if (!data && !error) return <div className="spa-loading">Loading all member balances and reward selections…</div>;

  return (
    <div className="spa-board">
      <style>{styles}</style>
      {error ? <p className="spa-error" role="alert">{error}</p> : null}
      {data ? <>
        <div className="spa-summary" aria-label="Signal Points summary">
          <article><span>Members</span><strong>{number.format(data.summary.totalMembers)}</strong><small>Every member account</small></article>
          <article><span>Points outstanding</span><strong>{number.format(data.summary.totalPoints)}</strong><small>Across all balances</small></article>
          <article><span>Members with points</span><strong>{number.format(data.summary.membersWithPoints)}</strong><small>Balance above zero</small></article>
          <article className={data.summary.openRedemptionCount ? "attention" : ""}><span>Open redemptions</span><strong>{number.format(data.summary.openRedemptionCount)}</strong><small>{number.format(data.summary.redemptionCount)} selected overall</small></article>
        </div>

        <section className="spa-section" aria-labelledby="spa-members-title">
          <div className="spa-section-head">
            <div><p>Member ledger</p><h3 id="spa-members-title">All member balances</h3></div>
            <label><span className="sr-only">Search members</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members" /></label>
          </div>
          <p className="spa-note">Includes members with a zero balance. Operational owner and retailer accounts are excluded.</p>
          <div className="spa-table-wrap" role="region" aria-label="All member Signal Points balances" tabIndex={0}>
            <table>
              <thead><tr><th>Member</th><th>Membership</th><th className="numeric">Points</th><th className="numeric">Debt</th><th>Reward selections</th></tr></thead>
              <tbody>{members.map((member) => <tr key={member.userId}>
                <td><strong>{member.name}</strong>{member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : <small>No email available</small>}</td>
                <td><span className={`spa-tier ${member.tier}`}>{tierLabel(member.tier)}</span></td>
                <td className="numeric points">{number.format(member.balance)}</td>
                <td className={`numeric ${member.debt ? "debt" : ""}`}>{number.format(member.debt)}</td>
                <td>{member.redemptionCount ? <><strong>{number.format(member.redemptionCount)}</strong><small>Latest {dateTime(member.lastRedemptionAt)}</small></> : <span className="muted">None</span>}</td>
              </tr>)}</tbody>
            </table>
            {!members.length ? <p className="spa-empty">No members match that search.</p> : null}
          </div>
        </section>

        <section className="spa-section" aria-labelledby="spa-redemptions-title">
          <div className="spa-section-head">
            <div><p>Owner fulfillment</p><h3 id="spa-redemptions-title">Reward redemptions</h3></div>
            <span>{number.format(data.summary.redemptionCount)} selected · {number.format(data.summary.openRedemptionCount)} open</span>
          </div>
          <p className="spa-note">Open selections appear first. Completed and canceled selections stay visible as history.</p>
          <div className="spa-redemptions">
            {redemptions.length ? redemptions.map((item) => {
              const tracking = shipments[item.id] || { carrier: item.carrier || "", trackingNumber: item.trackingNumber || "" };
              const canShip = tracking.carrier.trim() !== "" && tracking.trackingNumber.trim() !== "";
              const choices = fulfillmentChoices(item);
              const details = usefulDetails(item.details);
              return <article className={`spa-redemption ${CLOSED.has(item.status) ? "closed" : "open"}`} key={item.id}>
                <div className="spa-redemption-main">
                  <div className="spa-redemption-title"><strong>{rewardName(item)}</strong><span className={`spa-status ${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>
                  <a href={`mailto:${item.accountEmail}`}>{item.accountEmail}</a>
                  <p>{number.format(item.pointsSpent)} points · Selected {dateTime(item.createdAt)}</p>
                  {(details.length || item.shippingAddress || item.carrier || item.trackingNumber) ? <details><summary>Selection and fulfillment details</summary>
                    <dl>
                      {details.map(([label, value]) => <div key={label}><dt>{label.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}
                      {item.carrier ? <div><dt>Carrier</dt><dd>{item.carrier}</dd></div> : null}
                      {item.trackingNumber ? <div><dt>Tracking number</dt><dd>{item.trackingNumber}</dd></div> : null}
                    </dl>
                    {item.shippingAddress ? <address>{item.shippingAddress.recipientName}<br />{item.shippingAddress.addressLine1}{item.shippingAddress.addressLine2 ? <><br />{item.shippingAddress.addressLine2}</> : null}<br />{item.shippingAddress.city}, {item.shippingAddress.stateCode} {item.shippingAddress.postalCode}<br />{item.shippingAddress.phone}</address> : null}
                  </details> : null}
                </div>
                {choices.length ? <div className="spa-actions">
                  {item.status === "packed" ? <div className="spa-tracking">
                    <input aria-label={`Carrier for ${item.accountEmail}`} placeholder="Carrier" value={tracking.carrier} onChange={(event) => setShipments((current) => ({ ...current, [item.id]: { ...tracking, carrier: event.target.value } }))} />
                    <input aria-label={`Tracking number for ${item.accountEmail}`} placeholder="Tracking number" value={tracking.trackingNumber} onChange={(event) => setShipments((current) => ({ ...current, [item.id]: { ...tracking, trackingNumber: event.target.value } }))} />
                  </div> : null}
                  <div>{choices.map((status) => <button type="button" key={status} disabled={saving === item.id || (status === "shipped" && !canShip)} onClick={() => void transition(item, status)}>{status.replaceAll("_", " ")}</button>)}</div>
                </div> : null}
              </article>;
            }) : <div className="spa-empty"><strong>No rewards have been selected yet.</strong><p>Member redemptions will appear here as soon as someone chooses a reward.</p></div>}
          </div>
        </section>
      </> : null}
    </div>
  );
}

const styles = `
  .spa-board{display:grid;gap:18px}.spa-loading,.spa-error,.spa-empty{border:1px solid #3b3328;background:#15120f;padding:18px;color:#b9ad9b}.spa-error{border-color:#7a312b;color:#f0aaa1}
  .spa-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.spa-summary article{display:grid;gap:5px;border:1px solid #332c23;background:#13110e;padding:14px}.spa-summary article.attention{border-color:#7b5a29;background:#1b160f}.spa-summary span,.spa-summary small{color:#998e7d;font-size:11px}.spa-summary strong{font-family:var(--font-fraunces),serif;font-size:27px;color:#f2e7d5}
  .spa-section{border:1px solid #332c23;background:#11100d;padding:16px}.spa-section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:8px}.spa-section-head p{margin:0 0 3px;color:#a9854e;font-size:10px;text-transform:uppercase;letter-spacing:.13em}.spa-section-head h3{margin:0;font-family:var(--font-fraunces),serif;font-size:22px;color:#f1e5d3}.spa-section-head>span{color:#a49a8b;font-size:12px}.spa-section-head input,.spa-tracking input{min-width:230px;border:1px solid #443a2e;background:#0c0b09;color:#f2e7d5;padding:10px 12px}.spa-note{margin:0 0 12px;color:#918878;font-size:12px}
  .spa-table-wrap{max-height:520px;overflow:auto;border:1px solid #29231c}.spa-table-wrap table{width:100%;border-collapse:collapse;min-width:720px}.spa-table-wrap th{position:sticky;top:0;z-index:1;background:#191510;color:#a99d8b;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.1em}.spa-table-wrap th,.spa-table-wrap td{padding:11px 12px;border-bottom:1px solid #29231c}.spa-table-wrap td{color:#d7cdbc;font-size:12px}.spa-table-wrap td strong{display:block;color:#f0e5d4}.spa-table-wrap td a,.spa-redemption a{color:#bb9863;text-decoration:none}.spa-table-wrap td small{display:block;color:#837b70;margin-top:3px}.spa-table-wrap .numeric{text-align:right;font-variant-numeric:tabular-nums}.spa-table-wrap .points{font-weight:700;color:#e5bd7d}.spa-table-wrap .debt{color:#e39b91}.spa-tier,.spa-status{display:inline-flex;border:1px solid #433a2e;padding:3px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#bfb3a0}.spa-tier.barrel,.spa-tier.bottled-in-bond{border-color:#765529;color:#e4bd7f}.spa-tier.standard{border-color:#4f625f;color:#aed0ca}.muted{color:#777064}
  .spa-redemptions{display:grid;gap:9px}.spa-redemption{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;border:1px solid #332c23;padding:14px;background:#15120f}.spa-redemption.open{border-left:3px solid #a97b3f}.spa-redemption.closed{opacity:.76}.spa-redemption-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.spa-redemption-title strong{color:#f0e5d4}.spa-redemption-main>p{margin:5px 0 0;color:#958b7b;font-size:11px}.spa-status.delivered{border-color:#426656;color:#a9d0ba}.spa-status.canceled{border-color:#62413c;color:#d5a39b}.spa-redemption details{margin-top:10px;color:#aba08f;font-size:11px}.spa-redemption summary{cursor:pointer;color:#c1a574}.spa-redemption dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:9px 0}.spa-redemption dl div{border:1px solid #2e281f;padding:7px}.spa-redemption dt{color:#766f64;text-transform:capitalize}.spa-redemption dd{margin:2px 0 0;color:#d4cab9}.spa-redemption address{font-style:normal;line-height:1.55;color:#c8bdac}.spa-actions{display:grid;align-content:center;justify-items:end;gap:8px}.spa-actions>div{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.spa-actions button{border:1px solid #71532b;background:#21190f;color:#e7c38b;padding:8px 10px;font-size:10px;text-transform:capitalize;cursor:pointer}.spa-actions button:disabled{opacity:.45;cursor:not-allowed}.spa-tracking{display:grid!important;grid-template-columns:1fr 1fr}.spa-tracking input{min-width:140px;padding:8px}
  .spa-empty strong{color:#e0d3c0}.spa-empty p{margin:5px 0 0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:900px){.spa-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.spa-redemption{grid-template-columns:1fr}.spa-actions{justify-items:start}.spa-actions>div{justify-content:flex-start}}
  @media(max-width:600px){.spa-summary{grid-template-columns:1fr 1fr}.spa-section{padding:12px}.spa-section-head{align-items:stretch;flex-direction:column}.spa-section-head input{width:100%;min-width:0}.spa-redemption dl{grid-template-columns:1fr}.spa-tracking{grid-template-columns:1fr!important;width:100%}.spa-tracking input{width:100%;min-width:0}}
`;
