#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFinding } from "../../scripts/lib/operator-findings.mjs";
import { isRadarEntryExpired, radarEntries, stateGuides, type RadarEntry, type RadarSource } from "../../src/lib/release-radar.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(SCRIPT_DIR, "reports");
const DEFAULT_STATE = path.join(REPORT_DIR, "nc-release-radar-source-state.json");
const DEFAULT_REPORT = path.join(REPORT_DIR, "nc-release-radar-monitor-latest.json");
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_FINDINGS_PER_RUN = 8;
const MAX_REDIRECTS = 3;

type NcRadarSource = {
  id: string;
  label: string;
  url: string;
  sourceType: RadarSource["type"];
  trackedSlugs: string[];
};

type SourceState = {
  id: string;
  label: string;
  url: string;
  fingerprint?: string;
  lastCheckedAt: string;
  lastSuccessAt?: string;
  httpStatus?: number;
  consecutiveFailures: number;
  lastFailureQueuedAt?: string;
  signals?: {
    dateTokens: string[];
    statusMarkers: string[];
  };
};

type MonitorState = {
  contractVersion?: string;
  generatedAt?: string;
  sources?: Record<string, SourceState>;
  expiredSlugs?: string[];
};

function option(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSourceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("NC Radar monitoring sources must use HTTPS.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

function sourceId(url: string) {
  return `nc-radar-${hash(url).slice(0, 16)}`;
}

export function buildNcRadarSourceRegistry(): NcRadarSource[] {
  const guide = stateGuides.find((candidate) => candidate.abbreviation === "NC");
  const byUrl = new Map<string, NcRadarSource>();
  const add = (source: Pick<RadarSource, "label" | "url" | "type">, slug?: string) => {
    if (source.type === "press") return;
    const url = canonicalSourceUrl(source.url);
    const previous = byUrl.get(url);
    const trackedSlugs = [...new Set([...(previous?.trackedSlugs || []), ...(slug ? [slug] : [])])].sort();
    byUrl.set(url, {
      id: sourceId(url),
      label: previous?.label || source.label.slice(0, 120),
      url,
      sourceType: source.type,
      trackedSlugs,
    });
  };

  for (const source of guide?.sources || []) add(source);
  for (const board of guide?.boardProfiles || []) add({ label: `${board.name} official source`, url: board.sourceUrl, type: "state" });
  for (const entry of radarEntries.filter((candidate) => candidate.states.includes("North Carolina"))) {
    for (const source of entry.sources) add(source, entry.slug);
  }
  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br\s*\/?|\/?(?:p|li|div|article|section|h[1-6]|tr))\b[^>]*>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&#x?([0-9a-f]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialEvidence(html: string) {
  const text = stripHtml(html).toLowerCase();
  const sentences = text.split(/(?<=[.!?])\s+|\s*[|•]\s*/).map((sentence) => sentence.trim()).filter(Boolean);
  const relevant = sentences
    .filter((sentence) => /\b(?:bourbon|whiske?y|lotter\w*|drawing|registr\w*|event|tasting|allocat\w*|release|barrelpalooza|sold out|closed|open now|entries? open)\b/.test(sentence))
    .map((sentence) => sentence.slice(0, 360))
    .slice(0, 80);
  const evidenceText = relevant.join(" ");
  const dateTokens = [...new Set([
    ...evidenceText.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g),
    ...evidenceText.matchAll(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*(?:-|–|through|to)\s*\d{1,2})?(?:,?\s+20\d{2})?/gi),
    ...evidenceText.matchAll(/\b20\d{2}\b/g),
  ].map((match) => match[0].toLowerCase()))].sort().slice(0, 80);
  const statusMarkers = [...new Set([
    /\b(?:registration|entries?|applications?)\s+(?:is|are\s+)?(?:now\s+)?open\b/.test(text) ? "open" : "",
    /\b(?:registration|entries?|applications?|lottery)\s+(?:is|are\s+)?(?:now\s+)?closed\b/.test(text) ? "closed" : "",
    /\bsold out\b/.test(text) ? "sold_out" : "",
    /\bcheck back\b/.test(text) ? "check_back" : "",
  ].filter(Boolean))].sort();
  return {
    fingerprint: hash(JSON.stringify({ relevant, dateTokens, statusMarkers })),
    signals: { dateTokens, statusMarkers },
  };
}

function allowedFinalUrl(sourceUrl: string, responseUrl: string) {
  if (!responseUrl) return true;
  const source = new URL(sourceUrl);
  const final = new URL(responseUrl);
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, "");
  return final.protocol === "https:" && normalize(final.hostname) === normalize(source.hostname);
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || isIP(host) !== 0;
}

async function fetchWithValidatedRedirects(source: NcRadarSource, fetchImpl: typeof fetch) {
  let url = source.url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const target = new URL(url);
    if (isPrivateHostname(target.hostname) || !allowedFinalUrl(source.url, target.toString())) {
      throw new Error("Source target is outside its configured official host.");
    }
    const response = await fetchImpl(target.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.9", "User-Agent": "BourbonSignal-NC-Radar-Monitor/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("Source redirect omitted its destination.");
    url = new URL(location, target).toString();
  }
  throw new Error("Source exceeded the redirect limit.");
}

async function readBoundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel("monitoring size limit exceeded");
      throw new Error("Source response exceeds the monitoring size limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchSource(source: NcRadarSource, fetchImpl: typeof fetch) {
  const response = await fetchWithValidatedRedirects(source, fetchImpl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("Source response exceeds the monitoring size limit.");
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) throw new Error("Source response is not monitorable text or HTML.");
  const body = await readBoundedText(response);
  if (!body.trim()) throw new Error("Source response is empty.");
  return { httpStatus: response.status, ...materialEvidence(body) };
}

function reviewItem(source: NcRadarSource, kind: "material_change" | "source_failure", generatedAt: string, details: { fingerprint?: string; consecutiveFailures?: number }) {
  if (kind === "material_change") {
    return {
      id: `nc-change-${source.id}-${details.fingerprint?.slice(0, 12)}`,
      kind,
      sourceId: source.id,
      label: source.label,
      url: source.url,
      trackedSlugs: source.trackedSlugs,
      observedAt: generatedAt,
      summary: "Official NC source evidence materially changed and requires semantic review before any public update.",
    };
  }
  return {
    id: `nc-failure-${source.id}`,
    kind,
    sourceId: source.id,
    label: source.label,
    url: source.url,
    trackedSlugs: source.trackedSlugs,
    observedAt: generatedAt,
    summary: `Official NC source failed ${details.consecutiveFailures || 0} consecutive checks and requires source review.`,
  };
}

function findingForReview(item: ReturnType<typeof reviewItem>, source: NcRadarSource, previous?: SourceState) {
  const material = item.kind === "material_change";
  const sourceKey = material
    ? `nc-source:${source.id}:change:${item.id.slice(-12)}`
    : `nc-source:${source.id}:failure:${(previous?.lastSuccessAt || "no-success").slice(0, 10)}`;
  return buildFinding({
    source: "release-radar",
    sourceKey,
    area: "product",
    severity: material ? "medium" : "low",
    title: material ? `Review NC Radar source: ${source.label}` : `Repair NC Radar source: ${source.label}`,
    summary: item.summary,
    evidence: [source.url, ...(source.trackedSlugs.length ? [`tracked records: ${source.trackedSlugs.join(", ")}`.slice(0, 240)] : [])],
    recommendedAction: material
      ? "Open the official source, verify current dates, eligibility, location, and status, then update or dismiss the affected Radar record through normal review and release gates."
      : "Confirm whether the official page moved, is temporarily unavailable, or now needs a browser-backed monitor; replace genuine stale URLs without weakening source authority.",
    impact: material ? 3 : 2,
    urgency: material ? 4 : 2,
    confidence: material ? 0.9 : 0.75,
    effort: 2,
    observedAt: item.observedAt,
  });
}

function expiredNcEntries(entries: RadarEntry[], today: string) {
  return entries
    .filter((entry) => entry.states.includes("North Carolina") && isRadarEntryExpired(entry, today))
    .map((entry) => entry.slug)
    .sort();
}

export async function monitorNcRadarSources({
  sources = buildNcRadarSourceRegistry(),
  previousState = { sources: {} },
  generatedAt = new Date().toISOString(),
  fetchImpl = fetch,
  entries = radarEntries,
}: {
  sources?: NcRadarSource[];
  previousState?: MonitorState;
  generatedAt?: string;
  fetchImpl?: typeof fetch;
  entries?: RadarEntry[];
} = {}) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("NC Radar monitor generatedAt must be an ISO date-time.");
  if (sources.length > 40) throw new Error("NC Radar source registry exceeds the bounded 40-source contract.");
  const establishingBaseline = !previousState.generatedAt && Object.keys(previousState.sources || {}).length === 0;
  const previousSources = previousState.sources || {};
  const nextSources: Record<string, SourceState> = {};
  const reviewQueue: Array<ReturnType<typeof reviewItem>> = [];
  let baselined = 0;
  let materiallyChanged = 0;
  let failed = 0;
  let reviewFailures = 0;

  const sourceBatch = sources;
  const observationPromises = new Map(sourceBatch.map((source) => [
    source.id,
    fetchSource(source, fetchImpl).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    ),
  ]));
  for (const source of sourceBatch) {
    const previous = previousSources[source.id];
    try {
      const result = await observationPromises.get(source.id)!;
      if (result.error || !result.value) throw result.error || new Error("Source produced no observation.");
      const observation = result.value;
      nextSources[source.id] = {
        id: source.id,
        label: source.label,
        url: source.url,
        fingerprint: observation.fingerprint,
        lastCheckedAt: generatedAt,
        lastSuccessAt: generatedAt,
        httpStatus: observation.httpStatus,
        consecutiveFailures: 0,
        signals: observation.signals,
      };
      if (!previous?.fingerprint) {
        baselined += 1;
      } else if (previous.fingerprint !== observation.fingerprint) {
        materiallyChanged += 1;
        reviewQueue.push(reviewItem(source, "material_change", generatedAt, { fingerprint: observation.fingerprint }));
      }
    } catch {
      failed += 1;
      const consecutiveFailures = Math.min(1000, Number(previous?.consecutiveFailures || 0) + 1);
      nextSources[source.id] = {
        id: source.id,
        label: source.label,
        url: source.url,
        fingerprint: previous?.fingerprint,
        lastCheckedAt: generatedAt,
        lastSuccessAt: previous?.lastSuccessAt,
        consecutiveFailures,
        lastFailureQueuedAt: previous?.lastFailureQueuedAt,
        signals: previous?.signals,
      };
      if (consecutiveFailures >= 2) {
        reviewFailures += 1;
        reviewQueue.push(reviewItem(source, "source_failure", generatedAt, { consecutiveFailures }));
      }
    }
  }

  const today = generatedAt.slice(0, 10);
  const expiredSlugs = expiredNcEntries(entries, today);
  const previouslyExpired = new Set(previousState.expiredSlugs || []);
  const newlyExpired = establishingBaseline ? [] : expiredSlugs.filter((slug) => !previouslyExpired.has(slug));
  for (const slug of newlyExpired) {
    const entry = entries.find((candidate) => candidate.slug === slug);
    if (!entry) continue;
    const source: NcRadarSource = {
      id: `expiry-${slug}`,
      label: entry.title.slice(0, 120),
      url: entry.sources[0].url,
      sourceType: entry.sources[0].type,
      trackedSlugs: [slug],
    };
    reviewQueue.push({
      id: `nc-expiry-${slug}`,
      kind: "material_change",
      sourceId: source.id,
      label: source.label,
      url: source.url,
      trackedSlugs: [slug],
      observedAt: generatedAt,
      summary: "An exact-date NC opportunity crossed its official closing boundary. Runtime surfaces now treat it as closed; editorial review can archive or refresh the record.",
    });
  }

  const orderedReview = [...reviewQueue].sort((left, right) => {
    const failureOrder = Number(left.kind === "source_failure") - Number(right.kind === "source_failure");
    if (failureOrder) return failureOrder;
    if (left.kind === "source_failure" && right.kind === "source_failure") {
      const leftQueued = previousSources[left.sourceId]?.lastFailureQueuedAt || "";
      const rightQueued = previousSources[right.sourceId]?.lastFailureQueuedAt || "";
      return leftQueued.localeCompare(rightQueued) || left.id.localeCompare(right.id);
    }
    return left.id.localeCompare(right.id);
  });
  const selectedReview = orderedReview.slice(0, MAX_FINDINGS_PER_RUN);
  const deferredReview = orderedReview.slice(MAX_FINDINGS_PER_RUN);
  for (const item of selectedReview) {
    if (item.kind === "source_failure" && nextSources[item.sourceId]) nextSources[item.sourceId].lastFailureQueuedAt = generatedAt;
  }
  for (const item of deferredReview) {
    if (item.kind !== "material_change" || !nextSources[item.sourceId] || !previousSources[item.sourceId]?.fingerprint) continue;
    nextSources[item.sourceId].fingerprint = previousSources[item.sourceId].fingerprint;
  }
  const deferredExpirySlugs = new Set(deferredReview
    .filter((item) => item.id.startsWith("nc-expiry-"))
    .map((item) => item.id.slice("nc-expiry-".length)));
  const persistedExpiredSlugs = expiredSlugs.filter((slug) => !deferredExpirySlugs.has(slug));
  const findings = selectedReview.map((item) => {
    const source = sources.find((candidate) => candidate.id === item.sourceId) || {
      id: item.sourceId,
      label: item.label,
      url: item.url,
      sourceType: "state" as const,
      trackedSlugs: item.trackedSlugs,
    };
    return findingForReview(item, source, previousSources[source.id]);
  });
  const state: MonitorState = {
    contractVersion: "bourbon-signal/nc-release-radar-source-state@1",
    generatedAt,
    sources: nextSources,
    expiredSlugs: establishingBaseline ? expiredSlugs : persistedExpiredSlugs,
  };
  return {
    contractVersion: "bourbon-signal/nc-release-radar-monitor@1",
    generatedAt,
    mode: "evidence_and_lifecycle_only",
    canPublish: false,
    canCreatePullRequest: false,
    canCreateAlerts: false,
    automaticExpiration: {
      mode: "runtime_date_boundary",
      expiredSlugs,
      newlyExpired,
    },
    sources: sources.map((source) => ({ id: source.id, label: source.label, url: source.url, sourceType: source.sourceType, trackedSlugs: source.trackedSlugs })),
    reviewQueue: orderedReview,
    findings,
    summary: {
      totalSources: sources.length,
      baselined,
      materiallyChanged,
      failed,
      reviewFailures,
      newlyExpired: newlyExpired.length,
      queuedForSemanticReview: selectedReview.length,
      deferredForSemanticReview: deferredReview.length,
    },
    state,
  };
}

async function readState(file: string): Promise<MonitorState> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { sources: {} };
    throw error;
  }
}

async function writeJsonAtomically(file: string, value: unknown) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export async function main(argv = process.argv.slice(2)) {
  const statePath = path.resolve(option(argv, "state") || DEFAULT_STATE);
  const reportPath = path.resolve(option(argv, "output") || DEFAULT_REPORT);
  const generatedAt = option(argv, "at") || new Date().toISOString();
  const previousState = await readState(statePath);
  const report = await monitorNcRadarSources({ previousState, generatedAt });
  if (argv.includes("--apply")) {
    await mkdir(path.dirname(statePath), { recursive: true });
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeJsonAtomically(reportPath, report);
    await writeJsonAtomically(statePath, report.state);
  }
  if (argv.includes("--print")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "NC Release Radar monitor failed"}\n`);
    process.exitCode = 1;
  });
}
