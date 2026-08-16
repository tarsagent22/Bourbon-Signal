import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import SettingsPageClient from "./SettingsPageClient";
import styles from "./settings.module.css";
import { verifiedPrimaryClerkEmail } from "@/lib/owner-auth";
import { isRewardsAdminEmail } from "@/lib/sighting-rewards";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  let ownerPreview = null;
  if (userId) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (isRewardsAdminEmail(verifiedPrimaryClerkEmail(user))) {
      ownerPreview = (
        <section id="signal-points-preview" className={styles.card} aria-labelledby="signal-points-preview-heading">
          <div className={styles.cardHeading}>
            <div><p>Private account preview</p><h2 id="signal-points-preview-heading">Signal Points</h2></div>
            <span>Visible only to the owner account</span>
          </div>
          <p className={styles.cardCopy}>Review your current balance, earning history, and the latest redemption catalog iteration.</p>
          <Link className={styles.secondaryLink} href="/account/signal-points">Open Signal Points</Link>
        </section>
      );
    }
  }
  return <SettingsPageClient ownerPreview={ownerPreview} />;
}
