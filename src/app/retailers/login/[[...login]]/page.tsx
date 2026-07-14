"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { safeRetailerRedirect } from "@/lib/retailer-portal";
import styles from "../../retailers.module.css";

export default function RetailerLoginPage() {
  const searchParams = useSearchParams();
  const destination = safeRetailerRedirect(searchParams.get("redirect_url"));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <a className={styles.eyebrow} href="/retailers">← Bourbon Signal for retailers</a>
        <h1>Retailer login</h1>
        <p className={styles.lede}>Submit signals to Bourbon Signal and manage your store profile.</p>
        <div className={styles.authPanel}>
          <SignIn
            appearance={{ elements: { headerSubtitle: { marginTop: "12px" } } }}
            routing="path"
            path="/retailers/login"
            forceRedirectUrl={destination}
            signUpForceRedirectUrl="/retailers/onboarding"
            signUpUrl="/retailers/register"
          />
        </div>
      </section>
    </main>
  );
}
