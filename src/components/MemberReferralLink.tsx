"use client";

import { useEffect, useState } from "react";

type ReferralLinkPayload = {
  referralLink: string;
};

type MemberReferralLinkProps = {
  compact?: boolean;
};

export default function MemberReferralLink({ compact = false }: MemberReferralLinkProps) {
  const [referralLink, setReferralLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/referrals/me", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as Partial<ReferralLinkPayload> & { error?: string };
        if (!response.ok || !payload.referralLink) throw new Error(payload.error || "Referral link unavailable");
        if (active) setReferralLink(payload.referralLink);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Referral link unavailable");
      });
    return () => { active = false; };
  }, []);

  async function copyReferralLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy was blocked. Select the link and copy it manually.");
    }
  }

  return (
    <div className={`member-referral-link${compact ? " compact" : ""}`}>
      <div className="member-referral-copy">
        <strong>Your referral link</strong>
        <span>Share Bourbon Signal with friends using your personal link.</span>
      </div>
      {referralLink ? (
        <div className="member-referral-action">
          <input aria-label="Your referral link" value={referralLink} readOnly onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={() => void copyReferralLink()}>{copied ? "Copied" : "Copy link"}</button>
        </div>
      ) : null}
      {error ? <small role="status">{error}</small> : !referralLink ? <small>Loading your link…</small> : null}
      <style jsx>{`
        .member-referral-link { display: grid; gap: 14px; padding: 18px; border: 1px solid rgba(196,148,58,.22); border-radius: 14px; background: rgba(196,148,58,.055); }
        .member-referral-link.compact { margin-top: 16px; }
        .member-referral-copy { display: grid; gap: 6px; }
        .member-referral-copy strong { color: var(--color-cream); font: 700 17px/1.2 var(--font-playfair); }
        .member-referral-copy span, small { color: var(--color-text-tertiary); font: 12px/1.55 var(--font-dm-sans); }
        .member-referral-action { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .member-referral-action > input { flex: 1; min-width: 0; min-height: 38px; padding: 0 10px; border: 1px solid rgba(245,237,214,.1); border-radius: 8px; background: rgba(0,0,0,.16); color: var(--color-text-secondary); font: 12px/1.4 var(--font-jetbrains); }
        button { flex: 0 0 auto; min-height: 38px; padding: 0 14px; border: 1px solid rgba(212,146,11,.32); border-radius: 8px; background: rgba(212,146,11,.12); color: #e5c77f; font: 800 12px/1 var(--font-dm-sans); cursor: pointer; }
        @media (max-width: 620px) { .member-referral-action { align-items: stretch; flex-direction: column; } button { width: 100%; } }
      `}</style>
    </div>
  );
}
