import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function ReleaseLedger({ entries }: { entries: RadarEntry[] }) {
  const [lead, ...rest] = entries;
  return <section className="rr-section" id="releases" aria-labelledby="releases-title">
    <div className="rr-heading"><div><span>Release ledger</span><h2 id="releases-title">New and notable</h2></div><p>Announcements, timing and bottle facts.</p></div>
    {lead && <Link href={radarPath(lead)} className="rr-lead"><div><small>{lead.status} · {lead.dateLabel}</small><h3>{lead.title}</h3><p>{lead.dek}</p></div><dl>{lead.facts.slice(0,3).map(f=><div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl><span>View release <ArrowRight size={14}/></span></Link>}
    <div className="rr-ledger">{rest.map(entry=><Link href={radarPath(entry)} key={entry.slug}><span><small>{entry.dateLabel}</small><strong>{entry.title}</strong></span><span>{entry.facts[0]?.value}</span><ArrowRight size={14}/></Link>)}</div>
  </section>;
}
