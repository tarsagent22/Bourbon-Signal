import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyRetailerAccountCreated } from "@/lib/retailer-notifications";
import { getRetailerRepository, type RetailerApplicationRecord } from "@/lib/retailer-repository";
import {
  normalizeRetailerApplication,
  normalizeRetailerSubmission,
} from "@/lib/retailer-portal";
import styles from "../retailers.module.css";

export const dynamic = "force-dynamic";

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  const primary = emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0];
  return primary?.emailAddress?.trim().toLowerCase() || "";
}

async function sendApplicationNotification(application: RetailerApplicationRecord) {
  const notification = await notifyRetailerAccountCreated({
    userId: application.userId,
    email: application.email,
    firstName: application.firstName,
    application,
  });
  await getRetailerRepository().markNotificationSent(application.userId, notification.messageId);
}

async function applyForRetailerAccess(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login");
  const normalized = normalizeRetailerApplication(Object.fromEntries(formData.entries()));
  if (!normalized.ok) redirect(`/retailers/portal?error=${encodeURIComponent(normalized.error)}`);

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = primaryEmail(user);
  if (!email) redirect("/retailers/portal?error=Verified%20account%20email%20required");

  const application = await getRetailerRepository().upsertPendingApplication({
    userId,
    email,
    firstName: user.firstName,
    application: normalized.value,
  });
  try {
    await sendApplicationNotification(application);
  } catch {
    revalidatePath("/retailers/portal");
    redirect("/retailers/portal?applied=1&notification=pending");
  }
  revalidatePath("/retailers/portal");
  redirect("/retailers/portal?applied=1");
}

async function retryRetailerNotification() {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login");
  const application = await getRetailerRepository().getApplication(userId);
  if (!application) redirect("/retailers/portal?error=Retailer%20application%20not%20found");
  if (!application.notificationSentAt) await sendApplicationNotification(application);
  revalidatePath("/retailers/portal");
  redirect("/retailers/portal?notified=1");
}

async function submitRetailerUpdate(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login");
  const repository = getRetailerRepository();
  const application = await repository.getApplication(userId);
  if (application?.status !== "verified") redirect("/retailers/portal?error=Retailer%20verification%20required");

  const normalized = normalizeRetailerSubmission(Object.fromEntries(formData.entries()));
  if (!normalized.ok) redirect(`/retailers/portal?error=${encodeURIComponent(normalized.error)}`);
  const created = await repository.createSubmission({
    id: randomUUID(),
    userId,
    submission: normalized.value,
  });
  if (!created) redirect("/retailers/portal?error=Retailer%20verification%20required");
  revalidatePath("/retailers/portal");
  redirect("/retailers/portal?submitted=1");
}

export default async function RetailerPortalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login");
  const params = await searchParams;
  const repository = getRetailerRepository();
  const [application, submissions] = await Promise.all([
    repository.getApplication(userId),
    repository.listSubmissions(userId),
  ]);
  const retailerStatus = application?.status || "not_started";
  const storeName = application?.storeName || "Your store";
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.portalHeader}>
          <div>
            <p className={styles.eyebrow}>Retailer portal</p>
            <h1>{storeName}</h1>
          </div>
          <div className={styles.actions}>
            <a className={styles.secondaryButton} href="/">View Bourbon Signal</a>
          </div>
        </header>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {params.applied === "1" ? <p className={styles.notice}>Application received. We’ll verify your relationship with the store before enabling submissions.</p> : null}
        {params.notification === "pending" ? <p className={styles.error} role="alert">Your application is saved, but the review notification needs to be retried below.</p> : null}
        {params.notified === "1" ? <p className={styles.notice}>The review team has been notified.</p> : null}
        {params.submitted === "1" ? <p className={styles.notice}>Update submitted for Bourbon Signal review.</p> : null}

        {retailerStatus === "not_started" ? (
          <section className={styles.statusPanel}>
            <p className={styles.eyebrow}>Store access request</p>
            <h2>Connect this account to your store.</h2>
            <p className={styles.muted}>Access remains locked until Bourbon Signal verifies you through a business contact found independently.</p>
            <form action={applyForRetailerAccess} className={`${styles.formGrid} ${styles.panel}`}>
              <div className={styles.field}><label htmlFor="storeName">Store name</label><input id="storeName" name="storeName" required maxLength={120} /></div>
              <div className={styles.field}><label htmlFor="storeAddress">Store address</label><input id="storeAddress" name="storeAddress" required maxLength={240} /></div>
              <div className={`${styles.formGrid} ${styles.twoColumns}`}>
                <div className={styles.field}><label htmlFor="listedPhone">Publicly listed phone</label><input id="listedPhone" name="listedPhone" required maxLength={40} /></div>
                <div className={styles.field}><label htmlFor="applicantRole">Your role</label><input id="applicantRole" name="applicantRole" required maxLength={80} /></div>
              </div>
              <div className={styles.field}><label htmlFor="website">Official website</label><input id="website" name="website" type="url" maxLength={240} /></div>
              <button className={styles.primaryButton} type="submit">Request retailer access</button>
            </form>
          </section>
        ) : retailerStatus === "pending" ? (
          <section className={styles.statusPanel}>
            <div className={styles.statusLine}><span className={styles.status}>Verification pending</span><strong>{storeName}</strong></div>
            <h2>We’re confirming your connection to the store.</h2>
            <p className={styles.muted}>Bourbon Signal will contact the business using a phone number or email found independently—not solely the information supplied during registration.</p>
            {!application?.notificationSentAt ? <form action={retryRetailerNotification}><button className={styles.secondaryButton} type="submit">Notify the review team</button></form> : null}
          </section>
        ) : retailerStatus === "rejected" ? (
          <section className={styles.statusPanel}>
            <div className={styles.statusLine}><span className={styles.status}>Access not approved</span></div>
            <h2>We could not confirm this account.</h2>
            <p className={styles.muted}>Email <a href="mailto:chandler@bourbonsignal.com">chandler@bourbonsignal.com</a> if ownership or management details have changed.</p>
          </section>
        ) : (
          <div className={styles.portalGrid}>
            <section className={styles.statusPanel}>
              <div className={styles.statusLine}><span className={styles.status}>Retailer verified</span></div>
              <h2>Submit an update</h2>
              <p className={styles.muted}>Updates are reviewed before they appear on Bourbon Signal.</p>
              <form action={submitRetailerUpdate} className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="kind">Update type</label>
                  <select id="kind" name="kind" defaultValue="bottle_drop">
                    <option value="bottle_drop">Bottle drop</option><option value="barrel_pick">Barrel pick</option><option value="tasting">Tasting</option><option value="lottery">Lottery</option><option value="other">Other</option>
                  </select>
                </div>
                <div className={styles.field}><label htmlFor="title">Bottle or event title</label><input id="title" name="title" required maxLength={160} /></div>
                <div className={styles.field}><label htmlFor="locationDetails">Location details <span className={styles.muted}>(optional)</span></label><input id="locationDetails" name="locationDetails" placeholder="Front counter, tasting room…" maxLength={180} /></div>
                <div className={`${styles.formGrid} ${styles.twoColumns}`}>
                  <div className={styles.field}><label htmlFor="price">Price</label><input id="price" name="price" placeholder="$79.99" maxLength={40} /></div>
                  <div className={styles.field}><label htmlFor="availability">Availability</label><input id="availability" name="availability" placeholder="12 bottles, limit one" maxLength={100} /></div>
                </div>
                <div className={styles.field}><label htmlFor="expiresAt">End or expiration</label><input id="expiresAt" name="expiresAt" type="datetime-local" /></div>
                <div className={styles.field}><label htmlFor="notes">Customer details</label><textarea id="notes" name="notes" maxLength={1000} /></div>
                <button className={styles.primaryButton} type="submit">Submit for review</button>
              </form>
            </section>

            <section>
              <p className={styles.eyebrow}>Recent updates</p>
              <div className={styles.submissions}>
                {submissions.length ? submissions.map((submission) => (
                  <article className={styles.submissionCard} key={submission.id || `${submission.title}-${submission.createdAt}`}>
                    <div className={styles.statusLine}><span className={styles.status}>{submission.status?.replaceAll("_", " ") || "pending_review"}</span><strong>{submission.title}</strong></div>
                    <p className={styles.muted}>{submission.notes || "No additional details."}</p>
                    <div className={styles.submissionMeta}><span>{submission.kind?.replaceAll("_", " ")}</span><span>{submission.storeName}</span><span>{submission.storeAddress}</span>{submission.locationDetails ? <span>{submission.locationDetails}</span> : null}<span>{submission.price || "Price not supplied"}</span><span>{submission.availability || "Availability not supplied"}</span></div>
                  </article>
                )) : <div className={styles.submissionCard}><strong>No retailer updates yet.</strong><p className={styles.muted}>Your submitted drops, picks, tastings, and lotteries will appear here.</p></div>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
