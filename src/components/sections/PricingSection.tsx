import Link from "next/link";
export default function PricingSection() {
  return <section id="pricing" className="mx-auto max-w-3xl px-6 py-16 text-center"><h2 className="text-3xl">Every paid feature. Your choice of membership.</h2><p className="my-5">Barrel Proof · $6/month. Founder · $50 once for lifetime access. Free is always available.</p><Link href="/pricing">View memberships</Link></section>;
}
