"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import styles from "../../retailers.module.css";

export default function RetailerRegisterPage() {
  const searchParams = useSearchParams();
  const verificationRequired = searchParams.get("error") === "verified-email-required";
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const showAccount = ageConfirmed;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <a className={styles.eyebrow} href="/retailers">← Bourbon Signal for retailers</a>
        <h1>Create your secure login.</h1>
        <p className={styles.lede}>Verify your email first. Then you’ll connect the account to your store and submit it for review.</p>

        {verificationRequired ? <p className={styles.error} role="alert">Complete the email verification step before connecting your store.</p> : null}
        <div className={`${styles.panel} ${showAccount ? styles.authPanel : ""}`}>
          {showAccount ? (
            <SignUp
              routing="path"
              path="/retailers/register"
              forceRedirectUrl="/retailers/onboarding"
              signInForceRedirectUrl="/retailers/portal"
              signInUrl="/retailers/login"
              unsafeMetadata={{ accountType: "retailer" }}
            />
          ) : (
            <form
              className={styles.formGrid}
              onSubmit={(event) => {
                event.preventDefault();
                setAgeConfirmed(true);
              }}
            >
              <label className={styles.checkbox}>
                <input name="ageConfirmed" type="checkbox" required />
                <span>I confirm that I am at least 21 years old and am authorized to request access on behalf of a retailer.</span>
              </label>
              <button className={styles.primaryButton} type="submit">Continue to secure account</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
