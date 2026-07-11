import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function LotteryBrief({ entries }: { entries: RadarEntry[] }) {
  return <section className="rr-section" id="lotteries" aria-labelledby="lottery-title"><div className="rr-heading"><div><span>Lottery desk</span><h2 id="lottery-title">Official entry windows</h2></div><p>State rules, exact deadlines, direct actions.</p></div>
  <div className="rr-table" role="table" aria-label="Official lotteries"><div className="rr-table-head" role="row"><span>Jurisdiction</span><span>Closes</span><span>Eligibility</span><span/></div>{entries.map(entry=><Link href={radarPath(entry)} className="rr-table-row" role="row" key={entry.slug}><span><small>{entry.states[0]}</small><strong>{entry.title}</strong></span><span>{entry.dateLabel}</span><span>{entry.facts.find(f=>f.label==="Eligibility")?.value || "See official rules"}</span><span>Enter lottery <ArrowUpRight size={14}/></span></Link>)}</div></section>;
}
