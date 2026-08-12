import AdminSightingsClient from "./AdminSightingsClient";
import { requireOwnerPageAccess } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";

export default async function AdminSightingsPage() {
  await requireOwnerPageAccess("/admin/sightings");
  return <AdminSightingsClient />;
}
