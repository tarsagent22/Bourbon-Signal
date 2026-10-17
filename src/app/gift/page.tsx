import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
export default function GiftPage() {
  return <><Navigation /><main className="mx-auto max-w-2xl px-6 pb-20 pt-40"><h1 className="text-4xl">Bourbon Signal membership</h1><p className="my-6">Barrel Proof includes every paid feature for $6/month. New gift purchases are currently unavailable. Existing gift memberships and redemption links remain valid.</p><Link href="/pricing">View membership</Link></main><Footer /></>;
}
