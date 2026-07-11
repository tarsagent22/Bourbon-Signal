import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";
import { radarPath } from "@/lib/release-radar";

export function LotteryBrief({ entries }: { entries: RadarEntry[] }) {
  return <section className="rr-section" id="lotteries" aria-labelledby="lottery-title">
    <div className="rr-heading"><div><span>Lottery desk</span><h2 id="lottery-title">Official entry windows</h2></div><p>State rules, exact deadlines, direct actions.</p></div>
    <div className="rr-table-wrap">
      <table className="rr-table">
        <thead><tr><th scope="col">Jurisdiction</th><th scope="col">Closes</th><th scope="col">Eligibility</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.slug}>
          <td data-label="Jurisdiction"><small>{entry.states[0]}</small><Link href={radarPath(entry)}>{entry.title}</Link></td>
          <td data-label="Closes">{entry.dateLabel}</td>
          <td data-label="Eligibility">{entry.facts.find(fact => fact.label === "Eligibility")?.value || "See official rules"}</td>
          <td data-label="Action"><Link href={radarPath(entry)}>Enter lottery <ArrowUpRight size={14}/></Link></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
