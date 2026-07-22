import PricingPageClient from "./PricingPageClient";
import { isJulySaleReadyForCustomers } from "@/lib/july-sale-server";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const julySaleEnabled = await isJulySaleReadyForCustomers();
  return <PricingPageClient julySaleEnabled={julySaleEnabled} />;
}
