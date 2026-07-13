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
        <p className={styles.lede}>Manage your store profile and submit updates for Bourbon Signal review.</p>
        <div className={`${styles.panel} ${styles.authPanel}`}>
          <SignIn
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
