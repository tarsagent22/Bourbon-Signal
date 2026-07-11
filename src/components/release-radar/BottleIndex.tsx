import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function BottleIndex({ entries }: { entries: RadarEntry[] }) {
  return <section className="rr-section" id="bottles" aria-labelledby="bottles-title"><div className="rr-heading"><div><span>Bottle index</span><h2 id="bottles-title">Collector context</h2></div><p>Proof, price and release timing at a glance.</p></div><div className="rr-bottles">{entries.map(e=><Link href={radarPath(e)} key={e.slug}><span><small>{e.status} · {e.dateLabel}</small><strong>{e.title}</strong></span>{e.facts.slice(0,2).map(f=><span key={f.label}><small>{f.label}</small>{f.value}</span>)}<ArrowRight size={14}/></Link>)}</div></section>;
}
