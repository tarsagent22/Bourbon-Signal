"use client";

import { useEffect, useState } from "react";
import { Check, Link2, RotateCw, X } from "lucide-react";
import { formatControlRoomDateTime } from "@/lib/control-room-time";

type BottleContribution = {
  id: string;
  rawName: string;
  normalizedName: string;
  source: "sighting" | "collection" | "bottle_check";
  userEmail?: string;
  status: "new" | "matched_existing" | "needs_human" | "rejected" | "added" | "ignored";
  duplicateCount: number;
  candidateBottleId?: string;
  candidateBottleName?: string;
  confidence?: "high" | "medium" | "low";
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type ReviewAction = "use_match" | "confirm_added" | "dismiss";
type CatalogDraft = { canonicalName: string; brand: string; category: "bourbon" | "rye" | "american_whiskey"; availability: "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn" };

function initialDraft(item: BottleContribution): CatalogDraft {
  const words = item.rawName.trim().split(/\s+/);
  return {
    canonicalName: item.rawName,
    brand: words.slice(0, Math.min(2, words.length)).join(" "),
    category: /\brye\b/i.test(item.rawName) ? "rye" : "bourbon",
    availability: "limited",
  };
}

function statusText(item: BottleContribution) {
  if (item.status === "needs_human") return "Needs review";
  return item.candidateBottleName ? "Suggested match" : "New bottle";
}

function completionMessage(action: ReviewAction) {
  if (action === "use_match") return "Matched to the suggested Bottle Bible entry.";
  if (action === "confirm_added") return "Added to the Bottle Bible and removed from the queue.";
  return "Dismissed as an invalid entry.";
}

export default function AdminBottleQueueClient({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<BottleContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CatalogDraft>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bottle-contributions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load bottle queue");
      setItems(data.contributions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const act = async (item: BottleContribution, action: ReviewAction) => {
    const actionId = `${item.id}:${action}`;
    setWorkingId(actionId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/bottle-contributions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          action,
          candidateBottleId: item.candidateBottleId,
          candidateBottleName: item.candidateBottleName,
          ...(action === "confirm_added" ? { catalogBottle: drafts[item.id] || initialDraft(item) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setItems((current) => data.pendingReview
        ? current.map((entry) => entry.id === item.id ? { ...entry, ...data.contribution } : entry)
        : current.filter((entry) => entry.id !== item.id));
      setNotice(completionMessage(action));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingId(null);
    }
  };

  const active = items.filter((item) => item.status === "new" || item.status === "needs_human");

  return (
    <div className={`bq-page${embedded ? " embedded" : ""}`}>
      <style>{`
        .bq-page{min-height:100vh;padding:104px 16px 70px;background:linear-gradient(180deg,#100c08,#1b130c 48%,#100c08);color:var(--color-cream)}
        .bq-page.embedded{min-height:0;padding:0;background:transparent}.bq-wrap{max-width:980px;margin:0 auto}.bq-kicker{font-family:var(--font-jetbrains);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:rgba(232,201,122,.72);font-weight:850}.bq-title{font-family:var(--font-playfair);font-size:clamp(38px,9vw,70px);line-height:.95;margin:10px 0 12px}.bq-sub{max-width:720px;color:rgba(245,237,214,.64);font-size:15px;line-height:1.7;margin:0 0 22px}.bq-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0;flex-wrap:wrap}.bq-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(245,237,214,.15);background:rgba(245,237,214,.055);color:var(--color-cream);border-radius:12px;padding:11px 14px;font-family:var(--font-dm-sans);font-size:13px;font-weight:850;cursor:pointer;transition:transform 120ms ease,background 120ms ease,border-color 120ms ease,box-shadow 120ms ease}.bq-button:hover,.bq-button:focus-visible{outline:none;border-color:rgba(232,201,122,.58);background:rgba(232,201,122,.11);box-shadow:0 7px 20px rgba(0,0,0,.2)}.bq-button:active{transform:translateY(2px) scale(.985);box-shadow:none}.bq-button:disabled{cursor:wait;opacity:.52;transform:none}.bq-button.primary{border-color:rgba(196,148,58,.5);background:linear-gradient(180deg,rgba(196,148,58,.24),rgba(196,148,58,.12))}.bq-button.danger{border-color:rgba(255,140,110,.3);color:#ffc1b1}.bq-grid{display:grid;gap:12px}.bq-catalog-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}.bq-catalog-fields label{display:grid;gap:5px;color:rgba(245,237,214,.6);font-family:var(--font-jetbrains);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.bq-catalog-fields input,.bq-catalog-fields select{min-width:0;border:1px solid rgba(245,237,214,.14);border-radius:10px;background:#100c08;color:var(--color-cream);padding:10px;font:600 13px var(--font-dm-sans);text-transform:none;letter-spacing:0}.bq-catalog-fields input:focus,.bq-catalog-fields select:focus{outline:2px solid rgba(196,148,58,.42);outline-offset:1px}.bq-card{border:1px solid rgba(245,237,214,.1);border-radius:18px;background:linear-gradient(145deg,rgba(23,17,12,.94),rgba(9,7,6,.98));box-shadow:0 18px 54px rgba(0,0,0,.28);padding:16px;transition:opacity 140ms ease,transform 140ms ease,border-color 140ms ease}.bq-card.working{opacity:.72;transform:scale(.995);border-color:rgba(196,148,58,.38)}.bq-meta{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}.bq-status{font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:rgba(232,201,122,.8);font-weight:850}.bq-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.42);white-space:nowrap}.bq-name{font-family:var(--font-playfair);font-size:30px;line-height:1.04;margin:0 0 8px}.bq-detail{color:rgba(245,237,214,.62);font-size:13px;line-height:1.55;margin:0 0 4px}.bq-recommendation{margin:12px 0 0;border-left:2px solid rgba(196,148,58,.58);background:rgba(196,148,58,.07);padding:10px 12px;color:rgba(245,237,214,.78);font-size:13px;line-height:1.5}.bq-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.bq-empty{border:1px solid rgba(245,237,214,.1);border-radius:14px;background:rgba(245,237,214,.04);padding:16px;color:rgba(245,237,214,.62);margin:10px 0}.bq-empty.success{border-color:rgba(115,201,135,.28);background:rgba(56,130,74,.1);color:#bceac5}
        @media(max-width:680px){.bq-page{padding-left:12px;padding-right:12px}.bq-catalog-fields{grid-template-columns:1fr}.bq-actions .bq-button{flex:1 1 46%;min-height:46px}.bq-actions .bq-button.danger{flex-basis:100%}}
        @media(prefers-reduced-motion:reduce){.bq-button,.bq-card{transition:none}}
      `}</style>
      <div className="bq-wrap">
        {!embedded ? <><div className="bq-kicker">Admin review</div><h1 className="bq-title">Bottle queue</h1><p className="bq-sub">Resolve member-entered bottles by accepting a suggested match, confirming that you added the bottle, or dismissing an invalid entry.</p></> : null}
        <div className="bq-toolbar"><span className="bq-status">{loading ? "Loading…" : `${active.length} bottle${active.length === 1 ? "" : "s"} need review`}</span><button className="bq-button" type="button" onClick={() => void load()} disabled={loading}><RotateCw size={14}/> {loading ? "Refreshing…" : "Refresh"}</button></div>
        {error ? <div className="bq-empty" role="alert" style={{ color: "#ffb4a3" }}>{error}</div> : null}
        {notice ? <div className="bq-empty success" role="status">{notice}</div> : null}
        {!loading && active.length === 0 ? <div className="bq-empty">Nothing in the bottle queue.</div> : null}
        <div className="bq-grid">
          {active.map((item) => {
            const itemWorking = workingId?.startsWith(`${item.id}:`) === true;
            return <article className={`bq-card${itemWorking ? " working" : ""}`} key={item.id} aria-busy={itemWorking}>
              <div className="bq-meta"><span className="bq-status">{statusText(item)}</span><span className="bq-time">{formatControlRoomDateTime(item.updatedAt || item.createdAt)}</span></div>
              <h2 className="bq-name">{item.rawName}</h2>
              <p className="bq-detail">From {item.source.replace("_", " ")} · submitted {item.duplicateCount || 1} time{item.duplicateCount === 1 ? "" : "s"}</p>
              <p className="bq-detail">Normalized as {item.normalizedName}</p>
              {item.candidateBottleName ? <div className="bq-recommendation">Suggested Bottle Bible match: <strong>{item.candidateBottleName}</strong>{item.confidence ? ` · ${item.confidence} confidence` : ""}</div> : null}
              {item.notes ? <p className="bq-detail" style={{ marginTop: 10 }}>Previous note: {item.notes}</p> : null}
              <div className="bq-catalog-fields">
                {(() => {
                  const draft = drafts[item.id] || initialDraft(item);
                  const update = (patch: Partial<CatalogDraft>) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, ...patch } }));
                  return <>
                    <label>Canonical name<input value={draft.canonicalName} onChange={(event) => update({ canonicalName: event.target.value })} /></label>
                    <label>Brand<input value={draft.brand} onChange={(event) => update({ brand: event.target.value })} /></label>
                    <label>Category<select value={draft.category} onChange={(event) => update({ category: event.target.value as CatalogDraft["category"] })}><option value="bourbon">Bourbon</option><option value="rye">Rye</option><option value="american_whiskey">American whiskey</option></select></label>
                    <label>Availability<select value={draft.availability} onChange={(event) => update({ availability: event.target.value as CatalogDraft["availability"] })}><option value="common">Common</option><option value="regional">Regional</option><option value="seasonal">Seasonal</option><option value="limited">Limited</option><option value="allocated">Allocated</option><option value="highly_allocated">Highly allocated</option><option value="unicorn">Unicorn</option></select></label>
                  </>;
                })()}
              </div>
              <div className="bq-actions">
                {item.candidateBottleName ? <button disabled={Boolean(workingId)} className="bq-button primary" onClick={() => void act(item, "use_match")}><Link2 size={15}/> {workingId === `${item.id}:use_match` ? "Matching…" : "Use suggested match"}</button> : null}
                <button disabled={Boolean(workingId)} className="bq-button primary" onClick={() => void act(item, "confirm_added")}><Check size={15}/> {workingId === `${item.id}:confirm_added` ? "Adding…" : "Add to Bottle Bible"}</button>
                <button disabled={Boolean(workingId)} className="bq-button danger" onClick={() => void act(item, "dismiss")}><X size={15}/> {workingId === `${item.id}:dismiss` ? "Dismissing…" : "Dismiss invalid entry"}</button>
              </div>
            </article>;
          })}
        </div>
      </div>
    </div>
  );
}
