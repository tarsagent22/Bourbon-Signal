import Link from "next/link";

export type RadarTab = "calendar" | "briefings" | "states" | "bottles";

const tabs: Array<{ id: RadarTab; label: string; href: string; index: string }> = [
  { id: "calendar", label: "Calendar", href: "/release-radar", index: "01" },
  { id: "briefings", label: "Briefings", href: "/release-radar/briefings", index: "02" },
  { id: "states", label: "States", href: "/release-radar/states", index: "03" },
  { id: "bottles", label: "Bottles", href: "/release-radar/bottles", index: "04" },
];

export function RadarTabs({ active }: { active: RadarTab }) {
  return (
    <nav className="rr-tabs" aria-label="Release Radar sections">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={tab.id === active ? "is-active" : undefined}
          aria-current={tab.id === active ? "page" : undefined}
        >
          <small>{tab.index}</small><span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
