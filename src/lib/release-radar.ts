import { radarExpansionSeeds } from "./release-radar-expansion.ts";

export type RadarKind = "release" | "lottery" | "event" | "bottle";
export type RadarVerificationStatus = "official" | "verified";
export type RadarDatePrecision = "exact" | "window";

export interface RadarMarket {
  code: string;
  label: string;
  scope: "national" | "state";
}

export interface RadarBottleRelation {
  canonicalId: string;
  canonicalName: string;
  relationship: "featured" | "included" | "related";
}

export interface RadarRelationship {
  targetSlug: string;
  relationship: "related" | "same_series";
}

export interface RadarOccurrence {
  date: string;
  label: string;
  schemaStartDate?: string;
  schemaEndDate?: string;
}

export const releaseRadarUpdatedAt = "2026-07-21";

export interface RadarSource {
  label: string;
  url: string;
  type: "official" | "state" | "press";
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
  occurrences?: RadarOccurrence[];
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
  datePrecision: RadarDatePrecision;
  verificationStatus: RadarVerificationStatus;
  availabilitySemantics: "announcement_only";
  followEligibility: {
    release: boolean;
    bottle: boolean;
  };
  markets: RadarMarket[];
  bottleRelations: RadarBottleRelation[];
  relationships: RadarRelationship[];
  updatedAt: string;
  facts: Array<{ label: string; value: string }>;
  sections: Array<{ heading: string; body: string }>;
  sources: RadarSource[];
}

export type RadarEntrySeed = Omit<RadarEntry,
  "datePrecision" |
  "verificationStatus" |
  "availabilitySemantics" |
  "followEligibility" |
  "markets" |
  "bottleRelations" |
  "relationships"
>;

export interface StateGuideBoardProfile {
  name: string;
  area: string;
  releaseMethods: string[];
  guidance: string;
  sourceUrl: string;
}

export interface StateGuideEvidenceLevel {
  label: string;
  strength: "Context" | "Area lead" | "Store lead" | "Current confirmation";
  meaning: string;
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
  boardProfiles?: StateGuideBoardProfile[];
  huntingSteps?: Array<{ title: string; body: string }>;
  evidenceLevels?: StateGuideEvidenceLevel[];
  faqs?: Array<{ question: string; answer: string }>;
  sources: RadarSource[];
}

const radarEntrySeeds: RadarEntrySeed[] = [
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
  {
    kind: "event",
    slug: "buffalo-trace-bourbon-backyard-2026",
    eyebrow: "Distillery event",
    title: "Buffalo Trace opens its Bourbon Backyard for the summer",
    calendar: true,
    dek: "Daily outdoor programming runs through Labor Day with live music, food, tastings, and selected reservation-only experiences.",
    summary: "Buffalo Trace lists Bourbon Backyard every day from July 4 through September 7. Walk-ins are welcome for the grounds, while selected experiences require reservations.",
    startDate: "2026-07-04",
    endDate: "2026-09-07",
    dateLabel: "Jul 4–Sep 7",
    status: "open",
    states: ["Kentucky"],
    location: "Frankfort, Kentucky",
    availability: "Daily access; some experiences require reservations",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Dates", value: "July 4–September 7" },
      { label: "Venue", value: "Buffalo Trace Distillery" },
      { label: "Access", value: "Walk-ins welcome" },
      { label: "Caution", value: "Check reservations by experience" },
    ],
    sections: [
      { heading: "What is happening", body: "Bourbon Backyard adds seasonal food, live music, tastings, and hosted programming to the normal Buffalo Trace visitor experience." },
      { heading: "Planning the visit", body: "The grounds welcome walk-ins, but the official event page identifies experiences that need advance reservations. Check the daily schedule before traveling." },
      { heading: "Availability context", body: "This event does not promise a particular bottle. Buffalo Trace publishes its distillery gift-shop availability separately and can change the daily offering." },
    ],
    sources: [{ label: "Buffalo Trace Bourbon Backyard", url: "https://www.buffalotracedistillery.com/visit-us/distillery-events/bourbon-backyard/", type: "official" }],
  },
  {
    kind: "event",
    slug: "bourbon-women-siposium-2026",
    eyebrow: "Bourbon conference",
    title: "Bourbon Women SIPosium returns to Louisville",
    calendar: true,
    dek: "Four days of tastings, education, distillery access, and industry programming bring a national bourbon audience to Louisville.",
    summary: "The Kentucky Bourbon Trail calendar lists the 2026 Bourbon Women SIPosium for August 13–16 in Louisville. Registration and session availability should be confirmed with the organizer.",
    startDate: "2026-08-13",
    endDate: "2026-08-16",
    dateLabel: "Aug 13–16",
    status: "upcoming",
    states: ["Kentucky"],
    location: "Louisville, Kentucky",
    availability: "Registration required",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Dates", value: "August 13–16" },
      { label: "City", value: "Louisville" },
      { label: "Format", value: "Conference and distillery events" },
      { label: "Action", value: "Review registration options" },
    ],
    sections: [
      { heading: "What it is", body: "SIPosium combines whiskey education, tastings, networking, and destination programming in one multi-day schedule." },
      { heading: "Why it is on the radar", body: "Capacity, hotel timing, and individual sessions make the registration window more useful than a general event announcement." },
      { heading: "Before booking", body: "Use the official organizer for tickets, age requirements, session access, transfers, and cancellation terms." },
    ],
    sources: [{ label: "Kentucky Bourbon Trail event listing", url: "https://kybourbontrail.com/event/bourbon-women-siposium-4/", type: "official" }],
  },
  {
    kind: "event",
    slug: "kentucky-bourbon-festival-2026",
    eyebrow: "Bourbon festival",
    title: "Kentucky Bourbon Festival marks its 35th anniversary",
    calendar: true,
    dek: "Bardstown's four-day festival returns with distillery programming, tastings, education, and ticketed bourbon experiences.",
    summary: "The Kentucky Bourbon Trail lists the Kentucky Bourbon Festival for September 10–13, 2026, in Bardstown. Individual events and admission levels can sell separately.",
    startDate: "2026-09-10",
    endDate: "2026-09-13",
    dateLabel: "Sep 10–13",
    status: "upcoming",
    states: ["Kentucky"],
    location: "Bardstown, Kentucky",
    availability: "Ticketed festival",
    featured: true,
    updatedAt: "2026-07-12",
    facts: [
      { label: "Dates", value: "September 10–13" },
      { label: "Edition", value: "35th anniversary" },
      { label: "City", value: "Bardstown" },
      { label: "Action", value: "Check ticket availability" },
    ],
    sections: [
      { heading: "The event", body: "The Kentucky Bourbon Festival brings producers and enthusiasts together in Bardstown for four days of tastings, classes, dinners, and brand programming." },
      { heading: "Ticket context", body: "Festival admission does not necessarily include every premium experience. Review the official schedule and ticket inclusions before making travel plans." },
      { heading: "Bottle context", body: "Special releases may appear around festival week, but only a dated official producer, retailer, or festival source should be treated as a confirmed bottle opportunity." },
    ],
    sources: [{ label: "Kentucky Bourbon Festival listing", url: "https://kybourbontrail.com/event/kentucky-bourbon-festival-5/", type: "official" }],
  },
  {
    kind: "event",
    slug: "kentucky-bourbon-trail-2026-expansion",
    eyebrow: "Trail expansion",
    title: "Kentucky Bourbon Trail adds ten new stops for 2026",
    dek: "The official trail expands with new distillery and tasting-room experiences across Kentucky, including Lexington, Frankfort, Louisville, and Western Kentucky.",
    summary: "The Kentucky Distillers' Association announced ten additions to the Kentucky Bourbon Trail for 2026, broadening the official visitor map beyond its established destinations.",
    startDate: "2026-01-30",
    dateLabel: "2026 expansion",
    status: "announced",
    states: ["Kentucky"],
    location: "Kentucky",
    availability: "Visitor hours and reservations vary by stop",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Added", value: "10 visitor experiences" },
      { label: "Coverage", value: "Multiple Kentucky regions" },
      { label: "Source", value: "Kentucky Bourbon Trail" },
      { label: "Action", value: "Check each stop before travel" },
    ],
    sections: [
      { heading: "What changed", body: "The 2026 additions extend the official Bourbon Trail with a mix of established brands, craft producers, and new visitor experiences." },
      { heading: "Why it matters", body: "More official stops create new tour, tasting, and distillery-exclusive opportunities, but operating schedules and reservation requirements differ by destination." },
      { heading: "Before visiting", body: "Use each destination's current official listing for opening status, tour inventory, bottle policies, and accessibility rather than relying on a static trail announcement." },
    ],
    sources: [{ label: "Kentucky Bourbon Trail expansion", url: "https://kybourbontrail.com/fresh-faces-bold-flavors-meet-the-newest-kentucky-bourbon-trail-stops/", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "heaven-hill-grain-to-glass-year-of-wheat-2026",
    eyebrow: "Bottle guide",
    title: "Heaven Hill makes 2026 its Year of Wheat",
    dek: "Three allocated Grain to Glass wheated bourbons cover a six-year traditional release, full French-oak maturation, and a one-time nine-year expression.",
    summary: "Heaven Hill announced three nationally allocated Grain to Glass releases for 2026. The traditional six-year edition began shipping in May; the French Oak and Extra Aged releases are scheduled for later in the year.",
    startDate: "2026-06-01",
    dateLabel: "2026 collection",
    status: "releasing",
    states: ["Nationwide"],
    bottle: "Heaven Hill Grain to Glass 2026 Wheated Bourbon Collection",
    availability: "Allocated national release",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Traditional", value: "6 years · 107.8 proof · $99.99" },
      { label: "French Oak", value: "6+ years · $129.99" },
      { label: "Extra Aged", value: "9 years · $149.99" },
      { label: "Mashbill", value: "52% corn · 35% wheat · 13% malt" },
    ],
    sections: [
      { heading: "The collection", body: "The third traditional wheated-bourbon release is joined by a whiskey aged entirely in French oak and an ultra-limited nine-year bourbon." },
      { heading: "Release timing", body: "Heaven Hill says the traditional edition began shipping in May and was expected in market by June. The French Oak and nine-year releases are planned for later in 2026." },
      { heading: "Availability context", body: "All three are allocated national releases. The producer announcement establishes the release window, while current retailer or state evidence is still required for exact availability." },
    ],
    sources: [{ label: "Heaven Hill Year of Wheat announcement", url: "https://blog.heavenhilldistillery.com/detail.php?post_name=heaven-hill-distillery-announces-2026-year-of-wheat-grain-to-glass-releases", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "rittenhouse-250th-anniversary-10-year-2026",
    eyebrow: "Bottle guide",
    title: "Rittenhouse marks America's 250th with a 10-year bonded rye",
    dek: "A commemorative Bottled-in-Bond release connects Rittenhouse's Pennsylvania roots to the United States semiquincentennial.",
    summary: "Heaven Hill launched the Rittenhouse United States 250th Anniversary Commemorative Edition in May 2026 as a limited 10-year Bottled-in-Bond rye.",
    startDate: "2026-05-21",
    dateLabel: "May 2026 release",
    status: "watch",
    states: ["Pennsylvania", "Nationwide"],
    bottle: "Rittenhouse United States 250th Anniversary 10 Year",
    availability: "Limited commemorative release",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Age", value: "10 years" },
      { label: "Bonded", value: "100 proof" },
      { label: "Style", value: "Straight rye whisky" },
      { label: "Release", value: "May 2026" },
    ],
    sections: [
      { heading: "Bottle profile", body: "The commemorative edition is a ten-year Bottled-in-Bond rye built around Rittenhouse's historic Pennsylvania identity." },
      { heading: "Release context", body: "The bottle launched in May 2026 as part of the United States 250th anniversary calendar." },
      { heading: "Hunting context", body: "A national announcement does not establish current shelf inventory. Pennsylvania and other state listings should be checked for current fulfillment evidence." },
    ],
    sources: [{ label: "Heaven Hill Rittenhouse announcement", url: "https://blog.heavenhilldistillery.com/detail.php?post_name=heaven-hill-distillery-unveils-rittenhouse-united-states-250th-anniversary-commemorative-edition-straight-rye-whisky", type: "official" }],
  },
  {
    kind: "bottle",
    slug: "four-roses-single-barrel-collection-2026",
    eyebrow: "Bottle guide",
    title: "Four Roses rotates its Single Barrel Collection for 2026",
    dek: "The annual recipe-led collection returns with a 100-proof release aged seven to nine years.",
    summary: "Four Roses' official Single Barrel Collection page identifies the 2026 release as 100 proof and aged seven to nine years. Market timing and recipe availability can vary.",
    startDate: "2026-07-01",
    dateLabel: "2026 release",
    status: "watch",
    states: ["Nationwide"],
    bottle: "Four Roses Single Barrel Collection 2026 Release",
    availability: "Limited recipe-led release",
    updatedAt: "2026-07-12",
    facts: [
      { label: "Proof", value: "100" },
      { label: "Age", value: "7–9 years" },
      { label: "Collection", value: "Single Barrel" },
      { label: "Status", value: "2026 release watch" },
    ],
    sections: [
      { heading: "Bottle profile", body: "Four Roses uses its distinct bourbon recipes to build a rotating limited Single Barrel Collection rather than one uniform annual bottle." },
      { heading: "What is confirmed", body: "The official 2026 listing identifies a 100-proof bourbon aged between seven and nine years." },
      { heading: "Availability context", body: "Recipe, state, and retailer availability can differ. Current official or retail evidence is needed before treating a release listing as local stock." },
    ],
    sources: [{ label: "Four Roses Single Barrel Collection", url: "https://www.fourrosesbourbon.com/bourbon/single-barrel-collection", type: "official" }],
  },
  {
    kind: "release",
    slug: "alabama-abc-annual-fall-whiskey-release-2026",
    eyebrow: "Alabama ABC release",
    title: "Alabama ABC sets its Annual Fall Whiskey Release",
    dek: "Alabama's official 2026 release schedule gives hunters one exact date for the state's fall whiskey event.",
    summary: "Alabama ABC's official 2026 schedule lists the Annual Fall Whiskey Release for Saturday, December 12, 2026. The announcement establishes an event date, not bottle-level inventory, store assignments, quantities, or a purchase guarantee.",
    startDate: "2026-12-12",
    dateLabel: "Dec 12, 2026",
    status: "announced",
    states: ["Alabama"],
    location: "Alabama",
    availability: "Official release-event announcement",
    featured: true,
    calendar: true,
    updatedAt: "2026-07-18",
    facts: [
      { label: "Date", value: "Saturday, December 12, 2026" },
      { label: "Authority", value: "Alabama ABC Board" },
      { label: "Signal", value: "Release event" },
      { label: "Not confirmed", value: "Store inventory or bottle allocation" },
    ],
    sections: [
      { heading: "What is confirmed", body: "Alabama ABC's official 2026 Limited Release Schedule names the Annual Fall Whiskey Release and assigns it to Saturday, December 12, 2026." },
      { heading: "What the date does not mean", body: "This is an official event announcement, not a current shelf-inventory signal. The reviewed source does not establish bottle names, store assignments, quantities, or purchase eligibility." },
      { heading: "Keep watching", body: "Alabama ABC's quarterly FAQ lists August 3–23 registration dates for September Bourbon Heritage Month while event weeks remain to be determined. Treat that as process guidance until Alabama ABC publishes the event details." },
    ],
    sources: [
      { label: "Alabama ABC 2026 Limited Release Schedule", url: "https://alabcboard.gov/sites/default/files/2026-01/2026%20Limited%20Release%20Schedule.pdf", type: "state" },
      { label: "Alabama ABC annual release products", url: "https://alabcboard.gov/stores/events/limited-release-programs/annual/price-products", type: "state" },
      { label: "Alabama ABC quarterly FAQ", url: "https://alabcboard.gov/stores/events/limited-release-programs/quarterly/FAQ", type: "state" },
    ],
  },
];

const STATE_MARKETS: Record<string, RadarMarket> = {
  Kentucky: { code: "KY", label: "Kentucky", scope: "state" },
  Nevada: { code: "NV", label: "Nevada", scope: "state" },
  Pennsylvania: { code: "PA", label: "Pennsylvania", scope: "state" },
  Virginia: { code: "VA", label: "Virginia", scope: "state" },
  Alabama: { code: "AL", label: "Alabama", scope: "state" },
  "North Carolina": { code: "NC", label: "North Carolina", scope: "state" },
  Texas: { code: "TX", label: "Texas", scope: "state" },
  Nationwide: { code: "US", label: "Nationwide", scope: "national" },
};

const CANONICAL_BOTTLES: Record<string, RadarBottleRelation[]> = {
  "four-roses-anthology-chapter-one-origin": [{
    canonicalId: "bb_c4536a79e74352d9",
    canonicalName: "Four Roses Anthology Chapter One: Origin",
    relationship: "featured",
  }],
  "heaven-hill-heritage-collection-22-year-2026": [{
    canonicalId: "bb_216abc00853a667f",
    canonicalName: "Heaven Hill Heritage Collection",
    relationship: "featured",
  }],
  "old-fitzgerald-bottled-in-bond-spring-2026": [{
    canonicalId: "bb_a85df59577c72709",
    canonicalName: "Old Fitzgerald Bottled-in-Bond Decanter Series",
    relationship: "featured",
  }],
  "elijah-craig-21-year-single-barrel-2026": [{
    canonicalId: "bb_7bb808afdb3c6530",
    canonicalName: "Elijah Craig 21-Year-Old Single Barrel",
    relationship: "featured",
  }],
  "lost-lantern-united-states-of-bourbon-1776": [{
    canonicalId: "bb_33af7fce81b3c599",
    canonicalName: "Lost Lantern United States of Bourbon: 1776 Edition",
    relationship: "featured",
  }],
  "frey-ranch-10-year-bourbon-batch-one": [{
    canonicalId: "bb_f8bbbae868f9f21f",
    canonicalName: "Frey Ranch 10-Year-Old Bourbon Batch 1",
    relationship: "featured",
  }],
  "heaven-hill-grain-to-glass-year-of-wheat-2026": [{
    canonicalId: "bb_f2af0db35c8d2aea",
    canonicalName: "Heaven Hill Grain to Glass Third Edition Wheated Bourbon",
    relationship: "featured",
  }],
  "rittenhouse-250th-anniversary-10-year-2026": [{
    canonicalId: "bb_4f13269581f5a14b",
    canonicalName: "Rittenhouse United States 250th Anniversary 10 Year",
    relationship: "featured",
  }],
  "four-roses-single-barrel-collection-2026": [{
    canonicalId: "bb_1035b7107992dc95",
    canonicalName: "Four Roses Single Barrel Collection 2026",
    relationship: "featured",
  }],
};

const ENTRY_RELATIONSHIPS: Record<string, RadarRelationship[]> = {
  "four-roses-anthology-chapter-one-origin": [{ targetSlug: "four-roses-single-barrel-collection-2026", relationship: "related" }],
  "four-roses-single-barrel-collection-2026": [{ targetSlug: "four-roses-anthology-chapter-one-origin", relationship: "related" }],
  "camp-buffalo-trace-2026": [{ targetSlug: "buffalo-trace-bourbon-backyard-2026", relationship: "related" }],
  "buffalo-trace-bourbon-backyard-2026": [{ targetSlug: "camp-buffalo-trace-2026", relationship: "related" }],
  "heaven-hill-heritage-collection-22-year-2026": [{ targetSlug: "old-fitzgerald-bottled-in-bond-spring-2026", relationship: "related" }],
  "old-fitzgerald-bottled-in-bond-spring-2026": [{ targetSlug: "heaven-hill-heritage-collection-22-year-2026", relationship: "related" }],
};

const VERIFIED_ENTRY_SLUGS = new Set([
  "bourbon-women-siposium-2026",
  "kentucky-bourbon-festival-2026",
]);

export const radarEntries: RadarEntry[] = [...radarEntrySeeds, ...radarExpansionSeeds].map((entry) => {
  const bottleRelations = CANONICAL_BOTTLES[entry.slug] || [];
  return {
    ...entry,
    calendar: entry.calendar === true,
    datePrecision: entry.calendar === true ? "exact" : "window",
    verificationStatus: VERIFIED_ENTRY_SLUGS.has(entry.slug) ? "verified" : "official",
    availabilitySemantics: "announcement_only",
    followEligibility: {
      release: entry.kind !== "bottle",
      bottle: bottleRelations.length > 0,
    },
    markets: entry.states.map((state) => STATE_MARKETS[state]).filter((market): market is RadarMarket => Boolean(market)),
    bottleRelations,
    relationships: ENTRY_RELATIONSHIPS[entry.slug] || [],
  };
});

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
    title: "North Carolina ABC bourbon releases, lotteries & allocated bottles",
    dek: "A practical guide to North Carolina's local ABC boards, bourbon lotteries, release events, inventory clues, and the difference between a board shipment and a bottle you can actually buy.",
    model: "Control state · Independent local ABC boards",
    updatedAt: "2026-07-21",
    quickFacts: [
      { label: "System", value: "State control with independent local boards" },
      { label: "Release playbook", value: "Varies by board" },
      { label: "Useful first clue", value: "Official board announcement or shipment" },
      { label: "Strongest evidence", value: "Fresh exact-store confirmation" },
    ],
    sections: [
      {
        heading: "How North Carolina's ABC system actually works",
        body: "North Carolina controls spirituous liquor at the state level, but the stores are run by county and municipal ABC boards. The NC ABC Commission approves products, manages statewide regulation and distribution, and sets the official pricing structure. Local boards order product, operate stores, and set their own release procedures within state law. That split is why a bottle can be part of the North Carolina system without being available in your town.",
      },
      {
        heading: "Why there is no single NC bourbon drop schedule",
        body: "Local boards are independent political subdivisions, not branches of one statewide retail chain. One board may use an annual lottery, another may run periodic first-come drops, and another may announce a special event. A method that works in Raleigh can be useless in Charlotte or Wilmington. Start with the board that serves the area where you can actually shop, then follow its official channels.",
      },
      {
        heading: "How allocated bourbon reaches customers",
        body: "North Carolina boards use several fair-distribution methods for scarce bottles: resident lotteries, drawings for purchase order, ticketed or first-come release events, recurring drops, and occasional grand-opening events. The rules belong to the specific board and event. Entry eligibility, geography, pickup location, bottle choice, and deadlines can all change, so the current official notice always outranks an old recap or social post.",
      },
      {
        heading: "What the state price and allocated lists can tell you",
        body: "The NC ABC Commission's price reports can confirm that a product is approved for sale, show its North Carolina code, and identify products classified for allocated or limited distribution. That is useful context, not a store locator. A statewide listing does not tell you that a local board ordered the bottle, received it, or placed it on a shelf.",
      },
      {
        heading: "Board shipment does not mean shelf inventory",
        body: "A shipment tied to a local board is a meaningful area lead. It says the hunt has narrowed from statewide possibility to a particular board, but it does not identify the receiving store or prove that the product is available for public sale. Bottles may still be in transit, awaiting board processing, reserved for a lottery or event, or already sold. Bourbon Signal keeps board-level evidence separate from exact-store inventory for that reason.",
      },
      {
        heading: "The major local release channels",
        body: "Mecklenburg publishes specialty-product lottery and Barrelpalooza information. Wake maintains a lottery page and a separate inventory search. Durham currently describes weekly allocated drops, an annual lottery, and special release events. Greensboro uses periodic drawings for a place in line, while New Hanover points hunters to its allocated-release newsletter. These are separate local programs, not one statewide calendar.",
      },
      {
        heading: "A smarter way to hunt North Carolina bourbon",
        body: "Pick the boards you can reasonably visit. Bookmark their official lottery, news, and inventory pages; join only the mailing lists they publish; and note the exact eligibility rules before entering. Use board shipments as an early clue, then wait for a board announcement, exact-store record, or current member sighting before making a drive. The goal is not to chase every rumor. It is to know which clues deserve your time.",
      },
      {
        heading: "How Bourbon Signal reads North Carolina evidence",
        body: "Bourbon Signal keeps customer filters at the board level because that matches how North Carolina distributes and communicates. Inside each signal, we preserve the more precise city, county, store, timestamp, and source when those details exist. Board shipments can inform the hunt, but they cannot independently trigger an exact-inventory alert. Fresh store-bound evidence carries more weight.",
      },
    ],
    boardProfiles: [
      {
        name: "Mecklenburg County ABC",
        area: "Charlotte and Mecklenburg County",
        releaseMethods: ["Lottery", "Barrelpalooza", "Mailing list"],
        guidance: "Use the official specialty-products page for lottery notices and Barrelpalooza details. Event administration can include an on-site drawing, so read the current rules before traveling.",
        sourceUrl: "https://www.meckabc.com/store_operations/specialty_products_lottery.php",
      },
      {
        name: "Wake County ABC",
        area: "Raleigh and Wake County",
        releaseMethods: ["Lottery", "Inventory search", "Board notices"],
        guidance: "Wake's lottery page carries the current status and event rules. Its inventory search is a useful store lead, but Wake warns that quantities can be affected by pending deliveries and account purchases.",
        sourceUrl: "https://wakeabc.com/lottery/",
      },
      {
        name: "Durham County ABC",
        area: "Durham County",
        releaseMethods: ["Weekly drops", "Annual lottery", "Special events"],
        guidance: "Durham's official bourbon page currently describes roughly 100 allocated bottles dropping weekly at participating stores, plus a fall-and-winter lottery and periodic events. Check the board's news before acting because timing and locations can change.",
        sourceUrl: "https://www.durhamabc.com/bourbon",
      },
      {
        name: "Greensboro ABC",
        area: "Greensboro",
        releaseMethods: ["Periodic drawings", "Special events", "Store tastings"],
        guidance: "Greensboro publishes exact store tasting dates, times, products, and age requirements on its events calendar. Its separate lottery is a drawing for a place in line to purchase rare products, not a free bottle or a guaranteed first choice.",
        sourceUrl: "https://www.greensboroabc.com/greensboro-abc-lottery/",
      },
      {
        name: "New Hanover County ABC",
        area: "Wilmington and New Hanover County",
        releaseMethods: ["Allocated drops", "Bourbon newsletter"],
        guidance: "New Hanover's official allocated-product guidance says scarce products become available periodically and points hunters to its Bourbon Blast newsletter for special-release notices. Check the current notice for timing and eligibility.",
        sourceUrl: "https://www.newhanovercountyabc.com/special-order-items/",
      },
      {
        name: "Triad Municipal ABC",
        area: "Winston-Salem, Lewisville and parts of Forsyth County",
        releaseMethods: ["Board announcements"],
        guidance: "Triad ABC does not publish the same standing bourbon program as Durham or Mecklenburg on the official pages reviewed for this update. Use the board's current store-services and contact information rather than borrowing another board's release routine.",
        sourceUrl: "https://triadabc.org/store-services/",
      },
    ],
    huntingSteps: [
      { title: "Choose your boards", body: "Follow the boards you can realistically visit. North Carolina release rules are local, so a statewide rumor is rarely enough." },
      { title: "Watch official channels", body: "Use board lottery pages, news posts, inventory tools, and published mailing lists. Check the date before trusting a page." },
      { title: "Read the evidence level", body: "A state listing confirms context. A board shipment narrows the area. A fresh store record or sighting is the strongest reason to act." },
      { title: "Check the rules", body: "Confirm residency, entry limits, purchase order, identification, pickup window, and whether the event is first-come or randomized." },
      { title: "Make the trip count", body: "Recheck the source shortly before leaving. Scarce inventory moves quickly, and even a good lead is not a hold request." },
    ],
    evidenceLevels: [
      { label: "State product or price listing", strength: "Context", meaning: "The bottle is recognized in North Carolina's system. It does not establish a local shipment or store quantity." },
      { label: "Local board shipment", strength: "Area lead", meaning: "The board is tied to incoming product. The receiving store, release method, and public sale timing may still be unknown." },
      { label: "Fresh exact-store record", strength: "Store lead", meaning: "A current source identifies a store. Verify timestamp and fulfillment details before driving." },
      { label: "Current shelf report or member sighting", strength: "Current confirmation", meaning: "A recent human or retailer report is the closest evidence to shelf reality, but another buyer can still beat you there." },
    ],
    faqs: [
      { question: "Does North Carolina ABC publish live bourbon inventory?", answer: "There is no single statewide, real-time shelf inventory covering every local ABC store. Some boards publish their own inventory searches or announcements. Their freshness and quantity meanings differ, so each source has to be read on its own terms." },
      { question: "When do NC ABC stores release allocated bourbon?", answer: "There is no universal release day. Local boards choose their own mix of lotteries, scheduled events, recurring drops, drawings, and ordinary store placement. Follow the official board serving your area." },
      { question: "Are all North Carolina bourbon lotteries open statewide?", answer: "No. Eligibility is set by the local board and can be limited by county, nearby counties, residency, age, or customer type. Read the current rules before entering; last year's terms may not apply." },
      { question: "Is a board shipment the same as store availability?", answer: "No. A board shipment is an area-level clue. It does not name the receiving store, prove the bottle has reached a shelf, or show whether it is being held for a lottery or event." },
      { question: "Are liquor prices the same across North Carolina ABC stores?", answer: "North Carolina law generally requires uniform retail pricing for spirituous liquor unless the ABC law provides otherwise. Monthly reductions and the current official price list still matter, so check the Commission's latest report." },
      { question: "Can I special-order an allocated bourbon?", answer: "The state's special-order process is mainly for products not on the approved price list. It is not a shortcut around a local board's allocation, lottery, or limited-distribution rules. Ask your local board about the exact product." },
      { question: "Can an ABC store hold an allocated bottle for me?", answer: "Do not assume it can. Hold and purchase procedures belong to the local board and may be stricter for high-demand products. Use the board's written policy or contact it directly rather than relying on a rule from another county." },
      { question: "What is the fastest reliable way to track NC bourbon releases?", answer: "Combine official board notices with source-timestamped local evidence. Lotteries and events need deadline tracking; board shipments need store confirmation; exact-store signals need a freshness check. Each clue answers a different part of the hunt." },
    ],
    sources: [
      { label: "About the NC ABC Commission", url: "https://www.abc.nc.gov/about-nc-abc-commission", type: "state" },
      { label: "NC ABC boards and stores", url: "https://www.abc.nc.gov/nc-abc-boards-and-stores", type: "state" },
      { label: "NC ABC pricing reports and allocated list", url: "https://www.abc.nc.gov/pricing/pricing-reports", type: "state" },
      { label: "NC ABC special orders", url: "https://www.abc.nc.gov/pricing/special-orders", type: "state" },
      { label: "Mecklenburg specialty products", url: "https://www.meckabc.com/store_operations/specialty_products_lottery.php", type: "state" },
      { label: "Wake County ABC lottery", url: "https://wakeabc.com/lottery/", type: "state" },
      { label: "Wake County inventory search", url: "https://wakeabc.com/search-our-inventory/", type: "state" },
      { label: "Durham bourbon programs", url: "https://www.durhamabc.com/bourbon", type: "state" },
      { label: "Greensboro ABC lottery", url: "https://www.greensboroabc.com/greensboro-abc-lottery/", type: "state" },
      { label: "Greensboro ABC events", url: "https://www.greensboroabc.com/about/events/", type: "state" },
      { label: "New Hanover County allocated products", url: "https://www.newhanovercountyabc.com/special-order-items/", type: "state" },
      { label: "Triad ABC store services", url: "https://triadabc.org/store-services/", type: "state" },
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
      { label: "Fine Wine & Good Spirits limited-release lottery", url: "https://www.finewineandgoodspirits.com/en/limited-release-lottery", type: "state" },
    ],
  },
  {
    slug: "kentucky",
    state: "Kentucky",
    abbreviation: "KY",
    title: "Where to find limited bourbon in Kentucky",
    dek: "Kentucky combines independent retail, distillery gift shops, visitor releases, and a large tourism calendar rather than one centralized allocation system.",
    model: "Open market · Retailers and distilleries",
    updatedAt: "2026-07-12",
    quickFacts: [
      { label: "System", value: "Licensed private retail" },
      { label: "Key channels", value: "Retailers and distillery shops" },
      { label: "Visitor source", value: "Kentucky Bourbon Trail" },
      { label: "Key caution", value: "A release announcement is not store inventory" },
    ],
    sections: [
      { heading: "How Kentucky releases limited bourbon", body: "Kentucky does not route scarce bottles through one statewide consumer portal. National allocations, retailer programs, distillery gift-shop releases, special events, and local drawings can all operate independently." },
      { heading: "Why distillery evidence matters", body: "A distillery can be the first official channel for a limited bottle or visitor-exclusive release. Gift-shop availability is often day-specific and should not be extrapolated beyond the producer's current notice." },
      { heading: "How Bourbon Signal interprets Kentucky", body: "Producer announcements define release windows; retailer and distillery records narrow them to a place. Exact shelf or gift-shop availability requires a current source with a timestamp." },
      { heading: "Where hunters should look", body: "Use official producer pages, the Kentucky Bourbon Trail map and events calendar, and current retailer or distillery availability pages. Confirm reservation and purchase rules before traveling." },
    ],
    sources: [
      { label: "Kentucky Bourbon Trail distilleries", url: "https://kybourbontrail.com/distillery/", type: "official" },
      { label: "Kentucky Department of Alcoholic Beverage Control", url: "https://abc.ky.gov/", type: "state" },
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

export function isRadarEntryAlertGrade(_entry: RadarEntry) {
  return false;
}

export function getTrackableBottleRelation(entry: RadarEntry) {
  if (!entry.followEligibility.bottle) return null;
  return entry.bottleRelations.find((relation) => relation.relationship === "featured") || entry.bottleRelations[0] || null;
}

export function getMarketHandoffHref(entry: RadarEntry, marketCode: string) {
  const market = marketCode.toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 20);
  const bottle = getTrackableBottleRelation(entry);
  if (bottle) {
    const params = new URLSearchParams({ q: bottle.canonicalName, source: "release_radar" });
    if (market && market !== "US") params.set("state", market);
    return `/bottle-check?${params.toString()}`;
  }
  const params = new URLSearchParams({ source: "release_radar" });
  if (market && market !== "US") params.set("state", market);
  return `/?${params.toString()}#drops`;
}
