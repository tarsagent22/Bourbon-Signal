import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import SettingsPageClient from "./SettingsPageClient";
import styles from "./settings.module.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  let ownerPreview = null;
  if (userId) {
    ownerPreview = (
      <section id="signal-points-preview" className={styles.card} aria-labelledby="signal-points-preview-heading">
        <div className={styles.cardHeading}>
          <div><p>Member rewards</p><h2 id="signal-points-preview-heading">Signal Points</h2></div>
          <span>Earn points free · redeem with paid membership</span>
        </div>
        <p className={styles.cardCopy}>Review your current balance, earning history, and the available redemption catalog.</p>
        <Link className={styles.secondaryLink} href="/account/signal-points">Open Signal Points</Link>
      </section>
    );
  }
  return <SettingsPageClient ownerPreview={ownerPreview} />;
}
