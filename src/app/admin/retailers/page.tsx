import { redirect } from "next/navigation";
import { requireRetailerAdminAccess } from "./actions";

export const dynamic = "force-dynamic";

export default async function RetailerAdminPage() {
  await requireRetailerAdminAccess();
  redirect("/admin/control-room#retailers");
}
