"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCw, X } from "lucide-react";
import type { MemberSighting } from "@/lib/sightings";
import type { CommunityContributorModeration } from "@/lib/community-contributor-standing";
import { formatControlRoomDateTime } from "@/lib/control-room-time";

type AdminSighting = MemberSighting & {
  reporterEmail?: string;
  reporterName?: string;
  reviewReasons?: string[];
  contributorModeration?: CommunityContributorModeration | null;
};

function statusLabel(sighting: AdminSighting) {
  const proof = sighting.rewardState?.photoProof;
  if (sighting.rewardState?.removedAt) return "Removed";
  if (sighting.rewardState?.rejectedAt) return "Rejected";
  if (sighting.reviewState?.needsBottleReview || sighting.reviewState?.needsStoreReview) return "Catalog review";
  if (!proof) return "No photo";
  if (proof.status === "verified_public") return "Photo reviewed · public";
  if (proof.status === "verified_private") return "Photo reviewed · private";
  if (proof.status === "rejected") return "Photo rejected";
  return "Pending review";
}

function actionMessage(action: string, pendingReview: boolean, catalogResult?: { bottle?: { canonicalName?: string } | null; location?: { name?: string } | null }) {
  if (pendingReview) return "Saved. This sighting still has another review requirement.";
  const additions = [catalogResult?.bottle?.canonicalName ? `bottle ${catalogResult.bottle.canonicalName}` : "", catalogResult?.location?.name ? `location ${catalogResult.location.name}` : ""].filter(Boolean);
  const catalogNote = additions.length ? ` Added ${additions.join(" and ")} to the catalog.` : "";
  if (action === "verify_public") return `Approved and published.${catalogNote} The sighting left the queue.`;
  if (action === "verify_private") return `Approved with a private photo.${catalogNote} The sighting left the queue.`;
  return "Rejected. The sighting left the queue.";
}

export default function AdminSightingsClient({ embedded = false }: { embedded?: boolean }) {
  const [sightings, setSightings] = useState<AdminSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
    try {
      const res = await fetch("/api/admin/sightings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reporterUserId: sighting.reporterUserId, sightingId: sighting.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setSightings((current) => data.pendingReview
        ? current.map((item) => item.id === sighting.id ? { ...item, ...data.sighting } : item)
        : current.filter((item) => item.id !== sighting.id));
      setNotice(actionMessage(action, Boolean(data.pendingReview), data.catalogResult));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className={`admin-sightings-page${embedded ? " embedded" : ""}`}>
      <style>{`
        .admin-sightings-page{min-height:100vh;padding:104px 16px 70px;background:linear-gradient(180deg,#100c08,#1b130c 48%,#100c08);color:var(--color-cream)}
        .admin-sightings-page.embedded{min-height:0;padding:0;background:transparent}
        .admin-wrap{max-width:960px;margin:0 auto}
        .admin-kicker{font-family:var(--font-jetbrains);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:rgba(232,201,122,.72);font-weight:850}
        .admin-title{font-family:var(--font-playfair);font-size:clamp(38px,9vw,70px);line-height:.95;margin:10px 0 12px}
        .admin-sub{max-width:640px;color:rgba(245,237,214,.64);font-size:15px;line-height:1.7;margin:0 0 22px}
        .admin-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0;flex-wrap:wrap}
        .admin-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(245,237,214,.15);background:rgba(245,237,214,.055);color:var(--color-cream);border-radius:12px;padding:11px 14px;font-family:var(--font-dm-sans);font-size:13px;font-weight:850;cursor:pointer;transition:transform 120ms ease,background 120ms ease,border-color 120ms ease,box-shadow 120ms ease}
        .admin-button:hover,.admin-button:focus-visible{outline:none;border-color:rgba(232,201,122,.58);background:rgba(232,201,122,.11);box-shadow:0 7px 20px rgba(0,0,0,.2)}.admin-button:active{transform:translateY(2px) scale(.985);box-shadow:none}.admin-button:disabled{cursor:wait;opacity:.52;transform:none}
        .admin-button.gold{border-color:rgba(196,148,58,.5);background:linear-gradient(180deg,rgba(196,148,58,.24),rgba(196,148,58,.12))}
        .admin-button.danger{border-color:rgba(255,140,110,.3);color:#ffc1b1}
        .admin-grid{display:grid;gap:14px}
        .admin-card{border:1px solid rgba(245,237,214,.09);border-radius:24px;background:linear-gradient(145deg,rgba(23,17,12,.94),rgba(9,7,6,.98));box-shadow:0 18px 54px rgba(0,0,0,.28);overflow:hidden;transition:opacity 140ms ease,transform 140ms ease,border-color 140ms ease}.admin-card.working{opacity:.72;transform:scale(.995);border-color:rgba(196,148,58,.38)}
        .admin-photo{display:block;width:100%;max-height:420px;object-fit:cover;background:#050403}
        .admin-body{padding:16px}
        .admin-meta{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}
        .admin-status{font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:rgba(232,201,122,.74);font-weight:850}
        .admin-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.42);white-space:nowrap}
        .admin-name{font-family:var(--font-playfair);font-size:28px;line-height:1.04;margin:0 0 8px}
        .admin-detail{color:rgba(245,237,214,.62);font-size:13px;line-height:1.55;margin:0 0 4px}
        .admin-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
        .admin-review-box{margin-top:12px;border:1px dashed rgba(196,148,58,.28);border-radius:16px;background:rgba(196,148,58,.055);padding:12px;color:rgba(245,237,214,.68)}
        .admin-review-tags{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}.admin-review-tags span{border:1px solid rgba(196,148,58,.22);border-radius:999px;padding:5px 8px;color:rgba(232,201,122,.9);font-family:var(--font-jetbrains);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}
        .admin-empty{border:1px solid rgba(245,237,214,.1);border-radius:22px;background:rgba(245,237,214,.04);padding:22px;color:rgba(245,237,214,.62)}
        @media(max-width:680px){.admin-sightings-page{padding-left:12px;padding-right:12px}.admin-card{border-radius:20px}.admin-body{padding:14px}.admin-actions .admin-button{flex:1 1 46%;min-height:46px;padding:11px 9px}.admin-actions .admin-button.danger{flex-basis:100%}}
        @media(prefers-reduced-motion:reduce){.admin-button,.admin-card{transition:none}}
      `}</style>
      <div className="admin-wrap">
        {!embedded ? (
          <>
            <div className="admin-kicker">Admin review</div>
            <h1 className="admin-title">Sighting review</h1>
            <p className="admin-sub">Review proof photos plus manual bottles and stores. Manual entries should be added or mapped in the bottle/store data before marking catalog review done.</p>
          </>
        ) : null}
        <div className="admin-toolbar">
          <span className="admin-status">{loading ? "Loading…" : `${sightings.length} review item${sightings.length === 1 ? "" : "s"}`}</span>
          <button className="admin-button" type="button" onClick={load}><RotateCw size={14}/> Refresh</button>
        </div>
        {error ? <div className="admin-empty" role="alert" style={{ color: "#ffb4a3" }}>{error}</div> : null}
        {notice ? <div className="admin-empty" role="status" style={{ color: "#e8c97a" }}>{notice}</div> : null}
        {!loading && sightings.length === 0 ? <div className="admin-empty">No sightings are waiting for review right now.</div> : null}
        <div className="admin-grid">
          {sightings.map((sighting) => {
            const proof = sighting.rewardState?.photoProof;
            const addsCatalog = Boolean(sighting.reviewState?.needsBottleReview || sighting.reviewState?.needsStoreReview);
            return (
              <article className={`admin-card${workingId?.startsWith(`${sighting.id}:`) ? " working" : ""}`} aria-busy={workingId?.startsWith(`${sighting.id}:`) === true} key={`${sighting.reporterUserId}:${sighting.id}`}>
                {proof?.url ? <img className="admin-photo" src={proof.url} alt={`Proof for ${sighting.bottleName}`} loading="lazy" /> : null}
                <div className="admin-body">
                  <div className="admin-meta"><span className="admin-status">{statusLabel(sighting)}</span><span className="admin-time">{formatControlRoomDateTime(proof?.uploadedAt || sighting.createdAt)}</span></div>
                  <h2 className="admin-name">{sighting.bottleName}</h2>
                  <p className="admin-detail">{sighting.storeName} · {[sighting.storeCity, sighting.storeState].filter(Boolean).join(", ")}</p>
                  <p className="admin-detail">Reporter: {sighting.reporterName || "Member"} · {sighting.reporterEmail || "unknown"}</p>
                  <p className="admin-detail">Tier: {sighting.rarityTier || "limited"}</p>
                  {sighting.contributorModeration ? (
                    <div className="admin-review-box">
                      <div className="admin-review-tags"><span>Contributor restriction · {sighting.contributorModeration.restrictionKind}</span></div>
                      <p className="admin-detail">{sighting.contributorModeration.restrictionReason} · {formatControlRoomDateTime(sighting.contributorModeration.restrictedAt)}</p>
                      {sighting.contributorModeration.restoredAt ? (
                        <p className="admin-detail">Restored: {sighting.contributorModeration.restorationReason || "No restoration note"} · {formatControlRoomDateTime(sighting.contributorModeration.restoredAt)}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {sighting.reviewState?.needsBottleReview || sighting.reviewState?.needsStoreReview ? (
                    <div className="admin-review-box">
                      <div className="admin-review-tags">{(sighting.reviewReasons || []).map((reason) => <span key={reason}>{reason}</span>)}</div>
                      {sighting.reviewState?.needsBottleReview ? <p className="admin-detail">Bottle to add/map: {sighting.reviewState.manualBottleName || sighting.bottleName} · {sighting.reviewState.manualBottleRarityTier || sighting.rarityTier || "limited"}</p> : null}
                      {sighting.reviewState?.needsStoreReview ? <p className="admin-detail">Store to add/map: {sighting.reviewState.manualStoreName || sighting.storeName} · {[sighting.reviewState.manualStoreAddress, sighting.reviewState.manualStoreCity, sighting.reviewState.manualStoreState, sighting.reviewState.manualStoreZip].filter(Boolean).join(", ")}</p> : null}
                    </div>
                  ) : null}
                  <div className="admin-actions">
                    <button disabled={Boolean(workingId)} className="admin-button gold" onClick={() => act(sighting, "verify_public")}><Eye size={14}/> {workingId === `${sighting.id}:verify_public` ? "Approving…" : addsCatalog ? "Add catalog + approve" : proof ? "Approve & publish" : "Approve sighting"}</button>
                    {proof ? <button disabled={Boolean(workingId)} className="admin-button" onClick={() => act(sighting, "verify_private")}><EyeOff size={14}/> {workingId === `${sighting.id}:verify_private` ? "Approving…" : "Approve, keep photo private"}</button> : null}
                    <button disabled={Boolean(workingId)} className="admin-button danger" onClick={() => act(sighting, "reject_sighting")}><X size={14}/> {workingId === `${sighting.id}:reject_sighting` ? "Rejecting…" : "Reject sighting"}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
