"use client";

import { useState } from "react";
import { CURRENT_RETAILER_TERMS_VERSION } from "@/lib/retailer-portal";
import styles from "../retailers.module.css";

export default function RetailerTermsGate({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [understood, setUnderstood] = useState(false);

  if (!understood) {
    return (
      <section className={`${styles.panel} ${styles.termsPanel}`} aria-labelledby="retailer-terms-title">
        <p className={styles.eyebrow}>Before connecting your store</p>
        <h2 id="retailer-terms-title">Retailer terms</h2>
        <p className={styles.muted}>By using the Bourbon Signal retailer portal, you confirm that:</p>
        <ul className={styles.termsList}>
          <li>You are at least 21 years old and authorized to represent the store.</li>
          <li>You are responsible for store and signal accuracy and will submit information that is accurate to the best of your knowledge.</li>
          <li>You will mark availability sold out when it changes and avoid misleading or promotional spam.</li>
          <li>Bourbon Signal may display your store name, address, and submitted signals, and may remove inaccurate content.</li>
          <li>Availability is not guaranteed, and all alcohol sales remain subject to applicable laws and store policies.</li>
        </ul>
        <button className={styles.primaryButton} type="button" onClick={() => setUnderstood(true)}>I understand</button>
        <p className={styles.finePrint}>Terms version {CURRENT_RETAILER_TERMS_VERSION}</p>
      </section>
    );
  }

  return (
    <form action={action} className={`${styles.formGrid} ${styles.panel}`}>
      <input name="termsAccepted" type="hidden" value="yes" />
      <input name="termsVersion" type="hidden" value={CURRENT_RETAILER_TERMS_VERSION} />
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
      <button className={styles.primaryButton} type="submit">Submit store for review</button>
      <p className={styles.finePrint}>Submission does not grant publishing access. Bourbon Signal verifies the store relationship using independently sourced business contact information.</p>
    </form>
  );
}
