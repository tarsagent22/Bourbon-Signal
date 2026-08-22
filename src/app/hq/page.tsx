"use client";

import Link from "next/link";
import { ArrowRight, BellRing, LifeBuoy, Radar, Settings, Users, Wine } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SignalPointsPanel from "@/components/SignalPointsPanel";
import { useAuth } from "@/lib/auth";
import { useSightings } from "@/hooks/useSightings";
import {
  signalPointsBadgeBaseKey,
  signalPointsBadgeDescription,
  signalPointsBadgeIcon,
  signalPointsBadgeLabel,
} from "@/lib/signal-points-badge-presentation";

const HQ_LINKS = [
  {
    href: "/dashboard?section=alerts",
    label: "Radar",
    detail: "Saved markets, watched bottles, alert rules, and recent matches.",
    icon: Radar,
  },
  {
    href: "/dashboard?section=collection",
    label: "Cellar",
    detail: "Bottles you own or have tasted, plus recommendations shaped by your ratings.",
    icon: Wine,
  },
  {
    href: "/referrals",
    label: "Referrals",
    detail: "Share Bourbon Signal and review referral activity.",
    icon: Users,
  },
  {
    href: "/alerts",
    label: "Alert inbox",
    detail: "Review new matches and archived member notifications.",
    icon: BellRing,
  },
  {
    href: "/settings",
    label: "Account & membership",
    detail: "Membership, contact information, delivery details, and preferences.",
    icon: Settings,
  },
  {
    href: "/support",
    label: "Support",
    detail: "Get help, review account-deletion steps, or contact Bourbon Signal.",
    icon: LifeBuoy,
  },
];

function membershipLabel(tier: string) {
  if (tier === "bottled-in-bond") return "Founder";
  if (tier === "barrel") return "Barrel member";
  if (tier === "standard") return "Standard member";
  return "Free member";
}

export default function HqPage() {
  const { isLoaded, isSignedIn, signIn, user, memberTier, memberNumber } = useAuth();
  const {
    rewards,
    loading: rewardsLoading,
    error: rewardsError,
    refresh: refreshRewards,
  } = useSightings(isLoaded && isSignedIn, { includePreferences: false, includeRewards: true, feedLimit: 1 });
  const displayName = user?.firstName || "Member";
  const identityLabel = memberTier === "bottled-in-bond" ? "Founder" : "Member";
  const publicIdentity = memberNumber > 0 ? `${identityLabel} #${memberNumber}` : identityLabel;

  return (
    <div className="hq-page">
      <Navigation />
      <main className="hq-main">
        {!isLoaded ? (
          <section className="hq-status" aria-live="polite">
            <span>Loading HQ…</span>
          </section>
        ) : !isSignedIn ? (
          <section className="hq-sign-in" aria-labelledby="hq-sign-in-title">
            <span className="hq-eyebrow">Member access</span>
            <h1 id="hq-sign-in-title">Your HQ starts after sign in.</h1>
            <p>Sign in to reach Signal Points, referrals, membership details, settings, and support.</p>
            <button type="button" onClick={signIn}>Sign in</button>
          </section>
        ) : (
          <div className="hq-shell">
            <header className="hq-hero">
              <div className="hq-hero-copy">
                <span className="hq-eyebrow">Member command center</span>
                <h1>HQ</h1>
                <p>Your membership, contributions, rewards, and account essentials in one quiet place.</p>
              </div>
              <section className="hq-member-card" aria-label="Membership identity">
                <span className="hq-card-brand">Bourbon Signal</span>
                <strong>{publicIdentity}</strong>
                <div>
                  <span>{displayName}</span>
                  <span>{membershipLabel(memberTier)}</span>
                </div>
              </section>
            </header>

            <nav className="hq-links" aria-label="HQ destinations">
              {HQ_LINKS.map(({ href, label, detail, icon: Icon }) => (
                <Link href={href} key={href} className="hq-link">
                  <span className="hq-link-icon" aria-hidden><Icon size={18} /></span>
                  <span className="hq-link-copy">
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </span>
                  <ArrowRight className="hq-link-arrow" size={17} aria-hidden />
                </Link>
              ))}
            </nav>

            {memberTier === "free" ? (
              <aside className="hq-membership-note">
                <div>
                  <span className="hq-eyebrow">Membership</span>
                  <strong>Keep contributing for free, or unlock the full intelligence feed and alerts.</strong>
                </div>
                <Link href="/pricing?source=hq">Compare memberships <ArrowRight size={15} aria-hidden /></Link>
              </aside>
            ) : null}

            <section id="signal-points" className="hq-points" aria-labelledby="hq-points-title">
              <header>
                <span className="hq-eyebrow">Contributions and rewards</span>
                <h2 id="hq-points-title">Signal Points</h2>
              </header>
              <SignalPointsPanel
                preview
                rewards={rewards}
                rewardsLoading={rewardsLoading}
                rewardsError={rewardsError}
                onRetryRewards={() => void refreshRewards()}
                badgeIconFor={signalPointsBadgeIcon}
                badgeLabelFor={signalPointsBadgeLabel}
                badgeDescriptionFor={signalPointsBadgeDescription}
                badgeBaseKey={signalPointsBadgeBaseKey}
              />
            </section>
          </div>
        )}
      </main>
      <Footer />

      <style jsx global>{`
        .hq-page { min-height: 100vh; background: var(--color-bg-primary); }
        .hq-main { min-height: 78vh; padding: 104px 18px 72px; color: var(--color-cream); }
        .hq-shell { width: min(980px, 100%); margin: 0 auto; display: grid; gap: 22px; }
        .hq-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); align-items: end; gap: clamp(24px, 5vw, 64px); padding: 24px 0 12px; }
        .hq-hero-copy { display: grid; gap: 10px; }
        .hq-eyebrow { font-family: var(--font-jetbrains); font-size: 9px; font-weight: 850; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(232,201,122,0.72); }
        .hq-hero h1 { margin: 0; font-family: var(--font-playfair); font-size: clamp(54px, 9vw, 92px); line-height: 0.92; letter-spacing: -0.04em; color: var(--color-cream); }
        .hq-hero p { max-width: 48ch; margin: 0; font-family: var(--font-dm-sans); font-size: 14px; line-height: 1.65; color: var(--color-text-secondary); }
        .hq-member-card { min-height: 182px; display: grid; align-content: space-between; border: 1px solid rgba(232,201,122,0.24); border-radius: 20px; background: linear-gradient(145deg, rgba(31,23,15,0.96), rgba(12,10,8,0.98)); box-shadow: 0 20px 52px rgba(0,0,0,0.24), inset 0 1px 0 rgba(245,237,214,0.04); padding: 21px; }
        .hq-card-brand { font-family: var(--font-jetbrains); font-size: 9px; font-weight: 850; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(232,201,122,0.68); }
        .hq-member-card strong { font-family: var(--font-playfair); font-size: clamp(27px, 4vw, 36px); line-height: 1; color: var(--color-cream); }
        .hq-member-card div { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid rgba(245,237,214,0.08); padding-top: 12px; font-family: var(--font-dm-sans); font-size: 11px; color: var(--color-text-tertiary); }
        .hq-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid rgba(245,237,214,0.09); }
        .hq-link { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; border-bottom: 1px solid rgba(245,237,214,0.09); color: inherit; padding: 17px 4px; text-decoration: none; transition: border-color 180ms ease, background 180ms ease; }
        .hq-link:nth-child(odd) { padding-right: 18px; }
        .hq-link:nth-child(even) { border-left: 1px solid rgba(245,237,214,0.09); padding-left: 18px; }
        .hq-link:hover { border-bottom-color: rgba(232,201,122,0.42); background: rgba(245,237,214,0.018); }
        .hq-link:focus-visible { outline: 2px solid var(--color-accent-amber); outline-offset: 3px; }
        .hq-link-icon { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(232,201,122,0.18); border-radius: 10px; color: rgba(232,201,122,0.82); }
        .hq-link-copy { min-width: 0; display: grid; gap: 4px; }
        .hq-link-copy strong { font-family: var(--font-dm-sans); font-size: 13px; color: var(--color-cream); }
        .hq-link-copy > span { font-family: var(--font-dm-sans); font-size: 11px; line-height: 1.45; color: var(--color-text-tertiary); }
        .hq-link-arrow { color: rgba(232,201,122,0.52); }
        .hq-membership-note { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-left: 2px solid rgba(196,148,58,0.58); background: rgba(196,148,58,0.06); padding: 15px 17px; }
        .hq-membership-note > div { display: grid; gap: 5px; }
        .hq-membership-note strong { font-family: var(--font-dm-sans); font-size: 13px; line-height: 1.45; color: var(--color-cream); }
        .hq-membership-note a { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; color: var(--color-accent-amber); font-family: var(--font-dm-sans); font-size: 12px; font-weight: 850; text-decoration: none; }
        .hq-points { display: grid; gap: 14px; padding-top: 14px; scroll-margin-top: 96px; }
        .hq-points > header { display: grid; gap: 6px; padding: 0 2px; }
        .hq-points h2 { margin: 0; font-family: var(--font-playfair); font-size: clamp(30px, 4vw, 42px); color: var(--color-cream); }
        .hq-status, .hq-sign-in { width: min(680px, 100%); min-height: 340px; margin: 0 auto; display: grid; place-content: center; justify-items: start; gap: 14px; }
        .hq-status span { color: var(--color-text-secondary); }
        .hq-sign-in h1 { max-width: 12ch; margin: 0; font-family: var(--font-playfair); font-size: clamp(42px, 7vw, 68px); line-height: 1; }
        .hq-sign-in p { max-width: 48ch; margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
        .hq-sign-in button { border: 1px solid rgba(232,201,122,0.42); border-radius: 999px; background: rgba(196,148,58,0.14); color: var(--color-accent-amber); padding: 11px 17px; font-weight: 850; cursor: pointer; }
        @media (max-width: 760px) {
          .hq-main { padding: 88px 14px 48px; }
          .hq-hero { grid-template-columns: 1fr; align-items: stretch; gap: 20px; }
          .hq-member-card { min-height: 160px; }
          .hq-links { grid-template-columns: 1fr; }
          .hq-link:nth-child(odd), .hq-link:nth-child(even) { border-left: 0; padding: 15px 3px; }
          .hq-membership-note { align-items: flex-start; flex-direction: column; gap: 12px; }
        }
      `}</style>
    </div>
  );
}
