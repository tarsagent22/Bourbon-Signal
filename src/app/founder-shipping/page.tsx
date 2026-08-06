import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Shipping information | Bourbon Signal",
  robots: { index: false, follow: false },
};

export default function FounderShippingCompatibilityPage() {
  redirect("/settings#shipping");
}
