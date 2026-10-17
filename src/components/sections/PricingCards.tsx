import Link from "next/link";
export default function PricingCards() {
  return <section id="pricing" className="mx-auto max-w-3xl px-6 py-16 text-center"><h2 className="text-3xl">One membership. Every paid feature.</h2><p className="my-5">Barrel Proof · $6/month. Explore with Free or get full access.</p><Link href="/pricing">View membership</Link></section>;
}
