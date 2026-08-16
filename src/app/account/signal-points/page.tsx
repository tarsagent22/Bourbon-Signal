import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SignalPointsPanel from "@/components/SignalPointsPanel";
import { requireOwnerPageAccess } from "@/lib/owner-auth";
import styles from "./signal-points.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OwnerSignalPointsPage() {
  await requireOwnerPageAccess("/account/signal-points");
  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <div className={styles.frame}>
          <header className={styles.header}>
            <div>
              <p>Private account preview</p>
              <h1>Signal Points</h1>
              <span>The latest earning and redemption experience, visible only to your owner account.</span>
            </div>
            <Link href="/settings">Back to account</Link>
          </header>
          <SignalPointsPanel preview />
        </div>
      </main>
      <Footer />
    </>
  );
}
