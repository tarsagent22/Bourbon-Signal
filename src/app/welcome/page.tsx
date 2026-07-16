import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import styles from "./welcome.module.css";

export default function WelcomePage() {
  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Free member access</p>
          <h1 className={styles.title}>Start where the signal is useful.</h1>
          <p className={styles.copy}>
            Browse live availability, what is coming next, or check the bottle already on your mind. Membership is there when you are ready to act on a signal.
          </p>
          <div className={styles.actions}>
            <Link href="/drops" className={styles.action}>See bottles showing up now</Link>
            <Link href="/release-radar" className={styles.action}>See what is coming</Link>
            <Link href="/bottle-check" className={styles.action}>Check a bottle</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
