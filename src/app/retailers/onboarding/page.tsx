import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyRetailerAccountCreated } from "@/lib/retailer-notifications";
import { getRetailerRepository } from "@/lib/retailer-repository";
import { normalizeRetailerApplication } from "@/lib/retailer-portal";
import styles from "../retailers.module.css";

export const dynamic = "force-dynamic";

async function submitStoreApplication(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login?redirect_url=%2Fretailers%2Fonboarding");

  if (formData.get("ageConfirmed") !== "on") {
    redirect("/retailers/onboarding?error=You%20must%20confirm%20that%20you%20are%2021%20and%20authorized%20to%20represent%20the%20store");
  }

  const normalized = normalizeRetailerApplication(Object.fromEntries(formData.entries()));
  if (!normalized.ok) redirect(`/retailers/onboarding?error=${encodeURIComponent(normalized.error)}`);

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const emailAddress = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) || user.emailAddresses[0];
  if (!emailAddress || emailAddress.verification?.status !== "verified") {
    redirect("/retailers/register?error=verified-email-required");
  }

  const repository = getRetailerRepository();
  const application = await repository.upsertPendingApplication({
    userId,
    email: emailAddress.emailAddress.trim().toLowerCase(),
    firstName: user.firstName,
    application: normalized.value,
  });

  try {
    const notification = await notifyRetailerAccountCreated({
      userId,
      email: application.email,
      firstName: application.firstName,
      application,
    });
    await repository.markNotificationSent(userId, notification.messageId);
  } catch {
    revalidatePath("/retailers/portal");
    redirect("/retailers/portal?applied=1&notification=pending");
  }

  revalidatePath("/retailers/portal");
  redirect("/retailers/portal?applied=1");
}

export default async function RetailerOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login?redirect_url=%2Fretailers%2Fonboarding");

  const repository = getRetailerRepository();
  const existingApplication = await repository.getApplication(userId);
  if (existingApplication) redirect("/retailers/portal");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Retailer account · Step 2 of 2</p>
        <h1>Connect your store.</h1>
        <p className={styles.lede}>Your email is verified. Add the store you represent, then submit it for Bourbon Signal review.</p>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <form action={submitStoreApplication} className={`${styles.formGrid} ${styles.panel}`}>
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
          <label className={styles.checkbox}>
            <input name="ageConfirmed" type="checkbox" required />
            <span>I confirm that I am at least 21 years old and am authorized to request access on behalf of this retailer.</span>
          </label>
          <button className={styles.primaryButton} type="submit">Submit store for review</button>
          <p className={styles.finePrint}>Submission does not grant publishing access. Bourbon Signal verifies the store relationship using independently sourced business contact information.</p>
        </form>
      </section>
    </main>
  );
}
