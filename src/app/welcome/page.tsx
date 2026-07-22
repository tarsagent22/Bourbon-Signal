import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import styles from "./welcome.module.css";

const freeBenefits = [
  ["7 recent signals", "Preview bottles showing up across the latest Drop Feed."],
  ["3 Bottle Checks", "Look up the bottle already on your mind."],
  ["Release Radar", "See upcoming releases and what may arrive next."],
  ["Member Sightings", "Preview field reports and add your own useful sighting."],
] as const;

export default function WelcomePage() {
  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <section className={styles.panel}>
          <div className={styles.successMark} aria-hidden="true">✓</div>
          <p className={styles.eyebrow}>Free account created</p>
          <h1 className={styles.title}>Your free Bourbon Signal account is ready.</h1>
          <p className={styles.copy}>
            Start hunting now—no payment required. Your free account gives you enough signal to explore the product before deciding whether alerts and advanced tools are worth an upgrade.
          </p>

          <div className={styles.benefits} aria-label="Free account benefits">
            {freeBenefits.map(([title, description]) => (
              <article key={title} className={styles.benefit}>
                <strong>{title}</strong>
                <span>{description}</span>
              </article>
            ))}
          </div>

          <div className={styles.primaryActions}>
            <Link href="/dashboard" className={styles.primaryAction}>Continue with my free account</Link>
            <span>No card required</span>
          </div>

          <div className={styles.nextActions} aria-label="Start exploring Bourbon Signal">
            <Link href="/bottle-check">Check a bottle</Link>
            <Link href="/#drops">View recent signals</Link>
            <Link href="/release-radar">Explore Release Radar</Link>
          </div>

          <p className={styles.pricingLink}>
            Want saved alerts and the full feed later? <Link href="/pricing?source=welcome">Compare memberships</Link> whenever you are ready.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
