import AdminBottleQueueClient from "./AdminBottleQueueClient";
import { requireOwnerPageAccess } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export default async function AdminBottleQueuePage() {
  await requireOwnerPageAccess("/admin/bottle-queue");
  return <AdminBottleQueueClient />;
}
