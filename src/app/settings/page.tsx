"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import MemberShippingProfile from "@/components/MemberShippingProfile";
import { useAuth } from "@/lib/auth";
import styles from "./settings.module.css";

const MEMBERSHIP_LABELS: Record<string, string> = {
  free: "Free",
  standard: "Standard Proof",
  barrel: "Barrel Proof",
  "bottled-in-bond": "Bottled in Bond Founder",
};

function SettingsPageContent() {
  const { user, signOut, memberTier, memberNumber, entitlements } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [billingPending, setBillingPending] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
  }, [user?.firstName, user?.lastName]);

  const userEmail =
    user?.emailAddresses?.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress || "";
  const isPaid = memberTier !== "free";
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

  async function openBillingPortal() {
    if (billingPending) return;
    setBillingPending(true);
    try {
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
          {isPaid ? <a href="#shipping">Shipping</a> : null}
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
              <button className={styles.secondaryButton} type="button" onClick={() => void openBillingPortal()} disabled={billingPending}>
                {billingPending ? "Opening billing…" : "Manage billing"}
              </button>
            ) : <a className={styles.secondaryLink} href="/pricing">View membership options</a>}
          </div>
        </section>

        {isPaid ? <MemberShippingProfile /> : null}

        <section id="communications" className={styles.card} aria-labelledby="communications-heading">
          <div className={styles.cardHeading}>
            <div><p>Alerts and updates</p><h2 id="communications-heading">Notifications and communication</h2></div>
          </div>
          <p className={styles.cardCopy}>{entitlements.canAccessDashboard
            ? "Manage on-site, email, weekly intelligence, SMS, and eligible member-sighting alert preferences from your alert setup."
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

export default function SettingsPage() {
  return <><Navigation /><SettingsPageContent /><Footer /></>;
}
