"use client";

import { useEffect, useState, type ReactNode } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import MemberShippingProfile from "@/components/MemberShippingProfile";
import MemberReferralLink from "@/components/MemberReferralLink";
import { useAuth } from "@/lib/auth";
import styles from "./settings.module.css";

const MEMBERSHIP_LABELS: Record<string, string> = {
  free: "Free",
  standard: "Standard Proof",
  barrel: "Barrel Proof",
  "bottled-in-bond": "Bottled in Bond Founder",
};

function SettingsPageContent({ ownerPreview }: { ownerPreview?: ReactNode }) {
  const { user, signOut, memberTier, memberNumber, entitlements } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [billingPending, setBillingPending] = useState(false);
  const [billingHelpOpen, setBillingHelpOpen] = useState(false);
  const [retentionReason, setRetentionReason] = useState("");
  const [retentionDetails, setRetentionDetails] = useState("");
  const [retentionMessage, setRetentionMessage] = useState("");
  const [hasReferralGlass, setHasReferralGlass] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/referrals/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setHasReferralGlass(Number(payload?.founderGlassesEarned || 0) > 0))
      .catch(() => undefined);
  }, [user]);

  const userEmail =
    user?.emailAddresses?.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress || "";
  const isPaid = memberTier !== "free";
  const canSaveShipping = isPaid || hasReferralGlass;
  const membershipLabel = MEMBERSHIP_LABELS[memberTier] || "Bourbon Signal member";
  const founderNumber = memberNumber ? `#${String(memberNumber).padStart(3, "0")}` : null;

  async function savePersonalInformation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || profileSaving) return;
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      setProfileMessage("Personal information saved.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Personal information could not be saved.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveRetentionFeedback(nextStep: "manage_alerts" | "lower_cost_plan" | "billing_portal" | "stay") {
    if (!retentionReason) return;
    const response = await fetch("/api/member-retention/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: retentionReason, details: retentionDetails, nextStep }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "Your feedback could not be saved.");
    }
  }

  async function openBillingPortal(nextStep: "lower_cost_plan" | "billing_portal") {
    if (billingPending) return;
    setBillingPending(true);
    setRetentionMessage("");
    try {
      try {
        await saveRetentionFeedback(nextStep);
      } catch {
        // Optional feedback must never block access to plan changes or cancellation.
      }
      const response = await fetch("/api/billing-portal", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Billing portal is unavailable.");
      window.location.href = payload.url;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Billing portal is unavailable.");
      setBillingPending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Your Bourbon Signal profile</p>
          <h1>Manage account</h1>
          <p>Personal details, membership, shipping, communications, and account access in one place.</p>
        </header>

        <nav className={styles.sectionNav} aria-label="Account sections">
          <a href="#personal">Personal</a>
          <a href="#membership">Membership</a>
          <a href="#referrals">Referral link</a>
          {canSaveShipping ? <a href="#shipping">Shipping</a> : null}
          <a href="#communications">Communications</a>
          <a href="#security">Security</a>
        </nav>

        <section id="personal" className={styles.card} aria-labelledby="personal-heading">
          <div className={styles.cardHeading}>
            <div><p>Profile</p><h2 id="personal-heading">Personal information</h2></div>
            <span>Used across your member account</span>
          </div>
          <form className={styles.profileForm} onSubmit={savePersonalInformation}>
            <label><span>First name</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={80} /></label>
            <label><span>Last name</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={80} /></label>
            <label className={styles.full}><span>Email address</span><input value={userEmail} readOnly aria-readonly="true" /></label>
            <p className={styles.fieldNote}>Your verified email is used for sign-in, account notices, and enabled Bourbon Signal communications.</p>
            {profileMessage ? <p className={styles.success} role="status">{profileMessage}</p> : null}
            {profileError ? <p className={styles.error} role="alert">{profileError}</p> : null}
            <button className={styles.primaryButton} type="submit" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save personal information"}</button>
          </form>
        </section>

        <section id="membership" className={styles.card} aria-labelledby="membership-heading">
          <div className={styles.cardHeading}>
            <div><p>Plan and billing</p><h2 id="membership-heading">Membership</h2></div>
            <span>{membershipLabel}</span>
          </div>
          <div className={styles.membershipRow}>
            <div>
              <strong>{membershipLabel}</strong>
              {founderNumber ? <span>Founder {founderNumber}</span> : <span>{isPaid ? "Paid membership" : "Free membership"}</span>}
            </div>
            {isPaid ? (
              <button className={styles.secondaryButton} type="button" onClick={() => setBillingHelpOpen((open) => !open)} aria-expanded={billingHelpOpen} aria-controls="billing-help">
                Manage billing
              </button>
            ) : <a className={styles.secondaryLink} href="/pricing">View membership options</a>}
          </div>
          {isPaid && billingHelpOpen ? (
            <div id="billing-help" className={styles.billingHelp}>
              <div>
                <p className={styles.billingEyebrow}>Before you change your plan</p>
                <h3>What would make your membership more useful?</h3>
                <p>This is optional. Your answer helps us improve paid-member value and does not change your membership by itself.</p>
              </div>
              <fieldset>
                <legend>Choose the closest reason</legend>
                {[
                  ["too_few_alerts", "Too few relevant alerts"],
                  ["local_coverage", "Not enough coverage near me"],
                  ["price", "The price is not working for me"],
                  ["temporary_break", "I only need a temporary break"],
                  ["technical_issue", "Something did not work as expected"],
                  ["other", "Something else"],
                ].map(([value, label]) => (
                  <label key={value}><input type="radio" name="retention-reason" value={value} checked={retentionReason === value} onChange={(event) => setRetentionReason(event.target.value)} /><span>{label}</span></label>
                ))}
              </fieldset>
              <label className={styles.retentionDetails}><span>Anything else? <small>Optional</small></span><textarea value={retentionDetails} onChange={(event) => setRetentionDetails(event.target.value)} maxLength={500} rows={3} /></label>
              {retentionMessage ? <p className={styles.error} role="alert">{retentionMessage}</p> : null}
              <div className={styles.billingChoices}>
                <a className={styles.primaryButton} href="/dashboard?section=alerts" onClick={(event) => {
                  if (!retentionReason) return;
                  event.preventDefault();
                  void saveRetentionFeedback("manage_alerts")
                    .then(() => { window.location.href = "/dashboard?section=alerts"; })
                    .catch((error) => setRetentionMessage(error instanceof Error ? error.message : "Your feedback could not be saved."));
                }}>Improve my alerts</a>
                <button className={styles.secondaryButton} type="button" onClick={() => void openBillingPortal("lower_cost_plan")} disabled={billingPending}>{billingPending ? "Opening billing…" : "Review a lower-cost plan"}</button>
                <button className={styles.billingTextButton} type="button" onClick={() => void openBillingPortal("billing_portal")} disabled={billingPending}>Continue to billing</button>
              </div>
              <p className={styles.billingNote}>Stripe handles plan changes and cancellation securely. Cancellation stops the next renewal; paid access continues through the current billing period.</p>
            </div>
          ) : null}
        </section>

        <section id="referrals" className={styles.card} aria-labelledby="referrals-heading">
          <div className={styles.cardHeading}>
            <div><p>Share Bourbon Signal</p><h2 id="referrals-heading">Referral link</h2></div>
          </div>
          <MemberReferralLink />
        </section>

        {ownerPreview}

        {canSaveShipping ? <MemberShippingProfile /> : null}

        <section id="communications" className={styles.card} aria-labelledby="communications-heading">
          <div className={styles.cardHeading}>
            <div><p>Alerts and updates</p><h2 id="communications-heading">Notifications and communication</h2></div>
          </div>
          <p className={styles.cardCopy}>{entitlements.canAccessDashboard
            ? "Manage on-site, email, SMS, and eligible member-sighting alert preferences from your alert setup."
            : "Your current membership does not include configurable alert delivery. Email preference links remain available in eligible Bourbon Signal messages."}</p>
          {entitlements.canAccessDashboard ? <a className={styles.secondaryLink} href="/dashboard?section=alerts">Manage notification preferences</a> : null}
        </section>

        <section id="security" className={styles.card} aria-labelledby="security-heading">
          <div className={styles.cardHeading}>
            <div><p>Account access</p><h2 id="security-heading">Security and account actions</h2></div>
          </div>
          <div className={styles.securityRow}>
            <div><span>Signed in as</span><strong>{userEmail}</strong></div>
            <button className={styles.secondaryButton} type="button" onClick={() => signOut()}>Sign out</button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SettingsPageClient({ ownerPreview }: { ownerPreview?: ReactNode }) {
  return <><Navigation /><SettingsPageContent ownerPreview={ownerPreview} /><Footer /></>;
}
