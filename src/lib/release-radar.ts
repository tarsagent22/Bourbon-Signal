export type RadarKind = "release" | "lottery" | "event" | "bottle";

export interface RadarSource {
  label: string;
  url: string;
  type: "official" | "state";
}

export interface RadarEntry {
  kind: RadarKind;
  slug: string;
  eyebrow: string;
  title: string;
  dek: string;
  summary: string;
  startDate: string;
  endDate?: string;
  schemaStartDate?: string;
  schemaEndDate?: string;
  occurrenceDates?: string[];
  dateLabel: string;
  status: "announced" | "open" | "upcoming" | "releasing" | "watch";
  states: string[];
  location?: string;
  bottle?: string;
  msrp?: string;
  proof?: string;
  availability?: string;
  featured?: boolean;
  calendar?: boolean;
  updatedAt: string;
  facts: Array<{ label: string; value: string }>;
  sections: Array<{ heading: string; body: string }>;
  sources: RadarSource[];
}

export interface StateGuide {
  slug: string;
  state: string;
  abbreviation: string;
  title: string;
  dek: string;
  model: string;
  updatedAt: string;
  quickFacts: Array<{ label: string; value: string }>;
  sections: Array<{ heading: string; body: string }>;
  sources: RadarSource[];
}

export const radarEntries: RadarEntry[] = [
  {
    kind: "lottery",
    slug: "virginia-abc-rare-character-july-2026",
    eyebrow: "Virginia lottery",
    title: "Virginia ABC opens a short Rare Character whiskey lottery",
    calendar: true,
    dek: "A tightly timed online entry window puts four limited bourbon and rye releases into Virginia's official lottery channel.",
    summary: "Entries open July 12 at 9:00 p.m. and close July 16 at 8:59 p.m. Virginia residents should confirm bottle eligibility, pricing, and pickup requirements on the official lottery page before entering.",
    startDate: "2026-07-12",
    endDate: "2026-07-16",
    schemaStartDate: "2026-07-12T21:00:00-04:00",
    schemaEndDate: "2026-07-16T20:59:00-04:00",
    dateLabel: "Jul 12–16",
    status: "upcoming",
    states: ["Virginia"],
    location: "Virginia",
    availability: "Virginia ABC online lottery",
    featured: true,
    updatedAt: "2026-07-10",
    facts: [
      { label: "Opens", value: "July 12 · 9:00 PM" },
      { label: "Closes", value: "July 16 · 8:59 PM" },
      { label: "Channel", value: "Virginia ABC lottery" },
      { label: "Action", value: "Review eligibility before entry" },
    ],
    sections: [
      { heading: "What hunters should know", body: "Virginia routes selected limited releases through a controlled online lottery rather than ordinary shelf availability. The entry window is the actionable event; an entry is not a purchase guarantee." },
      { heading: "Why it matters", body: "The official window names the bottles and removes the guesswork around when interest can be registered. This is a state-source signal, not a store-level inventory report." },
      { heading: "Before entering", body: "Use Virginia ABC's official instructions for residency, store selection, winner notification, payment, and pickup requirements. Those terms control if any summary changes." },
    ],
    sources: [{ label: "Virginia ABC lottery portal", url: "https://www.abc.virginia.gov/lotto/", type: "state" }],
  },
  {
    kind: "release",
    slug: "four-roses-anthology-chapter-one-origin",
    eyebrow: "Collector release",
    title: "Four Roses opens its Anthology with a 21-year bourbon",
    calendar: true,
    dek: "Chapter One: Origin begins a new annual collection with one of the oldest age statements Four Roses has released.",
    summary: "Four Roses lists Anthology Chapter One: Origin for release beginning July 10, 2026. The limited 21-year Kentucky straight bourbon is a release-watch story, not a claim of local shelf inventory.",
    startDate: "2026-07-10",
    dateLabel: "Releasing now",
    status: "releasing",
    states: ["Nationwide"],
    location: "Limited U.S. distribution",
    bottle: "Four Roses Anthology Chapter One: Origin",
    availability: "Limited allocation",
    featured: true,
    updatedAt: "2026-07-10",
    facts: [
      { label: "Age", value: "21 years" },
      { label: "Release", value: "July 10, 2026" },
      { label: "Series", value: "Anthology Collection" },
      { label: "Signal", value: "Release watch" },
    ],
    sections: [
      { heading: "The release", body: "Origin is the opening chapter in Four Roses' Anthology Collection, an annual limited-release lane built around unusually mature whiskey and the distillery's ten bourbon recipes." },
      { heading: "Availability context", body: "An official release date establishes the watch window, not store-level availability. Distribution timing can vary by market, wholesaler, and retailer." },
      { heading: "What to watch next", body: "Official allocation details, state listings, retailer releases, and confirmed member sightings can narrow the release from national announcement to local action." },
    ],
    sources: [{ label: "Four Roses Anthology Collection", url: "https://www.fourrosesbourbon.com/bourbons/anthology-collection", type: "official" }],
  },
  {
    kind: "event",
    slug: "camp-buffalo-trace-2026",
    eyebrow: "Distillery experience",
    title: "Camp Buffalo Trace turns bourbon education into summer camp",
    calendar: true,
    dek: "Two adults-only dates combine distillery access, camp-style programming, and a limited overnight glamping experience.",
    summary: "Camp Buffalo Trace is scheduled for August 29 and September 5 at Buffalo Trace Distillery. Capacity and overnight options are limited; official registration details should be treated as authoritative.",
    startDate: "2026-08-29",
    endDate: "2026-09-05",
    occurrenceDates: ["2026-08-29", "2026-09-05"],
    dateLabel: "Aug 29 & Sep 5",
    status: "upcoming",
    states: ["Kentucky"],
    location: "Frankfort, Kentucky",
    availability: "Limited registration",
    featured: true,
    updatedAt: "2026-07-10",
    facts: [
      { label: "Dates", value: "Aug 29 · Sep 5" },
      { label: "Audience", value: "Adults 21+" },
      { label: "Location", value: "Buffalo Trace Distillery" },
      { label: "Option", value: "Limited overnight glamping" },
    ],
    sections: [
      { heading: "What it is", body: "Camp Buffalo Trace extends the distillery visit into a programmed bourbon-culture experience. Education and hosted activities are the center of the event, with a limited overnight component for eligible guests." },
      { heading: "Why it belongs on the radar", body: "This is not a bottle drop, but it is a scarce official bourbon event with fixed dates and limited capacity. That makes registration timing useful intelligence for enthusiasts planning travel." },
      { heading: "Registration guidance", body: "Confirm package inclusions, age requirements, lodging, transportation, cancellation rules, and availability directly with Buffalo Trace before making plans." },
    ],
    sources: [{ label: "Camp Buffalo Trace", url: "https://www.buffalotracedistillery.com/camp/", type: "official" }],
  },
  {
    kind: "release",
    slug: "heaven-hill-heritage-collection-22-year-2026",
    eyebrow: "Release watch",
    title: "Heaven Hill Heritage Collection moves to 22-year bourbon",
    dek: "The 2026 Heritage Collection returns with an ultra-aged Kentucky straight bourbon positioned for the collector tier.",
    summary: "Heaven Hill's official Heritage Collection page identifies the 2026 edition as a 22-year Kentucky straight bourbon. Local arrival dates remain market-dependent.",
    startDate: "2026-07-01",
    dateLabel: "Summer 2026",
    status: "watch",
    states: ["Nationwide"],
    bottle: "Heaven Hill Heritage Collection 22 Year",
    availability: "Limited national release",
    updatedAt: "2026-07-10",
    facts: [
      { label: "Age", value: "22 years" },
      { label: "Category", value: "Kentucky straight bourbon" },
      { label: "Edition", value: "2026" },
      { label: "Signal", value: "National release watch" },
    ],
    sections: [
      { heading: "Release context", body: "The Heritage Collection is Heaven Hill's annual ultra-aged release platform. The official product record establishes the bottle; it does not establish exact shelf timing in every state." },
      { heading: "Hunting context", body: "Expect allocation and staggered distribution. State listings and confirmed retailer or member reports provide stronger local evidence than the announcement alone." },
      { heading: "Signal discipline", body: "Bourbon Signal treats this as a release-watch record until a more precise state, board, or store-level source appears." },
    ],
    sources: [{ label: "Heaven Hill Heritage Collection", url: "https://heavenhilldistillery.com/heavenhill-heritage-collection.php", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "old-fitzgerald-bottled-in-bond-spring-2026",
    eyebrow: "Bottle guide",
    title: "Old Fitzgerald 10 Year enters the summer allocation radar",
    dek: "The Spring 2026 decanter keeps Old Fitzgerald's Bottled-in-Bond line in one of Heaven Hill's most closely watched release lanes.",
    summary: "The Spring 2026 Old Fitzgerald Bottled-in-Bond release carries a 10-year age statement. MSRP and secondary-market context should be verified at the time of purchase because asking prices are not reliable sale values.",
    startDate: "2026-07-01",
    dateLabel: "Spring 2026 edition",
    status: "watch",
    states: ["Nationwide"],
    bottle: "Old Fitzgerald Bottled-in-Bond 10 Year",
    availability: "Limited allocation",
    updatedAt: "2026-07-10",
    facts: [
      { label: "Age", value: "10 years" },
      { label: "Bonded", value: "100 proof" },
      { label: "Edition", value: "Spring 2026" },
      { label: "Market note", value: "Verify current price context" },
    ],
    sections: [
      { heading: "Bottle profile", body: "Old Fitzgerald's decanter series is a bottled-in-bond release with a rotating age statement and release season. The 2026 spring edition is identified as a 10-year bourbon." },
      { heading: "Price context", body: "MSRP is the cleanest official baseline when published. Public asking prices can be volatile and do not represent a guaranteed resale or fair purchase value." },
      { heading: "Availability context", body: "Treat national release information as the beginning of the hunt. Exact inventory requires a state, retailer, or member source with a current timestamp." },
    ],
    sources: [{ label: "Old Fitzgerald Bottled-in-Bond", url: "https://heavenhilldistillery.com/old-fitzgerald.php", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "elijah-craig-21-year-single-barrel-2026",
    eyebrow: "Bottle guide",
    title: "Elijah Craig 21 Year returns as a trophy single barrel",
    dek: "Heaven Hill is bringing an older Elijah Craig age statement back into limited distribution for 2026.",
    summary: "The 2026 Elijah Craig 21-Year-Old Single Barrel is an official limited release with an initial distillery debut and select-market distribution expected later in the year.",
    startDate: "2026-07-01",
    dateLabel: "2026 release",
    status: "watch",
    states: ["Kentucky", "Nationwide"],
    bottle: "Elijah Craig 21-Year-Old Single Barrel",
    availability: "Distillery debut, then select markets",
    updatedAt: "2026-07-10",
    facts: [
      { label: "Age", value: "21 years" },
      { label: "Format", value: "Single barrel" },
      { label: "Release", value: "Limited 2026 edition" },
      { label: "Signal", value: "Distillery and select-market watch" },
    ],
    sections: [
      { heading: "What is confirmed", body: "Heaven Hill has officially announced the return of Elijah Craig 21-Year-Old Single Barrel for 2026, beginning with a distillery release and expanding to select markets." },
      { heading: "Why it matters", body: "A 21-year single-barrel bourbon sits firmly in the trophy-bottle tier. The age statement and limited channel will concentrate demand." },
      { heading: "What is not confirmed", body: "An official announcement does not confirm inventory at a particular store. Market-specific listings and current sightings remain necessary for local action." },
    ],
    sources: [{ label: "Heaven Hill announcement", url: "https://heavenhill.com/news-and-notes/elijah-craig-expands-single-barrel-lineup-with-rare-21-year-old-release/", type: "official" }],
  },
  {
    kind: "release",
    slug: "lost-lantern-united-states-of-bourbon-1776",
    eyebrow: "National release",
    title: "Lost Lantern turns all 50 states into one bourbon story",
    calendar: true,
    dek: "United States of Bourbon blends straight bourbon sourced across every state, with a limited 1776 Edition marking America's 250th.",
    summary: "Lost Lantern's official United States of Bourbon project creates a national release story rooted in geographic breadth rather than a single distillery or state allocation.",
    startDate: "2026-07-04",
    dateLabel: "2026 edition",
    status: "releasing",
    states: ["Nationwide"],
    bottle: "United States of Bourbon 1776 Edition",
    availability: "Limited release",
    updatedAt: "2026-07-10",
    facts: [
      { label: "Scope", value: "Bourbon from all 50 states" },
      { label: "Edition", value: "1776 Edition" },
      { label: "Theme", value: "America's 250th" },
      { label: "Signal", value: "National release watch" },
    ],
    sections: [
      { heading: "The concept", body: "The project uses bourbon from all fifty states to build a deliberately national whiskey profile and an unusually broad geography story." },
      { heading: "Release context", body: "The 1776 Edition is the limited collector expression within the broader United States of Bourbon project." },
      { heading: "Hunting context", body: "Monitor the producer's official availability guidance and current retailer evidence rather than assuming nationwide release means simultaneous local inventory." },
    ],
    sources: [{ label: "United States of Bourbon", url: "https://www.lostlanternwhiskey.com/united-states-of-bourbon/", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "frey-ranch-10-year-bourbon-batch-one",
    eyebrow: "Bottle guide",
    title: "Frey Ranch 10 Year moves from lottery to watchlist",
    dek: "The Nevada farm distillery's oldest standalone whiskey begins its post-lottery shipment and secondary availability window.",
    summary: "Frey Ranch 10-Year-Old Bourbon Batch #1 launched through an official lottery. After the lottery, hunters should rely on producer updates and current retail evidence rather than stale entry pages.",
    startDate: "2026-07-01",
    dateLabel: "Shipping window",
    status: "watch",
    states: ["Nevada", "Nationwide"],
    bottle: "Frey Ranch 10-Year-Old Bourbon Batch #1",
    availability: "Lottery release and limited follow-on distribution",
    updatedAt: "2026-07-10",
    facts: [
      { label: "Age", value: "10 years" },
      { label: "Batch", value: "No. 1" },
      { label: "Origin", value: "Nevada" },
      { label: "Status", value: "Post-lottery watch" },
    ],
    sections: [
      { heading: "Bottle profile", body: "Batch #1 is Frey Ranch's oldest standalone whiskey and extends the distillery's estate-grown story into a mature age-stated release." },
      { heading: "Lottery context", body: "The launch lottery established scarcity and initial allocation. Closed lottery pages are historical release evidence, not current inventory." },
      { heading: "What to watch", body: "Producer shipment updates, state listings, retailer records, and fresh sightings are the useful next evidence after the lottery stage." },
    ],
    sources: [{ label: "Frey Ranch 10 Year lottery", url: "https://freyranch.runfair.com/en-US/us/frey-ranch-10-year-old-bourbon-batch-1", type: "official" }],
  },
];

export const stateGuides: StateGuide[] = [
  {
    slug: "virginia",
    state: "Virginia",
    abbreviation: "VA",
    title: "Where to find allocated bourbon in Virginia",
    dek: "A practical guide to Virginia ABC lotteries, limited-availability releases, store pickup, and the signals that matter before a bottle reaches a shelf.",
    model: "Control state · Virginia ABC",
    updatedAt: "2026-07-10",
    quickFacts: [
      { label: "System", value: "State-controlled retail" },
      { label: "Limited bottles", value: "Lottery and limited-availability channels" },
      { label: "Best source", value: "Virginia ABC" },
      { label: "Key caution", value: "A listing is not shelf confirmation" },
    ],
    sections: [
      { heading: "How Virginia releases allocated bourbon", body: "Virginia ABC controls spirits retail and publishes official processes for limited-availability products. Selected bottles use online lotteries with defined entry, winner, store-selection, and pickup rules; other limited products can follow separate distribution procedures." },
      { heading: "Where hunters should look", body: "Start with Virginia ABC's lottery and limited-availability pages. A dated official entry window is highly actionable. Product catalog records and broad announcements are weaker than a current lottery, store record, or confirmed pickup instruction." },
      { heading: "How Bourbon Signal interprets Virginia", body: "Bourbon Signal distinguishes official release evidence from exact-store inventory. Lottery dates are deadline intelligence; store-level claims require a current store source or member report." },
      { heading: "What to avoid", body: "Do not treat an old lottery page, a product listing, or a national press release as proof that a Virginia store has a bottle available now." },
    ],
    sources: [
      { label: "Virginia ABC lottery portal", url: "https://www.abc.virginia.gov/lotto/", type: "state" },
      { label: "Virginia limited availability", url: "https://www.abc.virginia.gov/products/limited-availability", type: "state" },
    ],
  },
  {
    slug: "north-carolina",
    state: "North Carolina",
    abbreviation: "NC",
    title: "Where to find allocated bourbon in North Carolina",
    dek: "North Carolina is a control state with locally operated ABC boards, so useful bourbon intelligence often begins at the board level before it reaches a specific store.",
    model: "Control state · Local ABC boards",
    updatedAt: "2026-07-10",
    quickFacts: [
      { label: "System", value: "State control with local boards" },
      { label: "Inventory shape", value: "Board and store dependent" },
      { label: "Best source", value: "NC ABCC plus local boards" },
      { label: "Key caution", value: "Board shipment is not exact shelf stock" },
    ],
    sections: [
      { heading: "How North Carolina releases allocated bourbon", body: "The state commission governs the system while local ABC boards operate stores and local release procedures. Allocation, shipment, event, and lottery practices can differ by board." },
      { heading: "Why board-level intelligence matters", body: "A board can receive or report a shipment without confirming which store has a bottle available. Board-level evidence is useful for narrowing the hunt, but it should be labeled as an area lead." },
      { heading: "How Bourbon Signal interprets North Carolina", body: "State filters remain board-oriented while individual signal details preserve city, county, store, and source precision when available. Exact-store claims require exact-store evidence." },
      { heading: "Where hunters should look", body: "Use the NC ABC Commission for statewide policy and pricing, then consult the relevant local board for release events, lottery rules, store information, and local announcements." },
    ],
    sources: [
      { label: "North Carolina ABC Commission", url: "https://www.abc.nc.gov/", type: "state" },
      { label: "NC spirituous liquor pricing", url: "https://www.abc.nc.gov/spirituous-liquor-pricing", type: "state" },
    ],
  },
  {
    slug: "pennsylvania",
    state: "Pennsylvania",
    abbreviation: "PA",
    title: "Where to find allocated bourbon in Pennsylvania",
    dek: "Pennsylvania's Fine Wine & Good Spirits system centralizes official product and release information, but online listings still require careful freshness and fulfillment checks.",
    model: "Control state · Fine Wine & Good Spirits",
    updatedAt: "2026-07-10",
    quickFacts: [
      { label: "System", value: "State-controlled retail" },
      { label: "Primary channel", value: "Fine Wine & Good Spirits" },
      { label: "Limited releases", value: "Online, lottery, and designated channels" },
      { label: "Key caution", value: "Catalog presence is not live availability" },
    ],
    sections: [
      { heading: "How Pennsylvania releases allocated bourbon", body: "The Pennsylvania Liquor Control Board operates Fine Wine & Good Spirits and controls official retail channels. Highly sought products may use limited-release pages, lotteries, online allocation, or designated store distribution." },
      { heading: "How to read an online listing", body: "A product page can establish that a bottle exists in the state system while quantity, fulfillment, pickup, and freshness determine whether it is actionable. Catalog-only records should not be presented as live stock." },
      { heading: "How Bourbon Signal interprets Pennsylvania", body: "Bourbon Signal favors current official availability evidence and preserves source timestamps. Stale or non-fulfillable records should remain release intelligence rather than live alerts." },
      { heading: "Where hunters should look", body: "Use Fine Wine & Good Spirits' official limited-release and lottery surfaces, then verify current purchase or pickup terms before traveling." },
    ],
    sources: [
      { label: "Fine Wine & Good Spirits", url: "https://www.finewineandgoodspirits.com/", type: "state" },
      { label: "PLCB limited-release lotteries", url: "https://www.pa.gov/agencies/lcb/consumers/limited-release-lotteries.html", type: "state" },
    ],
  },
];

const pathKinds: Record<string, RadarKind> = {
  releases: "release",
  lotteries: "lottery",
  events: "event",
  bottles: "bottle",
};

export function radarPath(entry: Pick<RadarEntry, "kind" | "slug">) {
  const segment = entry.kind === "lottery" ? "lotteries" : `${entry.kind}s`;
  return `/release-radar/${segment}/${entry.slug}`;
}

export function getRadarEntry(kind: RadarKind, slug: string) {
  return radarEntries.find((entry) => entry.kind === kind && entry.slug === slug);
}

export function getRadarEntryByPath(pathKind: string, slug: string) {
  const kind = pathKinds[pathKind];
  return kind ? getRadarEntry(kind, slug) : undefined;
}

export function getEntriesByKind(kind: RadarKind) {
  return radarEntries.filter((entry) => entry.kind === kind);
}

export function getUpcomingEntries(fromDate: string) {
  return radarEntries
    .filter((entry) => entry.endDate ? entry.endDate >= fromDate : entry.startDate >= fromDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getStateGuide(slug: string) {
  return stateGuides.find((guide) => guide.slug === slug);
}

export function radarPathKinds() {
  return Object.keys(pathKinds);
}
