"use client";

export function ActivationChecklist({ remaining, complete }: { remaining: string[]; complete: boolean }) {
  if (complete) return <section aria-label="Alert setup" className="activation-checklist"><strong>Signal is ready.</strong><span>Your saved territory, bottle mode, and notification channel are active.</span></section>;
  const labels: Record<string, { label: string; href: string }> = {
    area: { label: "Save an alert area", href: "/dashboard?section=alerts" },
    watchlist: { label: "Choose a bottle or anything notable", href: "/dashboard?section=alerts" },
    channel: { label: "Enable an alert channel", href: "/dashboard?section=alerts" },
  };
  return <section aria-label="Alert setup checklist" className="activation-checklist"><p>Finish alert setup</p><h2>One useful signal starts with three choices.</h2><ul>{remaining.map((item) => <li key={item}><a href={labels[item]?.href || "/dashboard?section=alerts"}>{labels[item]?.label || item}</a></li>)}</ul></section>;
}
