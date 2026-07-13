"use client";

import { useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { normalizeRetailerApplication, type RetailerApplication } from "@/lib/retailer-portal";
import styles from "../../retailers.module.css";

export default function RetailerRegisterPage() {
  const [application, setApplication] = useState<RetailerApplication | null>(null);
  const [error, setError] = useState("");

  function continueToAccount(formData: FormData) {
    const result = normalizeRetailerApplication(Object.fromEntries(formData.entries()));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setApplication(result.value);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <a className={styles.eyebrow} href="/retailers">← Bourbon Signal for retailers</a>
        <h1>{application ? "Create your secure login." : "Tell us which store you represent."}</h1>
        <p className={styles.lede}>{application ? "Your store will remain pending until Bourbon Signal confirms your authority through an independently sourced business contact." : "We use this information to identify the store. It does not grant publishing access."}</p>

        <div className={styles.panel}>
          {application ? (
            <SignUp
              routing="path"
              path="/retailers/register"
              forceRedirectUrl="/retailers/portal"
              signInForceRedirectUrl="/retailers/portal"
              signInUrl="/retailers/login"
              unsafeMetadata={{ accountType: "retailer", retailerApplication: application }}
            />
          ) : (
            <form action={continueToAccount} className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="storeName">Store name</label>
                <input id="storeName" name="storeName" autoComplete="organization" required maxLength={120} />
              </div>
              <div className={styles.field}>
                <label htmlFor="storeAddress">Store address</label>
                <input id="storeAddress" name="storeAddress" autoComplete="street-address" required maxLength={240} />
              </div>
              <div className={`${styles.formGrid} ${styles.twoColumns}`}>
                <div className={styles.field}>
                  <label htmlFor="listedPhone">Publicly listed phone</label>
                  <input id="listedPhone" name="listedPhone" autoComplete="tel" required maxLength={40} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="applicantRole">Your role</label>
                  <input id="applicantRole" name="applicantRole" placeholder="Owner, manager, spirits buyer…" required maxLength={80} />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="website">Official website <span className={styles.muted}>(optional)</span></label>
                <input id="website" name="website" type="url" placeholder="https://" maxLength={240} />
              </div>
              <label className={styles.checkbox}>
                <input name="ageConfirmed" type="checkbox" required />
                <span>I confirm that I am at least 21 years old and am authorized to request access on behalf of this retailer.</span>
              </label>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <button className={styles.primaryButton} type="submit">Continue to secure account</button>
              <p className={styles.finePrint}>Creating an account does not verify the store. Bourbon Signal will contact the business using information sourced independently from this form.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
