import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SignalPointsPanel from "@/components/SignalPointsPanel";
import { requireSignalPointsPageAccess } from "@/lib/owner-auth";
import styles from "./signal-points.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignalPointsPreviewPage() {
  await requireSignalPointsPageAccess("/account/signal-points");
  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <div className={styles.frame}>
          <header className={styles.header}>
            <div>
              <p>Member rewards</p>
              <h1>Signal Points</h1>
              <span>Track your balance, earning history, badges, and available rewards.</span>
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
