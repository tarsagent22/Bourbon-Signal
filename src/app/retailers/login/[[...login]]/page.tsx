"use client";

import { SignIn } from "@clerk/nextjs";
import styles from "../../retailers.module.css";

export default function RetailerLoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <a className={styles.eyebrow} href="/retailers">← Bourbon Signal for retailers</a>
        <h1>Retailer login</h1>
        <p className={styles.lede}>Manage your store profile and submit updates for Bourbon Signal review.</p>
        <div className={styles.panel}>
          <SignIn
            routing="path"
            path="/retailers/login"
            forceRedirectUrl="/retailers/portal"
            signUpForceRedirectUrl="/retailers/portal"
            signUpUrl="/retailers/register"
          />
        </div>
      </section>
    </main>
  );
}
