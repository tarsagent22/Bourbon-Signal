export const RETAILER_PROSPECT_STATES = [
  "discovered",
  "qualified",
  "contact_verified",
  "draft_ready",
  "awaiting_approval",
  "approved",
  "contacted",
  "follow_up_due",
  "interested",
  "onboarding",
  "verified",
  "first_signal_live",
  "paused",
  "declined",
  "invalid",
] as const;

export type RetailerProspectState = typeof RETAILER_PROSPECT_STATES[number];
export type ProspectMessageStatus = "draft" | "approved" | "superseded";
export type ProspectOutreachKind = "initial" | "follow_up";
export type ProspectContactChannel = "email" | "phone" | "contact_form";
export type OfficialContactEvidenceKind = "official_website_email" | "official_website_phone" | "official_contact_form" | "regulator_listing";

export interface RegulatorAuthorityMetadata {
  id: string;
  name: string;
  domain: string;
}

export const OFFICIAL_REGULATOR_AUTHORITIES = [
  {
    id: "sc-dor-abl",
    name: "South Carolina Department of Revenue Alcohol Beverage Licensing",
    domain: "dor.sc.gov",
  },
  {
    id: "nc-abc-commission",
    name: "North Carolina Alcoholic Beverage Control Commission",
    domain: "abc.nc.gov",
  },
] as const satisfies readonly RegulatorAuthorityMetadata[];

export interface RetailerProspectInput {
  name?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  website?: unknown;
  listedPhone?: unknown;
}

export interface NormalizedRetailerProspect {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  website: string;
  listedPhone: string;
}

export interface OfficialContactEvidence {
  id?: string;
  kind: OfficialContactEvidenceKind;
  sourceUrl: string;
  contactValue: string;
  capturedAt: string;
  verifiedAt?: string;
  regulatorAuthority?: RegulatorAuthorityMetadata;
}

export interface RetailerProspectScoreInput {
  demand: {
    searches30d: number;
    savedAlerts: number;
    watchlistMatches: number;
  };
  coverage: {
    marketStores: number;
    coveredStores: number;
    citySignals30d: number;
  };
  fit: {
    independent: boolean;
    bourbonSpecialist: boolean;
    liveInventoryGap: boolean;
  };
  evidence: {
    officialContact: boolean;
    officialWebsite: boolean;
    physicalLocation: boolean;
  };
}

export interface RetailerProspectScore {
  total: number;
  scoreOutOf: 100;
  components: {
    demand: number;
    coverageGap: number;
    retailerFit: number;
    evidenceQuality: number;
  };
  inputs: RetailerProspectScoreInput;
  rationale: string[];
}

export interface ProspectMessageVersion {
  prospectId: string;
  version: number;
  channel: ProspectContactChannel;
  subject: string;
  body: string;
  status: ProspectMessageStatus;
}

export interface ProspectApprovalPacket {
  prospectId: string;
  retailer: NormalizedRetailerProspect & { id: string };
  score: RetailerProspectScore;
  officialContactEvidence: OfficialContactEvidence[];
  messageVersion: number;
  draft: ProspectMessageVersion;
  guardrails: string[];
}

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const VALID_STATE_CODES = new Set(Object.values(STATE_CODES));

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function titleCase(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/(^|[\s-])([a-z])/g, (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`);
}

function normalizeState(value: unknown) {
  const state = cleanText(value, 32);
  if (/^[a-z]{2}$/i.test(state) && VALID_STATE_CODES.has(state.toUpperCase())) return state.toUpperCase();
  return STATE_CODES[state.toLowerCase()] || "";
}

export function normalizeWebsite(value: unknown) {
  const website = cleanText(value, 500);
  if (!website) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "";
  }
}

export function normalizePhone(value: unknown) {
  const raw = cleanText(value, 64);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function normalizeRetailerProspect(input: RetailerProspectInput): { ok: boolean; value?: NormalizedRetailerProspect; error?: string } {
  const name = cleanText(input.name, 160);
  const address = cleanText(input.address, 240);
  const city = titleCase(cleanText(input.city, 100));
  const state = normalizeState(input.state);
  const postalCode = cleanText(input.postalCode, 12).toUpperCase();
  const websiteInput = cleanText(input.website, 500);
  const website = normalizeWebsite(websiteInput);
  const phoneInput = cleanText(input.listedPhone, 64);
  const listedPhone = normalizePhone(phoneInput);

  if (name.length < 2) return { ok: false, error: "Retailer name is required." };
  if (!state) return { ok: false, error: "A valid US state is required." };
  if (postalCode && !/^\d{5}(?:-\d{4})?$/.test(postalCode)) return { ok: false, error: "Postal code must be a valid US ZIP code." };
  if (websiteInput && !website) return { ok: false, error: "Website must be a valid HTTP or HTTPS URL." };
  if (phoneInput && !listedPhone) return { ok: false, error: "Listed phone must be a valid US phone number." };

  return { ok: true, value: { name, address, city, state, postalCode, website, listedPhone } };
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "-")
    .replace(/\b(street|str)\b/gi, "st")
    .replace(/\b(avenue)\b/gi, "ave")
    .replace(/\b(road)\b/gi, "rd")
    .replace(/\b(boulevard)\b/gi, "blvd")
    .replace(/\b(highway)\b/gi, "hwy")
    .replace(/\b(suite)\b/gi, "ste")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function websiteDomain(website: string) {
  if (!website) return "";
  try { return new URL(website).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function buildProspectDedupeKeys(prospect: NormalizedRetailerProspect) {
  const locationParts = [prospect.address, prospect.city, prospect.state, prospect.postalCode].filter(Boolean).join(" ");
  const locationKey = prospect.address ? slug(locationParts) : "";
  const nameKey = slug(prospect.name);
  return {
    nameKey,
    locationKey,
    domainKey: websiteDomain(prospect.website),
    identityKey: `${nameKey}|${locationKey || `${slug(prospect.city)}-${prospect.state.toLowerCase()}`}`,
  };
}

function sameOrSubdomain(hostname: string, expectedDomain: string) {
  return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`);
}

export function isOfficialContactEvidence(evidence: OfficialContactEvidence, businessDomain: string) {
  const expectedDomain = businessDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!evidence.verifiedAt && !evidence.capturedAt) return false;
  let sourceHost = "";
  try {
    const source = new URL(evidence.sourceUrl);
    if (source.protocol !== "https:") return false;
    sourceHost = source.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }

  if (evidence.kind === "regulator_listing") {
    const suppliedAuthority = evidence.regulatorAuthority;
    const allowedAuthority = OFFICIAL_REGULATOR_AUTHORITIES.find((authority) => authority.id === suppliedAuthority?.id);
    if (!suppliedAuthority || !allowedAuthority) return false;
    if (suppliedAuthority.name !== allowedAuthority.name || suppliedAuthority.domain.toLowerCase() !== allowedAuthority.domain) return false;
    if (!sameOrSubdomain(sourceHost, allowedAuthority.domain)) return false;
    return Boolean(normalizePhone(evidence.contactValue) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(evidence.contactValue.trim().toLowerCase()));
  }
  if (!expectedDomain) return false;
  if (!sameOrSubdomain(sourceHost, expectedDomain)) return false;
  if (evidence.kind === "official_website_phone") return Boolean(normalizePhone(evidence.contactValue));
  if (evidence.kind === "official_contact_form") {
    try {
      const contactUrl = new URL(evidence.contactValue);
      return contactUrl.protocol === "https:" && sameOrSubdomain(contactUrl.hostname.toLowerCase().replace(/^www\./, ""), expectedDomain);
    } catch {
      return false;
    }
  }
  const email = evidence.contactValue.trim().toLowerCase();
  const emailDomain = email.split("@")[1] || "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && sameOrSubdomain(emailDomain, expectedDomain);
}

function finiteCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function scoreRetailerProspect(raw: RetailerProspectScoreInput): RetailerProspectScore {
  const inputs: RetailerProspectScoreInput = {
    demand: {
      searches30d: finiteCount(raw.demand.searches30d),
      savedAlerts: finiteCount(raw.demand.savedAlerts),
      watchlistMatches: finiteCount(raw.demand.watchlistMatches),
    },
    coverage: {
      marketStores: finiteCount(raw.coverage.marketStores),
      coveredStores: finiteCount(raw.coverage.coveredStores),
      citySignals30d: finiteCount(raw.coverage.citySignals30d),
    },
    fit: { ...raw.fit },
    evidence: { ...raw.evidence },
  };
  const demand = round(
    Math.min(inputs.demand.searches30d / 30, 1) * 12
    + Math.min(inputs.demand.savedAlerts / 10, 1) * 10
    + Math.min(inputs.demand.watchlistMatches / 10, 1) * 8,
  );
  const hasCoverageMeasurement = inputs.coverage.marketStores > 0;
  const marketStores = Math.max(1, inputs.coverage.marketStores);
  const uncoveredRatio = Math.max(0, Math.min(1, (marketStores - Math.min(marketStores, inputs.coverage.coveredStores)) / marketStores));
  const coverageGap = hasCoverageMeasurement
    ? round(uncoveredRatio * 22 + Math.max(0, 1 - inputs.coverage.citySignals30d / 10) * 8)
    : 0;
  const retailerFit = (inputs.fit.independent ? 8 : 0) + (inputs.fit.bourbonSpecialist ? 9 : 0) + (inputs.fit.liveInventoryGap ? 8 : 0);
  const evidenceQuality = (inputs.evidence.officialContact ? 7 : 0) + (inputs.evidence.officialWebsite ? 4 : 0) + (inputs.evidence.physicalLocation ? 4 : 0);
  const components = { demand, coverageGap, retailerFit, evidenceQuality };
  const total = round(Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0)));
  const rationale = [
    `${inputs.demand.searches30d} aggregate searches, ${inputs.demand.savedAlerts} saved alerts, and ${inputs.demand.watchlistMatches} watchlist matches in 30 days.`,
    `${Math.max(0, inputs.coverage.marketStores - inputs.coverage.coveredStores)} of ${inputs.coverage.marketStores} known market stores are not covered.`,
    `${inputs.coverage.citySignals30d} aggregate city signals were live in the last 30 days.`,
  ];
  return { total, scoreOutOf: 100, components, inputs, rationale };
}

const STANDARD_TRANSITIONS: Record<RetailerProspectState, RetailerProspectState[]> = {
  discovered: ["qualified", "paused", "declined", "invalid"],
  qualified: ["contact_verified", "paused", "declined", "invalid"],
  contact_verified: ["draft_ready", "paused", "declined", "invalid"],
  draft_ready: ["awaiting_approval", "paused", "declined", "invalid"],
  awaiting_approval: ["approved", "draft_ready", "paused", "declined", "invalid"],
  approved: ["contacted", "paused", "declined", "invalid"],
  contacted: ["follow_up_due", "interested", "onboarding", "paused", "declined", "invalid"],
  follow_up_due: ["contacted", "interested", "onboarding", "paused", "declined", "invalid"],
  interested: ["onboarding", "paused", "declined", "invalid"],
  onboarding: ["verified", "paused", "declined", "invalid"],
  verified: ["first_signal_live", "paused", "declined", "invalid"],
  first_signal_live: ["paused"],
  paused: ["qualified", "contact_verified", "draft_ready", "awaiting_approval", "approved", "contacted", "follow_up_due", "interested", "onboarding", "verified", "declined", "invalid"],
  declined: [],
  invalid: [],
};

export function assertProspectTransition(
  current: RetailerProspectState,
  next: RetailerProspectState,
  context: { hasOfficialContact?: boolean; hasApprovedVersion?: boolean; followUpCount?: number } = {},
) {
  if (current === next) return;
  if (!STANDARD_TRANSITIONS[current]?.includes(next)) throw new Error(`Invalid retailer prospect transition: ${current} -> ${next}.`);
  if ((next === "contact_verified" || next === "draft_ready") && context.hasOfficialContact !== true) {
    throw new Error("Verified official contact evidence is required for this transition.");
  }
  if (next === "approved" && context.hasApprovedVersion !== true) throw new Error("An approved version is required before approval.");
  if (next === "contacted" && current === "approved" && context.hasApprovedVersion === false) throw new Error("An approved version is required before contact.");
  if (next === "follow_up_due" && finiteCount(context.followUpCount || 0) >= 1) throw new Error("Only one follow-up is allowed.");
}

export function draftProspectOutreach(input: {
  prospectId: string;
  version: number;
  retailerName: string;
  city: string;
  state: string;
  contactChannel: ProspectContactChannel;
}): ProspectMessageVersion {
  const retailerName = cleanText(input.retailerName, 160);
  const market = [titleCase(cleanText(input.city, 100)), normalizeState(input.state)].filter(Boolean).join(", ");
  const subject = `A retailer signal channel for ${retailerName}`;
  const body = [
    `Hello ${retailerName} team,`,
    "",
    `Bourbon Signal helps people act on timely bottle availability and retailer events${market ? ` around ${market}` : ""}. We found your official business contact while reviewing stores that could improve local coverage.`,
    "",
    "Would you be open to a short conversation about publishing verified availability, barrel picks, tastings, or lotteries directly? There is no promise of audience size or sales; we would first confirm fit and walk through verification.",
    "",
    "Best,",
    "Bourbon Signal",
  ].join("\n");
  return {
    prospectId: cleanText(input.prospectId, 120),
    version: Math.max(1, finiteCount(input.version)),
    channel: input.contactChannel,
    subject,
    body,
    status: "draft",
  };
}

export function buildApprovalPacket(input: {
  prospect: NormalizedRetailerProspect & { id: string };
  score: RetailerProspectScore;
  contactEvidence: OfficialContactEvidence[];
  draft: ProspectMessageVersion;
}): ProspectApprovalPacket {
  const businessDomain = websiteDomain(input.prospect.website);
  const officialContactEvidence = input.contactEvidence.filter((evidence) => Boolean(evidence.verifiedAt) && isOfficialContactEvidence(evidence, businessDomain));
  if (!officialContactEvidence.length) throw new Error("Verified official contact evidence is required for an approval packet.");
  if (input.draft.status !== "draft") throw new Error("Only an unmodified draft can be submitted for approval.");
  if (input.draft.prospectId !== input.prospect.id) throw new Error("Draft and prospect do not match.");
  return {
    prospectId: input.prospect.id,
    retailer: input.prospect,
    score: input.score,
    officialContactEvidence,
    messageVersion: input.draft.version,
    draft: input.draft,
    guardrails: [
      "Owner approval applies only to this exact message version.",
      "No outreach may be recorded from a draft or superseded version.",
      "At most one follow-up may be recorded.",
      "Demand and outcomes remain aggregate; do not add identities or invented reach claims.",
    ],
  };
}

export function canRecordOutreach(input: {
  prospectState: RetailerProspectState;
  messageStatus: ProspectMessageStatus;
  approvedMessageChannel: ProspectContactChannel;
  outreachChannel: ProspectContactChannel;
  kind: ProspectOutreachKind;
  initialContactCount: number;
  followUpCount: number;
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.messageStatus !== "approved") return { allowed: false, reason: "Outreach requires an approved message version." };
  if (input.outreachChannel !== input.approvedMessageChannel) {
    return { allowed: false, reason: "Outreach channel must match the approved message version channel." };
  }
  if (input.kind === "initial") {
    if (input.prospectState !== "approved") return { allowed: false, reason: "Initial outreach requires an approved prospect." };
    if (finiteCount(input.initialContactCount) > 0) return { allowed: false, reason: "Initial outreach was already recorded." };
    return { allowed: true };
  }
  if (input.prospectState !== "follow_up_due") return { allowed: false, reason: "The prospect must be marked follow-up due." };
  if (finiteCount(input.initialContactCount) !== 1) return { allowed: false, reason: "A follow-up requires one recorded initial outreach." };
  if (finiteCount(input.followUpCount) >= 1) return { allowed: false, reason: "Only one follow-up may be recorded." };
  return { allowed: true };
}

export function aggregateProspectOutcomes(rows: Array<{ state: RetailerProspectState; outcome?: string | null }>) {
  const states: Partial<Record<RetailerProspectState, number>> = {};
  const outcomes: Record<string, number> = {};
  for (const row of rows) {
    states[row.state] = (states[row.state] || 0) + 1;
    const outcome = cleanText(row.outcome, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (outcome) outcomes[outcome] = (outcomes[outcome] || 0) + 1;
  }
  return { total: rows.length, states, outcomes };
}
