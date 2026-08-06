import type { Metadata } from "next";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { unstable_noStore as noStore, revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  FOUNDER_SHIPPING_STATE_CODES,
  founderShippingEligibility,
  normalizeFounderShippingSubmission,
} from "@/lib/founder-shipping";
import {
  FounderShippingLockedError,
  readFounderShippingForUser,
  saveFounderShippingSubmission,
} from "@/lib/founder-shipping-repository";
import styles from "./founder-shipping.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Founder glass shipping | Bourbon Signal",
  robots: { index: false, follow: false },
};

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  return (emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0])?.emailAddress?.trim().toLowerCase() || "";
}

async function saveShippingInformation(formData: FormData) {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/founder-shipping");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const eligibility = founderShippingEligibility(user.publicMetadata);
  if (!eligibility.eligible || eligibility.founderNumber === null) notFound();

  const normalized = normalizeFounderShippingSubmission(Object.fromEntries(formData.entries()));
  if (!normalized.ok) redirect(`/founder-shipping?error=${encodeURIComponent(normalized.error)}`);
  const accountEmail = primaryEmail(user);
  if (!accountEmail) redirect("/founder-shipping?error=Account%20email%20is%20unavailable");

  try {
    await saveFounderShippingSubmission({
      userId,
      founderNumber: eligibility.founderNumber,
      accountEmail,
      submission: normalized.value,
    });
  } catch (error) {
    if (error instanceof FounderShippingLockedError) {
      redirect("/founder-shipping?error=This%20glass%20is%20already%20in%20fulfillment");
    }
    throw error;
  }

  revalidatePath("/founder-shipping");
  revalidatePath("/admin/control-room");
  redirect("/founder-shipping?saved=1");
}

export default async function FounderShippingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  noStore();
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/founder-shipping");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const eligibility = founderShippingEligibility(user.publicMetadata);
  if (!eligibility.eligible || eligibility.founderNumber === null) notFound();

  const [record, params] = await Promise.all([readFounderShippingForUser(userId), searchParams]);
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : "";
  const locked = record?.status === "packed" || record?.status === "shipped";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Bottled-in-Bond Founder · No. {eligibility.founderNumber}</p>
        <h1>Where should we send your founder’s glass?</h1>
        <p className={styles.lede}>Add the shipping address and phone number we should use for your founder’s glass. Shipping is available in the United States only.</p>

        {saved ? <p className={styles.success} role="status">Shipping information saved.</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        {locked ? (
          <div className={styles.shipped}>
            <strong>{record.status === "shipped" ? "Your founder’s glass has shipped." : "Your founder’s glass is being prepared for shipping."}</strong>
            {record.trackingNumber ? <p>Tracking: {record.trackingNumber}</p> : null}
          </div>
        ) : (
          <form action={saveShippingInformation} className={styles.form}>
            <input type="hidden" name="countryCode" value="US" />
            <label className={styles.full}>
              <span>Recipient name</span>
              <input name="recipientName" autoComplete="name" maxLength={120} defaultValue={record?.recipientName || `${user.firstName || ""} ${user.lastName || ""}`.trim()} required />
            </label>
            <label className={styles.full}>
              <span>Street address</span>
              <input name="addressLine1" autoComplete="address-line1" maxLength={160} defaultValue={record?.addressLine1 || ""} required />
            </label>
            <label className={styles.full}>
              <span>Apartment, suite, etc. <em>Optional</em></span>
              <input name="addressLine2" autoComplete="address-line2" maxLength={160} defaultValue={record?.addressLine2 || ""} />
            </label>
            <label className={styles.city}>
              <span>City</span>
              <input name="city" autoComplete="address-level2" maxLength={100} defaultValue={record?.city || ""} required />
            </label>
            <label>
              <span>State</span>
              <select name="stateCode" autoComplete="address-level1" defaultValue={record?.stateCode || ""} required>
                <option value="" disabled>Select</option>
                {FOUNDER_SHIPPING_STATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <label>
              <span>ZIP code</span>
              <input name="postalCode" autoComplete="postal-code" inputMode="numeric" maxLength={10} defaultValue={record?.postalCode || ""} required />
            </label>
            <label className={styles.full}>
              <span>Phone number</span>
              <input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={record?.phone || ""} required />
              <small>Required for carrier or delivery questions.</small>
            </label>
            <div className={styles.country}><span>Country</span><strong>United States</strong></div>
            <button type="submit">{record ? "Update shipping information" : "Save shipping information"}</button>
            <p className={styles.privacy}>Your address and phone are visible only in the private owner fulfillment view and used to ship your founder’s glass.</p>
          </form>
        )}
      </section>
    </main>
  );
}
