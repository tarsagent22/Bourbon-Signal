export type MemberNavigationKey = "signals" | "radar" | "post" | "cellar" | "hq";
export type DashboardDestination = "alerts" | "collection" | "recommendations" | "memberPoints" | null;

export type PublicNavigationLink = {
  label: string;
  href: string;
};

export type MemberNavigationLink = PublicNavigationLink & {
  key: MemberNavigationKey;
  emphasis?: boolean;
};

export const PUBLIC_NAVIGATION_LINKS: PublicNavigationLink[] = [
  { label: "Feed", href: "/#drops" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Sightings", href: "/sightings" },
  { label: "Bottle Check", href: "/bottle-check" },
  { label: "Coverage", href: "/coverage" },
];

export const MEMBER_NAVIGATION_LINKS: MemberNavigationLink[] = [
  { key: "signals", label: "Signals", href: "/#drops" },
  { key: "radar", label: "Radar", href: "/dashboard?section=alerts" },
  { key: "post", label: "Post", href: "/sightings?tab=submit", emphasis: true },
  { key: "cellar", label: "Cellar", href: "/dashboard?section=collection" },
  { key: "hq", label: "HQ", href: "/hq" },
];

function dashboardSection(search: string) {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("section");
}

export function memberNavigationActiveKey(pathname: string, search = ""): MemberNavigationKey | null {
  if (pathname === "/" || pathname === "/signals") return "signals";
  if (pathname === "/alerts" || (pathname === "/dashboard" && dashboardSection(search) === "alerts")) return "radar";
  if (pathname === "/sightings" && new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab") === "submit") return "post";
  if (pathname === "/post") return "post";
  if (pathname === "/cellar" || (pathname === "/dashboard" && ["collection", "recommendations"].includes(dashboardSection(search) || ""))) return "cellar";
  if (pathname === "/account/signal-points" || (pathname === "/dashboard" && dashboardSection(search) === "memberPoints")) return "hq";
  if (["/hq", "/settings", "/referrals", "/support"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "hq";
  return null;
}

export function dashboardDestinationCopy(section: DashboardDestination) {
  if (section === "alerts") {
    return {
      eyebrow: "Your radar",
      title: "Radar",
      summary: "Manage saved markets, watched bottles, alert rules, and recent matches.",
    };
  }
  if (section === "collection" || section === "recommendations") {
    return {
      eyebrow: "Your bottles",
      title: "Cellar",
      summary: "Track bottles you own or have tasted and shape what Bourbon Signal recommends next.",
    };
  }
  return {
    eyebrow: "Member overview",
    title: "Dashboard",
    summary: "Your alerts, bottles, and local signals in one place.",
  };
}

function localUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function dashboardSectionUrl(currentHref: string, section: DashboardDestination) {
  const url = new URL(currentHref);
  if (section) url.searchParams.set("section", section);
  else url.searchParams.delete("section");
  return localUrl(url);
}

export function sightingsTabUrl(currentHref: string, tab: "submit" | "feed") {
  const url = new URL(currentHref);
  if (tab === "submit") {
    url.searchParams.set("tab", "submit");
  } else {
    for (const parameter of ["tab", "bottle", "bottleId", "store"]) url.searchParams.delete(parameter);
  }
  return localUrl(url);
}

export function legacySignalPointsUrl(currentHref: string) {
  const url = new URL(currentHref);
  url.pathname = "/hq";
  url.searchParams.delete("section");
  url.hash = "signal-points";
  return localUrl(url);
}
