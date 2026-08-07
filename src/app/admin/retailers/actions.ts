"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isRetailerAdminEmail } from "@/lib/retailer-admin";
import { getRetailerRepository, type RetailerApplicationRecord } from "@/lib/retailer-repository";
import { normalizeRetailerStatus } from "@/lib/retailer-portal";
import { notifyRetailerDecision } from "@/lib/retailer-notifications";

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  const primary = emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0];
  return primary?.emailAddress?.trim().toLowerCase() || "";
}

export async function requireRetailerAdminAccess() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/admin/control-room%23retailers");
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

function refreshRetailerWorkspaces() {
  revalidatePath("/admin/control-room");
  revalidatePath("/admin/retailers");
  revalidatePath("/retailers/portal");
}

export async function updateRetailerStatus(formData: FormData) {
  const { admin } = await requireRetailerAdminAccess();
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
    refreshRetailerWorkspaces();
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
  refreshRetailerWorkspaces();
}

export async function resendRetailerDecisionNotification(formData: FormData) {
  await requireRetailerAdminAccess();
  const targetUserId = String(formData.get("userId") || "");
  if (!targetUserId) return;
  const application = await getRetailerRepository().getApplication(targetUserId);
  if (!application || (application.status !== "verified" && application.status !== "rejected")) return;
  try { await deliverRetailerDecision(application); } catch (error) { console.error("Retailer decision email retry failed", error); }
  refreshRetailerWorkspaces();
}

export async function removeRetailerSubmission(formData: FormData) {
  await requireRetailerAdminAccess();
  const targetUserId = String(formData.get("userId") || "");
  const submissionId = String(formData.get("submissionId") || "");
  if (!targetUserId || !submissionId) return;
  await getRetailerRepository().deleteSubmission({ id: submissionId, userId: targetUserId });
  refreshRetailerWorkspaces();
}

export async function removeRetailerAccess(formData: FormData) {
  await requireRetailerAdminAccess();
  const targetUserId = String(formData.get("userId") || "");
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (!targetUserId || !confirmation) return;
  const repository = getRetailerRepository();
  const application = await repository.getApplication(targetUserId);
  if (!application || confirmation !== application.storeName) return;
  await repository.deleteApplication(targetUserId);
  refreshRetailerWorkspaces();
}
