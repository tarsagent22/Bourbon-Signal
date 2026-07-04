"use client";

import { useEffect, useState } from "react";
import { Check, RotateCw, ShieldAlert, Trash2 } from "lucide-react";

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

function statusText(item: BottleContribution) {
  if (item.status === "matched_existing") return "Matched existing";
  if (item.status === "needs_human") return "Needs Chandler";
  if (item.status === "added") return "Added to Bible";
  if (item.status === "rejected") return "Rejected";
  if (item.status === "ignored") return "Ignored";
  return "New";
}

export default function AdminBottleQueueClient() {
  const [items, setItems] = useState<BottleContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

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

  useEffect(() => { load(); }, []);

  const act = async (item: BottleContribution, action: string) => {
    setWorkingId(`${item.id}:${action}`);
    setError(null);
    try {
      const notes = window.prompt("Optional note", item.notes || "") || item.notes || "";
      const res = await fetch("/api/admin/bottle-contributions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, action, notes, candidateBottleId: item.candidateBottleId, candidateBottleName: item.candidateBottleName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingId(null);
    }
  };

  const active = items.filter((item) => item.status === "new" || item.status === "needs_human" || item.status === "matched_existing");

  return (
    <main className="admin-bottle-page">
      <style>{`
        .admin-bottle-page{min-height:100vh;padding:104px 16px 70px;background:linear-gradient(180deg,#100c08,#1b130c 48%,#100c08);color:var(--color-cream)}
        .admin-wrap{max-width:980px;margin:0 auto}.admin-kicker{font-family:var(--font-jetbrains);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:rgba(232,201,122,.72);font-weight:850}.admin-title{font-family:var(--font-playfair);font-size:clamp(38px,9vw,70px);line-height:.95;margin:10px 0 12px}.admin-sub{max-width:720px;color:rgba(245,237,214,.64);font-size:15px;line-height:1.7;margin:0 0 22px}.admin-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;flex-wrap:wrap}.admin-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(245,237,214,.12);background:rgba(245,237,214,.045);color:var(--color-cream);border-radius:999px;padding:10px 13px;font-family:var(--font-dm-sans);font-size:13px;font-weight:850;cursor:pointer}.admin-button.gold{border-color:rgba(196,148,58,.32);background:rgba(196,148,58,.11)}.admin-button.danger{border-color:rgba(255,140,110,.28);background:rgba(255,120,90,.08)}.admin-grid{display:grid;gap:12px}.admin-card{border:1px solid rgba(245,237,214,.09);border-radius:22px;background:linear-gradient(145deg,rgba(23,17,12,.94),rgba(9,7,6,.98));box-shadow:0 18px 54px rgba(0,0,0,.28);padding:16px}.admin-meta{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}.admin-status{font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:rgba(232,201,122,.74);font-weight:850}.admin-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.42);white-space:nowrap}.admin-name{font-family:var(--font-playfair);font-size:30px;line-height:1.04;margin:0 0 8px}.admin-detail{color:rgba(245,237,214,.62);font-size:13px;line-height:1.55;margin:0 0 4px}.admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.admin-empty{border:1px solid rgba(245,237,214,.1);border-radius:22px;background:rgba(245,237,214,.04);padding:22px;color:rgba(245,237,214,.62)}.admin-pill{display:inline-flex;border:1px solid rgba(196,148,58,.22);border-radius:999px;padding:5px 8px;color:rgba(232,201,122,.9);font-family:var(--font-jetbrains);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;margin-right:6px;margin-top:4px}
      `}</style>
      <div className="admin-wrap">
        <div className="admin-kicker">Admin review</div>
        <h1 className="admin-title">Bottle queue</h1>
        <p className="admin-sub">Missing bottles from Bottle Check, My Collection, and Member Sightings. Match obvious entries, reject spam, or hold ambiguous bottles for research.</p>
        <div className="admin-toolbar"><span className="admin-status">{loading ? "Loading…" : `${active.length} active / ${items.length} total`}</span><button className="admin-button" type="button" onClick={load}><RotateCw size={14}/> Refresh</button></div>
        {error ? <div className="admin-empty" style={{ color: "#ffb4a3" }}>{error}</div> : null}
        {!loading && active.length === 0 ? <div className="admin-empty">No bottle contributions need review right now.</div> : null}
        <div className="admin-grid">
          {active.map((item) => (
            <article className="admin-card" key={item.id}>
              <div className="admin-meta"><span className="admin-status">{statusText(item)}</span><span className="admin-time">{new Date(item.updatedAt || item.createdAt).toLocaleString()}</span></div>
              <h2 className="admin-name">{item.rawName}</h2>
              <p className="admin-detail">Source: {item.source.replace("_", " ")} · duplicates: {item.duplicateCount || 1} · contributor: {item.userEmail || "member"}</p>
              <p className="admin-detail">Normalized: {item.normalizedName}</p>
              {item.candidateBottleName ? <p className="admin-detail">Candidate match: <strong>{item.candidateBottleName}</strong> {item.confidence ? `· ${item.confidence} confidence` : ""}</p> : null}
              {item.notes ? <p className="admin-detail">Notes: {item.notes}</p> : null}
              <div><span className="admin-pill">{item.status}</span>{item.confidence ? <span className="admin-pill">{item.confidence}</span> : null}</div>
              <div className="admin-actions">
                <button disabled={Boolean(workingId)} className="admin-button gold" onClick={() => act(item, "match")}><Check size={14}/> Match existing</button>
                <button disabled={Boolean(workingId)} className="admin-button gold" onClick={() => act(item, "added")}><Check size={14}/> Mark added</button>
                <button disabled={Boolean(workingId)} className="admin-button" onClick={() => act(item, "needs_human")}><ShieldAlert size={14}/> Needs Chandler</button>
                <button disabled={Boolean(workingId)} className="admin-button danger" onClick={() => act(item, "reject")}><Trash2 size={14}/> Spam/reject</button>
                <button disabled={Boolean(workingId)} className="admin-button" onClick={() => act(item, "ignore")}>Ignore</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
