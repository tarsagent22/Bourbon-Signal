import { redirect } from "next/navigation";
import { requireSignalPointsPageAccess } from "@/lib/owner-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignalPointsLegacyPage() {
  await requireSignalPointsPageAccess("/account/signal-points");
  redirect("/dashboard?section=memberPoints");
}
