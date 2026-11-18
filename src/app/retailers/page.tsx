import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import styles from "./retailers.module.css";

export const metadata: Metadata = {
  title: "Retailers",
  description: "Publish bourbon drops, store picks, and tastings to nearby Bourbon Signal members.",
};

export default function RetailersPage() {
  return (
    <div className={styles.page}>
      <Navigation />
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Bourbon Signal for retailers</p>
            <h1>Put your best bottles in front of nearby buyers.</h1>
          </div>
          <div>
            <p className={styles.lede}>Share noteworthy arrivals, private barrel picks, tastings, and lotteries through one direct channel built for serious bourbon customers.</p>
            <div className={styles.actions}>
              <a className={styles.primaryButton} href="/retailers/register">Create retailer account</a>
              <a className={styles.secondaryButton} href="/retailers/login">Retailer login</a>
            </div>
          </div>
        </section>

        <section className={styles.features} aria-label="Retailer portal benefits">
          <article className={styles.feature}>
            <span className={styles.featureNumber}>01 / PUBLISH</span>
            <h2>Send the signal</h2>
            <p>Submit a bottle drop, store pick, tasting, or lottery without installing software or connecting your point of sale.</p>
          </article>
          <article className={styles.feature}>
            <span className={styles.featureNumber}>02 / CONTROL</span>
            <h2>Keep it current</h2>
            <p>Set the location, price, availability notes, and expiration so customers receive useful information—not stale promotion.</p>
          </article>
          <article className={styles.feature}>
            <span className={styles.featureNumber}>03 / REACH</span>
            <h2>Reach local hunters</h2>
            <p>Retailer signals are published to the feed instantly or at set time.</p>
          </article>
        </section>
      </main>
      <Footer />
    </div>
  );
}
