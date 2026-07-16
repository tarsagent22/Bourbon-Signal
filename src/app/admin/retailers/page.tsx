import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isRetailerAdminEmail } from "@/lib/retailer-admin";
import { getRetailerRepository, type RetailerApplicationRecord } from "@/lib/retailer-repository";
import { normalizeRetailerStatus } from "@/lib/retailer-portal";
import { notifyRetailerDecision } from "@/lib/retailer-notifications";

export const dynamic = "force-dynamic";

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  const primary = emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0];
  return primary?.emailAddress?.trim().toLowerCase() || "";
}

async function requireRetailerAdmin() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/retailers");
  const client = await clerkClient();
  const admin = await client.users.getUser(userId);
  if (!isRetailerAdminEmail(primaryEmail(admin))) notFound();
  return { client, admin };
}

async function deliverRetailerDecision(application: RetailerApplicationRecord) {
  if (application.status !== "verified" && application.status !== "rejected") return;
  const notification = await notifyRetailerDecision({
    userId: application.userId,
    email: application.email,
    firstName: application.firstName,
    storeName: application.storeName,
    status: application.status,
    decisionAt: application.updatedAt,
  });
  await getRetailerRepository().markDecisionNotificationSent({
    userId: application.userId,
    status: application.status,
    messageId: notification.messageId,
  });
}

async function updateRetailerStatus(formData: FormData) {
  "use server";
  const { admin } = await requireRetailerAdmin();
  const targetUserId = String(formData.get("userId") || "");
  const nextStatus = normalizeRetailerStatus(formData.get("status"));
  const verificationMethod = String(formData.get("verificationMethod") || "").trim();
  const verificationContact = String(formData.get("verificationContact") || "").trim().slice(0, 240);
  if (!targetUserId || !["pending", "verified", "rejected"].includes(nextStatus)) return;
  if (nextStatus === "verified" && (!["public_phone", "business_email"].includes(verificationMethod) || !verificationContact)) return;
  const repository = getRetailerRepository();
  const existing = await repository.getApplication(targetUserId);
  if (!existing) return;
  if (existing.status === nextStatus) {
    if ((nextStatus === "verified" || nextStatus === "rejected") && existing.decisionNotifiedStatus !== nextStatus) {
      try { await deliverRetailerDecision(existing); } catch (error) { console.error("Retailer decision email failed", error); }
    }
    revalidatePath("/admin/retailers");
    return;
  }
  const application = await repository.updateApplicationStatus({
    userId: targetUserId,
    status: nextStatus as "pending" | "verified" | "rejected",
    reviewedBy: admin.id,
    verificationMethod: nextStatus === "verified" ? verificationMethod : null,
    verificationContact: nextStatus === "verified" ? verificationContact : null,
  });
  if (!application) return;
  if (application.status === "verified" || application.status === "rejected") {
    try { await deliverRetailerDecision(application); } catch (error) { console.error("Retailer decision email failed", error); }
  }
  revalidatePath("/admin/retailers");
  revalidatePath("/retailers/portal");
}

async function resendRetailerDecisionNotification(formData: FormData) {
  "use server";
  await requireRetailerAdmin();
  const targetUserId = String(formData.get("userId") || "");
  if (!targetUserId) return;
  const application = await getRetailerRepository().getApplication(targetUserId);
  if (!application || (application.status !== "verified" && application.status !== "rejected")) return;
  try { await deliverRetailerDecision(application); } catch (error) { console.error("Retailer decision email retry failed", error); }
  revalidatePath("/admin/retailers");
}

async function removeRetailerSubmission(formData: FormData) {
  "use server";
  await requireRetailerAdmin();
  const targetUserId = String(formData.get("userId") || "");
  const submissionId = String(formData.get("submissionId") || "");
  if (!targetUserId || !submissionId) return;
  await getRetailerRepository().deleteSubmission({ id: submissionId, userId: targetUserId });
  revalidatePath("/admin/retailers");
  revalidatePath("/retailers/portal");
}

async function removeRetailerAccess(formData: FormData) {
  "use server";
  await requireRetailerAdmin();
  const targetUserId = String(formData.get("userId") || "");
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (!targetUserId || !confirmation) return;
  const repository = getRetailerRepository();
  const application = await repository.getApplication(targetUserId);
  if (!application || confirmation !== application.storeName) return;
  await repository.deleteApplication(targetUserId);
  revalidatePath("/admin/retailers");
  revalidatePath("/retailers/portal");
}

async function listAllRetailerApplications() {
  const repository = getRetailerRepository();
  const applications: RetailerApplicationRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await repository.listApplications(100, offset);
    applications.push(...page);
    if (page.length < 100) break;
  }
  return applications;
}

export default async function RetailerAdminPage() {
  await requireRetailerAdmin();
  const repository = getRetailerRepository();
  const [retailers, allSubmissions] = await Promise.all([
    listAllRetailerApplications(),
    repository.listSubmissions(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] px-5 py-10 text-[var(--color-text-primary)] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-7">
          <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-accent-amber)]">Bourbon Signal operations</p><h1 className="mt-2 font-serif text-4xl">Retailer access</h1></div>
          <nav className="flex flex-wrap gap-2"><a className="border border-white/15 px-4 py-2 text-sm" href="/admin/retailer-acquisition">Acquisition ledger</a><a className="border border-white/15 px-4 py-2 text-sm" href="/admin/operations">Engine operations</a></nav>
        </header>

        <section className="mt-8 grid gap-5">
          {retailers.length ? retailers.map((application) => {
            const retailerStatus = application.status;
            const submissions = allSubmissions.filter((submission) => submission.userId === application.userId);
            return (
              <article key={application.userId} className="border border-white/10 bg-[#14100c] p-5 sm:p-7">
                <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3"><span className="border border-amber-500/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-200">{retailerStatus.replaceAll("_", " ")}</span><h2 className="font-serif text-2xl">{application?.storeName || "Incomplete retailer account"}</h2></div>
                    <dl className="mt-4 grid gap-2 text-sm text-[var(--color-text-secondary)] sm:grid-cols-2">
                      <div><dt className="font-mono text-[10px] uppercase">Applicant</dt><dd>{application.firstName || "Unknown"} · {application.email}</dd></div>
                      <div><dt className="font-mono text-[10px] uppercase">Role</dt><dd>{application?.applicantRole || "Not provided"}</dd></div>
                      <div><dt className="font-mono text-[10px] uppercase">Store contact</dt><dd>{application?.listedPhone || "Not provided"}</dd></div>
                      <div><dt className="font-mono text-[10px] uppercase">Website</dt><dd>{application?.website || "Not provided"}</dd></div>
                      <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase">Address</dt><dd>{application?.storeAddress || "Not provided"}</dd></div>
                      <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase">Review notice</dt><dd>{application.notificationSentAt ? `Sent ${new Date(application.notificationSentAt).toLocaleString()}` : "Pending delivery"}</dd></div>
                      {retailerStatus === "verified" || retailerStatus === "rejected" ? <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase">Decision email</dt><dd>{application.decisionNotifiedStatus === retailerStatus && application.decisionNotificationSentAt ? `Sent ${new Date(application.decisionNotificationSentAt).toLocaleString()}` : "Decision email pending"}</dd></div> : null}
                    </dl>
                  </div>
                  <div className="grid min-w-[260px] gap-2 lg:w-72">
                    <form action={updateRetailerStatus} className="grid gap-2 border border-emerald-600/30 bg-emerald-950/20 p-3">
                      <input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="status" value="verified" />
                      <label className="font-mono text-[10px] uppercase text-emerald-200" htmlFor={`verification-method-${application.userId}`}>Independent verification</label>
                      <select className="bg-[#f7f0e0] px-2 py-2 text-sm text-[#14100c]" id={`verification-method-${application.userId}`} name="verificationMethod" required defaultValue="public_phone"><option value="public_phone">Public phone callback</option><option value="business_email">Official business email</option></select>
                      <input className="bg-[#f7f0e0] px-2 py-2 text-sm text-[#14100c]" name="verificationContact" required maxLength={240} placeholder="Phone called or email used" />
                      <button className="w-full border border-emerald-600/50 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200" type="submit">Mark verified</button>
                    </form>
                    <div className="flex gap-2 lg:grid">
                      <form action={updateRetailerStatus} className="flex-1"><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="status" value="pending" /><button className="w-full border border-amber-600/50 bg-amber-950/30 px-4 py-2 text-sm text-amber-100" type="submit">Keep pending</button></form>
                      <form action={updateRetailerStatus} className="flex-1"><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="status" value="rejected" /><button className="w-full border border-red-600/50 bg-red-950/30 px-4 py-2 text-sm text-red-100" type="submit">Reject access</button></form>
                    </div>
                    {(retailerStatus === "verified" || retailerStatus === "rejected") && application.decisionNotifiedStatus !== retailerStatus ? (
                      <form action={resendRetailerDecisionNotification}>
                        <input type="hidden" name="userId" value={application.userId} />
                        <button className="w-full border border-sky-600/50 bg-sky-950/20 px-4 py-2 text-sm text-sky-100" type="submit">Resend decision email</button>
                      </form>
                    ) : null}
                    <details className="border border-red-600/30 bg-red-950/10 p-3 text-sm">
                      <summary className="cursor-pointer text-red-200">Remove retailer access</summary>
                      <form action={removeRetailerAccess} className="mt-3 grid gap-2">
                        <input type="hidden" name="userId" value={application.userId} />
                        <label className="text-xs text-[var(--color-text-secondary)]" htmlFor={`remove-${application.userId}`}>Type <strong>{application.storeName}</strong> to remove this retailer profile and all its submissions. The customer’s main sign-in account is not deleted.</label>
                        <input className="bg-[#f7f0e0] px-2 py-2 text-sm text-[#14100c]" id={`remove-${application.userId}`} name="confirmation" required autoComplete="off" />
                        <button className="border border-red-600/50 px-3 py-2 text-xs text-red-100" type="submit">Remove retailer profile</button>
                      </form>
                    </details>
                  </div>
                </div>

                {submissions.length ? <div className="mt-6 border-t border-white/10 pt-5"><h3 className="font-serif text-lg">Submitted signals</h3><div className="mt-3 grid gap-3">{submissions.map((submission) => (
                  <div key={submission.id} className="grid gap-3 border border-white/10 p-4 md:grid-cols-[1fr_auto]">
                    <div><div className="flex flex-wrap gap-2"><strong>{submission.title}</strong><span className="font-mono text-[10px] uppercase text-amber-200">{submission.status === "rejected" ? "removed" : "retailer signal"}</span></div><p className="mt-1 text-sm text-[var(--color-text-secondary)]">{submission.storeName} · {submission.storeAddress}{submission.locationDetails ? ` · ${submission.locationDetails}` : ""}{submission.kind === "other" ? "" : ` · ${submission.availability || "No availability supplied"} · ${submission.price || "No price supplied"}`}</p></div>
                    <div className="flex flex-wrap items-start gap-2">
                      <details className="border border-red-600/30 px-3 py-2 text-xs text-red-100"><summary className="cursor-pointer">Remove</summary><form action={removeRetailerSubmission} className="mt-2"><input type="hidden" name="userId" value={application.userId} /><input type="hidden" name="submissionId" value={submission.id} /><button className="border border-red-600/50 px-2 py-1" type="submit">Confirm remove</button></form></details>
                    </div>
                  </div>
                ))}</div></div> : null}
              </article>
            );
          }) : <p className="border border-white/10 bg-[#14100c] p-8 text-[var(--color-text-secondary)]">No retailer accounts yet.</p>}
        </section>
      </div>
    </main>
  );
}
