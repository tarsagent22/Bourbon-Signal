import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notifyRetailerAccountCreated } from "@/lib/retailer-notifications";
import { getRetailerRepository } from "@/lib/retailer-repository";
import { normalizeRetailerApplication, normalizeRetailerTermsAcceptance } from "@/lib/retailer-portal";
import RetailerTermsGate from "./RetailerTermsGate";
import styles from "../retailers.module.css";

export const dynamic = "force-dynamic";

async function submitStoreApplication(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/retailers/login?redirect_url=%2Fretailers%2Fonboarding");

  const submitted = Object.fromEntries(formData.entries());
  const terms = normalizeRetailerTermsAcceptance(submitted);
  if (!terms.ok) redirect(`/retailers/onboarding?error=${encodeURIComponent(terms.error)}`);

  const normalized = normalizeRetailerApplication(submitted);
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
    termsVersion: terms.value.termsVersion,
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
        <RetailerTermsGate action={submitStoreApplication} />
      </section>
    </main>
  );
}
