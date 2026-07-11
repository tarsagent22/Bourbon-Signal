import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StateGuide } from "@/lib/release-radar";

export function StateGuideIndex({ guides }: { guides: StateGuide[] }) {
  return <section className="rr-section" id="states" aria-labelledby="states-title"><div className="rr-heading"><div><span>Field guides</span><h2 id="states-title">Know the system</h2></div><p>How allocation actually moves in each market.</p></div><div className="rr-states">{guides.map(g=><Link href={`/release-radar/states/${g.slug}`} key={g.slug}><b>{g.abbreviation}</b><span><small>{g.model}</small><strong>{g.state}</strong><em>{g.dek}</em></span><ArrowRight size={15}/></Link>)}</div></section>;
}
