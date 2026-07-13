import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyRetailerAccountCreated } from "@/lib/retailer-notifications";
import { getRetailerRepository, type RetailerApplicationRecord } from "@/lib/retailer-repository";
import { normalizeRetailerSubmission } from "@/lib/retailer-portal";
import RetailerSignalForm from "./RetailerSignalForm";
import styles from "../retailers.module.css";

export const dynamic = "force-dynamic";

async function sendApplicationNotification(application: RetailerApplicationRecord) {
  const notification = await notifyRetailerAccountCreated({
    userId: application.userId,
    email: application.email,
    firstName: application.firstName,
    application,
  });
  await getRetailerRepository().markNotificationSent(application.userId, notification.messageId);
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
  const application = await repository.getApplication(userId);
  if (!application) redirect("/retailers/onboarding");
  const submissions = (await repository.listSubmissions(userId)).filter((submission) => submission.status !== "rejected");
  const retailerStatus = application.status;
  const storeName = application.storeName;
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
        {params.submitted === "1" ? <p className={styles.notice}>Signal submitted. No additional approval is required.</p> : null}

        {retailerStatus === "pending" ? (
          <section className={styles.statusPanel}>
            <div className={styles.statusLine}><span className={styles.status}>Verification pending</span><strong>{storeName}</strong></div>
            <h2>We only verify store access once.</h2>
            <p className={styles.muted}>We confirm your connection through a publicly listed business phone or an official business email. After approval, your signals do not go through a separate review step.</p>
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
              <h2>Submit a signal</h2>
              <p className={styles.muted}>Share a bottle drop, barrel pick, tasting, or lottery directly. Verified retailers do not wait for per-signal approval.</p>
              <RetailerSignalForm action={submitRetailerUpdate} />
            </section>

            <section>
              <p className={styles.eyebrow}>Recent signals</p>
              <div className={styles.submissions}>
                {submissions.length ? submissions.map((submission) => (
                  <article className={styles.submissionCard} key={submission.id || `${submission.title}-${submission.createdAt}`}>
                    <div className={styles.statusLine}><span className={styles.status}>submitted</span><strong>{submission.title}</strong></div>
                    <p className={styles.muted}>{submission.notes || "No additional details."}</p>
                    <div className={styles.submissionMeta}><span>{submission.kind?.replaceAll("_", " ")}</span><span>{submission.storeName}</span><span>{submission.storeAddress}</span>{submission.locationDetails ? <span>{submission.locationDetails}</span> : null}{submission.kind !== "other" ? <><span>{submission.price || "Price not supplied"}</span><span>{submission.availability || "Availability not supplied"}</span></> : null}</div>
                  </article>
                )) : <div className={styles.submissionCard}><strong>No retailer signals yet.</strong><p className={styles.muted}>Your submitted drops, picks, tastings, and lotteries will appear here.</p></div>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
