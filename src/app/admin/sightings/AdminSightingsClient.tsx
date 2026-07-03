"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, RotateCw, Trash2, X } from "lucide-react";
import type { MemberSighting } from "@/lib/sightings";

type AdminSighting = MemberSighting & { reporterEmail?: string; reporterName?: string };

function statusLabel(sighting: AdminSighting) {
  const proof = sighting.rewardState?.photoProof;
  if (sighting.rewardState?.removedAt) return "Removed";
  if (sighting.rewardState?.rejectedAt) return "Rejected";
  if (!proof) return "No photo";
  if (proof.status === "verified_public") return "Photo verified · public";
  if (proof.status === "verified_private") return "Photo verified · private";
  if (proof.status === "rejected") return "Photo rejected";
  return "Pending review";
}

export default function AdminSightingsClient() {
  const [sightings, setSightings] = useState<AdminSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sightings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load admin queue");
      setSightings(data.sightings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (sighting: AdminSighting, action: string) => {
    if (!sighting.reporterUserId) return;
    setWorkingId(`${sighting.id}:${action}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/sightings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reporterUserId: sighting.reporterUserId, sightingId: sighting.id, action }),
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

  return (
    <main className="admin-sightings-page">
      <style>{`
        .admin-sightings-page{min-height:100vh;padding:104px 16px 70px;background:linear-gradient(180deg,#100c08,#1b130c 48%,#100c08);color:var(--color-cream)}
        .admin-wrap{max-width:960px;margin:0 auto}
        .admin-kicker{font-family:var(--font-jetbrains);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:rgba(232,201,122,.72);font-weight:850}
        .admin-title{font-family:var(--font-playfair);font-size:clamp(38px,9vw,70px);line-height:.95;margin:10px 0 12px}
        .admin-sub{max-width:640px;color:rgba(245,237,214,.64);font-size:15px;line-height:1.7;margin:0 0 22px}
        .admin-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;flex-wrap:wrap}
        .admin-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(245,237,214,.12);background:rgba(245,237,214,.045);color:var(--color-cream);border-radius:999px;padding:10px 13px;font-family:var(--font-dm-sans);font-size:13px;font-weight:850;cursor:pointer}
        .admin-button.gold{border-color:rgba(196,148,58,.32);background:rgba(196,148,58,.11)}
        .admin-button.danger{border-color:rgba(255,140,110,.28);background:rgba(255,120,90,.08)}
        .admin-grid{display:grid;gap:14px}
        .admin-card{border:1px solid rgba(245,237,214,.09);border-radius:24px;background:linear-gradient(145deg,rgba(23,17,12,.94),rgba(9,7,6,.98));box-shadow:0 18px 54px rgba(0,0,0,.28);overflow:hidden}
        .admin-photo{display:block;width:100%;max-height:420px;object-fit:cover;background:#050403}
        .admin-body{padding:16px}
        .admin-meta{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}
        .admin-status{font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:rgba(232,201,122,.74);font-weight:850}
        .admin-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.42);white-space:nowrap}
        .admin-name{font-family:var(--font-playfair);font-size:28px;line-height:1.04;margin:0 0 8px}
        .admin-detail{color:rgba(245,237,214,.62);font-size:13px;line-height:1.55;margin:0 0 4px}
        .admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        .admin-empty{border:1px solid rgba(245,237,214,.1);border-radius:22px;background:rgba(245,237,214,.04);padding:22px;color:rgba(245,237,214,.62)}
        @media(max-width:680px){.admin-sightings-page{padding-left:12px;padding-right:12px}.admin-card{border-radius:20px}.admin-body{padding:14px}.admin-actions .admin-button{flex:1 1 46%;padding:11px 9px}}
      `}</style>
      <div className="admin-wrap">
        <div className="admin-kicker">Admin review</div>
        <h1 className="admin-title">Sighting photos</h1>
        <p className="admin-sub">Approve proof photos, choose whether a photo appears publicly, reject questionable uploads, or remove sightings that should lose points.</p>
        <div className="admin-toolbar">
          <span className="admin-status">{loading ? "Loading…" : `${sightings.length} review item${sightings.length === 1 ? "" : "s"}`}</span>
          <button className="admin-button" type="button" onClick={load}><RotateCw size={14}/> Refresh</button>
        </div>
        {error ? <div className="admin-empty" style={{ color: "#ffb4a3" }}>{error}</div> : null}
        {!loading && sightings.length === 0 ? <div className="admin-empty">No photo proofs are waiting right now.</div> : null}
        <div className="admin-grid">
          {sightings.map((sighting) => {
            const proof = sighting.rewardState?.photoProof;
            return (
              <article className="admin-card" key={`${sighting.reporterUserId}:${sighting.id}`}>
                {proof?.url ? <img className="admin-photo" src={proof.url} alt={`Proof for ${sighting.bottleName}`} loading="lazy" /> : null}
                <div className="admin-body">
                  <div className="admin-meta"><span className="admin-status">{statusLabel(sighting)}</span><span className="admin-time">{new Date(proof?.uploadedAt || sighting.createdAt).toLocaleString()}</span></div>
                  <h2 className="admin-name">{sighting.bottleName}</h2>
                  <p className="admin-detail">{sighting.storeName} · {[sighting.storeCity, sighting.storeState].filter(Boolean).join(", ")}</p>
                  <p className="admin-detail">Reporter: {sighting.reporterName || "Member"} · {sighting.reporterEmail || "unknown"}</p>
                  <p className="admin-detail">Tier: {sighting.rarityTier || "limited"}</p>
                  <div className="admin-actions">
                    <button disabled={Boolean(workingId)} className="admin-button gold" onClick={() => act(sighting, "verify_public")}><Eye size={14}/> Verify + show</button>
                    <button disabled={Boolean(workingId)} className="admin-button" onClick={() => act(sighting, "verify_private")}><EyeOff size={14}/> Verify private</button>
                    <button disabled={Boolean(workingId)} className="admin-button" onClick={() => act(sighting, "reject_photo")}><X size={14}/> Reject photo</button>
                    <button disabled={Boolean(workingId)} className="admin-button danger" onClick={() => act(sighting, "remove_sighting")}><Trash2 size={14}/> Remove</button>
                    <button disabled={Boolean(workingId)} className="admin-button danger" onClick={() => act(sighting, "reject_sighting")}><Check size={14}/> Reject sighting</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
