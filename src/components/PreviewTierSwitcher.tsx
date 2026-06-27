"use client";

import { useEffect, useMemo, useState } from "react";
import { TIER_ENTITLEMENTS, type MembershipTier } from "@/lib/entitlements";
import { getQaPreviewTierFromBrowser, isQaPreviewMode, QA_PREVIEW_TIERS, setQaPreviewTier } from "@/lib/preview-qa";

const shortLabels: Record<MembershipTier, string> = {
  free: "Free",
  standard: "Standard",
  barrel: "Barrel",
  "bottled-in-bond": "BiB",
};

export default function PreviewTierSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [activeTier, setActiveTier] = useState<MembershipTier>("bottled-in-bond");

  useEffect(() => {
    setMounted(true);
    if (!isQaPreviewMode()) return;
    const tier = getQaPreviewTierFromBrowser();
    setActiveTier(tier);
    setQaPreviewTier(tier);
  }, []);

  const isPreview = mounted && isQaPreviewMode();
  const activeLabel = useMemo(() => TIER_ENTITLEMENTS[activeTier].label, [activeTier]);

  if (!isPreview) return null;

  function chooseTier(tier: MembershipTier) {
    setQaPreviewTier(tier);
    setActiveTier(tier);
    window.setTimeout(() => window.location.reload(), 80);
  }

  return (
    <aside className="qa-tier-switcher" aria-label="Preview tier switcher">
      <div className="qa-tier-copy">
        <span>Preview tier</span>
        <strong>{activeLabel}</strong>
      </div>
      <div className="qa-tier-options" role="group" aria-label="Choose preview membership tier">
        {QA_PREVIEW_TIERS.map((tier) => (
          <button key={tier} type="button" className={tier === activeTier ? "active" : ""} onClick={() => chooseTier(tier)}>
            {shortLabels[tier]}
          </button>
        ))}
      </div>
      <style jsx>{`
        .qa-tier-switcher {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 9999;
          display: grid;
          gap: 10px;
          width: min(390px, calc(100vw - 28px));
          border: 1px solid rgba(232, 201, 122, 0.32);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(24, 18, 12, 0.96), rgba(10, 8, 6, 0.97));
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(255,255,255,0.04) inset;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          padding: 12px;
        }
        .qa-tier-copy {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 0 2px;
          color: rgba(245,237,214,0.72);
          font-family: var(--font-dm-sans);
          font-size: 12px;
        }
        .qa-tier-copy span {
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(232, 201, 122, 0.74);
        }
        .qa-tier-copy strong {
          color: var(--color-text-primary);
          font-weight: 800;
        }
        .qa-tier-options {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          border-radius: 13px;
          background: rgba(255,255,255,0.045);
          padding: 5px;
        }
        .qa-tier-options button {
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          color: rgba(245,237,214,0.66);
          cursor: pointer;
          font-family: var(--font-jetbrains);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.06em;
          padding: 10px 6px;
          text-transform: uppercase;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .qa-tier-options button:hover {
          color: var(--color-text-primary);
          background: rgba(232, 201, 122, 0.08);
        }
        .qa-tier-options button.active {
          border-color: rgba(232, 201, 122, 0.48);
          background: linear-gradient(180deg, rgba(232, 201, 122, 0.22), rgba(196, 148, 58, 0.14));
          color: var(--color-text-primary);
          box-shadow: 0 8px 22px rgba(0,0,0,0.28);
        }
        @media (max-width: 640px) {
          .qa-tier-switcher {
            left: 14px;
            right: 14px;
            bottom: 12px;
            width: auto;
          }
          .qa-tier-options button {
            font-size: 9px;
            padding: 9px 4px;
          }
        }
      `}</style>
    </aside>
  );
}
