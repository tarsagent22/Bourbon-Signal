import Link from "next/link";
import { ArrowDown, Clock3 } from "lucide-react";
import type { RadarEntry } from "@/lib/release-radar";

export function ActionNow({ entries }: { entries: RadarEntry[] }) {
  const next = entries[0];
  if (!next) return null;
  const closes = next.facts.find(fact => fact.label === "Closes")?.value || next.dateLabel;
  return <section className="rr-action" id="action" aria-labelledby="action-title">
    <div className="rr-heading"><div><span>Action desk</span><h2 id="action-title">Deadlines first.</h2></div><p>{entries.length} active watch window{entries.length === 1 ? "" : "s"}</p></div>
    <Link href="#lotteries" className="rr-action-row">
      <span className="rr-action-rank">01</span>
      <span className="rr-action-date"><Clock3 size={13}/>{next.dateLabel}</span>
      <span className="rr-action-main"><small>Next deadline</small><strong>{next.states[0]} lottery closes</strong><em>{closes}</em></span>
      <span className="rr-action-link">Review eligibility <ArrowDown size={14}/></span>
    </Link>
  </section>;
}
