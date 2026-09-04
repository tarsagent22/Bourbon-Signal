"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AVAILABLE_STATES } from "@/lib/statePreferences";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useAuth } from "@/lib/auth";
import { recordGrowthMilestone } from "@/lib/growth-client";
import {
  assessShelfPrice,
  bottleCheckActionAccess,
  buildBottleCheckCollectionEntry,
  countBottleCheckAlertAreas,
  findBottleCheckCollectionEntry,
  formatBottleCheckCollectionRating,
  type BottleCheckActionAccess,
} from "@/lib/bottle-check-dossier";

interface BottleResult {
  bottle: {
    id: string;
    canonicalName: string;
    brand: string;
    producer?: string;
    category: string;
    proof?: number;
    ageStatement?: string | null;
    msrp?: number | null;
    availability: "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";
    nationalTier: "regular" | "limited" | "allocated" | "highly_allocated" | "unicorn";
    nationalConfidence: "high" | "medium" | "low";
    releaseCadence: string;
    distributionScope: string;
    scarcityLabel: string;
    releaseBadges: string[];
    buyerVerdict: string;
    aliases: string[];
    isSignalTracked?: boolean;
    isAlertEligible?: boolean;
    summary: string;
    guidance: string;
    matchScore?: number;
    matchReason?: "exact" | "alias" | "fuzzy" | "engine";
  } | null;
  localSignal?: {
    state: string;
    rarityScore: number;
    nationalRarityScore: number;
    localScore: number;
    scoreStatus: "bible_baseline" | "local_adjusted";
    scoreBasis: string;
    label: string;
    verdict: string;
    confidence: "high" | "medium" | "low";
    signalConfidence: "high" | "medium" | "low";
    classificationConfidence: "high" | "medium" | "low";
    nationalTier: "regular" | "limited" | "allocated" | "highly_allocated" | "unicorn";
    marketTier: "regular" | "limited" | "allocated" | "highly_allocated" | "unicorn";
    nationalLabel: string;
    marketLabel: string;
    nationalConfidence: "high" | "medium" | "low";
    localConfidence: "high" | "medium" | "low" | null;
    nationalReason: string;
    localReason: string | null;
    releaseBadges: string[];
    localClassificationEstablished: boolean;
    classificationSource: "national_baseline" | "state_override";
    recentCount90d: number;
    recentCount30d: number;
    lastSeenAt: string | null;
    recentLocations: { label: string; city?: string; state?: string; seenAt: string; signalLabel?: string }[];
    canTrack: boolean;
    trackDisabledReason?: string;
  };
  memberTasteScore?: {
    average: number;
    count: number;
    label: string;
  } | null;
  suggestions?: BottleResult["bottle"][];
  showSuggestions?: boolean;
  message?: string;
  usage?: { used: number; limit: number; remaining: number } | null;
}

type UpgradePrompt = Exclude<BottleCheckActionAccess, { allowed: true }> & {
  action: "track" | "collection";
};

const activeStates = AVAILABLE_STATES.filter((state) => state.active);

const BOTTLE_CHECK_USAGE_STORAGE_KEY = "bourbonSignalFreeBottleChecksUsed";

function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function suggestionDedupeKey(bottle: NonNullable<BottleResult["bottle"]>) {
  return normalizeBottleKey(bottle.canonicalName)
    .replace(/\b(\d+)y\b/g, "$1 year")
    .replace(/^w l weller\b/g, "weller")
    .replace(/\bc y p b\b/g, "cypb")
    .replace(/\b(kentucky|ky|straight|bourbon|whiskey|whisky)\b/g, " ")
    .replace(/\b(750ml|1l|liter|litre|\.75l|1\.00l)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || normalizeBottleKey(bottle.canonicalName);
}

const availabilityRank: Record<string, number> = {
  common: 1,
  regional: 2,
  seasonal: 3,
  limited: 4,
  allocated: 5,
  highly_allocated: 6,
  unicorn: 7,
};

function dedupeSuggestions(suggestions: NonNullable<BottleResult["bottle"]>[]) {
  const byKey = new Map<string, NonNullable<BottleResult["bottle"]>>();
  for (const suggestion of suggestions) {
    const key = suggestionDedupeKey(suggestion);
    const existing = byKey.get(key);
    const currentRank = (suggestion.matchScore || 0) * 10 + (availabilityRank[suggestion.availability] || 0);
    const existingRank = existing ? (existing.matchScore || 0) * 10 + (availabilityRank[existing.availability] || 0) : -1;
    if (!existing || currentRank > existingRank) byKey.set(key, suggestion);
  }
  return Array.from(byKey.values());
}

function findCachedSuggestionPrefix(
  cache: Map<string, NonNullable<BottleResult["bottle"]>[]>,
  query: string,
) {
  const normalizedQuery = normalizeBottleKey(query);
  const exact = cache.get(normalizedQuery);
  if (exact) return exact;
  const prefix = Array.from(cache.keys())
    .filter((key) => key.length >= 2 && normalizedQuery.startsWith(key))
    .sort((left, right) => right.length - left.length)[0];
  if (!prefix) return [];
  return (cache.get(prefix) || []).filter((suggestion) => {
    const searchable = normalizeBottleKey([suggestion.canonicalName, ...(suggestion.aliases || [])].join(" "));
    return normalizedQuery.split(" ").every((word) => searchable.includes(word));
  });
}

function hasDecisiveBottleSuggestion(suggestions: NonNullable<BottleResult["bottle"]>[]) {
  return suggestions.some((suggestion) => {
    const scored = suggestion as NonNullable<BottleResult["bottle"]> & { matchScore?: number; matchReason?: string };
    return (scored.matchReason === "exact" || scored.matchReason === "alias") && (scored.matchScore || 0) >= 110;
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No signal yet";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "No signal yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(time);
}

function scoreTone(score: number) {
  if (score >= 86) return "hot";
  if (score >= 58) return "warm";
  if (score >= 35) return "medium";
  return "quiet";
}

export default function BottleCheckPage() {
  const { isLoaded, isSignedIn, signIn, entitlements } = useAuth();
  const bottleCheckLimit = entitlements.bottleCheckLimit;
  const isFreeBottleCheck = bottleCheckLimit !== null;
  const { prefs, loading: prefsLoading, savePreferences, collectionSyncState } = useAreaPreferences();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedState, setSubmittedState] = useState("NC");
  const [state, setState] = useState("NC");
  const [result, setResult] = useState<BottleResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackingStates, setTrackingStates] = useState<string[]>(["NC"]);
  const [savingTrack, setSavingTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackSaved, setTrackSaved] = useState(false);
  const [shelfPrice, setShelfPrice] = useState("");
  const [savingCollection, setSavingCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionSaveState, setCollectionSaveState] = useState<"idle" | "saved" | "pending" | "conflict">("idle");
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePrompt | null>(null);
  const upgradeDialogRef = useRef<HTMLDialogElement>(null);
  const [freeChecksUsed, setFreeChecksUsed] = useState(0);
  const [liveSuggestions, setLiveSuggestions] = useState<NonNullable<BottleResult["bottle"]>[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionSession, setSuggestionSession] = useState(0);
  const suggestionRequestVersion = useRef(0);
  const suggestionCache = useRef(new Map<string, NonNullable<BottleResult["bottle"]>[]>());
  const authoritativeSuggestionCache = useRef(new Set<string>());
  const pendingValueResult = useRef(false);
  const freeValueRecorded = useRef(false);
  const [valueResultVersion, setValueResultVersion] = useState(0);

  const [addingMissingBottle, setAddingMissingBottle] = useState(false);
  const [missingBottleAdded, setMissingBottleAdded] = useState(false);
  const [missingBottleAddedName, setMissingBottleAddedName] = useState("");
  const [missingBottleError, setMissingBottleError] = useState<string | null>(null);

  const remainingFreeChecks = bottleCheckLimit === null ? null : Math.max(0, bottleCheckLimit - freeChecksUsed);
  const hasFreeChecksRemaining = remainingFreeChecks === null || remainingFreeChecks > 0;

  function openSuggestionMenu() {
    suggestionRequestVersion.current += 1;
    const cached = findCachedSuggestionPrefix(suggestionCache.current, query);
    setLiveSuggestions(cached);
    setSuggestionsLoading(query.trim().length >= 2 && !suggestionCache.current.has(normalizeBottleKey(query)));
    setSuggestionsOpen(true);
    setSuggestionSession((current) => current + 1);
  }

  function closeSuggestionMenu() {
    suggestionRequestVersion.current += 1;
    setSuggestionsOpen(false);
    setLiveSuggestions([]);
    setSuggestionsLoading(false);
  }

  function updateSuggestionQuery(value: string) {
    suggestionRequestVersion.current += 1;
    const cached = findCachedSuggestionPrefix(suggestionCache.current, value);
    setLiveSuggestions(cached);
    setSuggestionsLoading(value.trim().length >= 2 && !suggestionCache.current.has(normalizeBottleKey(value)));
    setSuggestionsOpen(true);
    setQuery(value);
  }

  function updateSuggestionState(value: string) {
    suggestionRequestVersion.current += 1;
    setLiveSuggestions([]);
    setSuggestionsLoading(query.trim().length >= 2);
    setState(value);
  }

  function selectSuggestion(suggestion: NonNullable<BottleResult["bottle"]>) {
    closeSuggestionMenu();
    setQuery(suggestion.canonicalName);
    setSubmittedQuery(suggestion.canonicalName);
    setSubmittedState(state);
    setHasSearched(true);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(BOTTLE_CHECK_USAGE_STORAGE_KEY) || "0");
    setFreeChecksUsed(Number.isFinite(stored) ? Math.max(0, stored) : 0);
  }, []);

  useEffect(() => {
    const dialog = upgradeDialogRef.current;
    if (!dialog) return;
    if (upgradePrompt && !dialog.open) dialog.showModal();
    if (!upgradePrompt && dialog.open) dialog.close();
  }, [upgradePrompt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffQuery = params.get("q")?.trim() || "";
    const handoffState = params.get("state")?.toUpperCase() || "";
    if (handoffQuery) setQuery(handoffQuery);
    if (activeStates.some((item) => item.code === handoffState)) {
      setState(handoffState);
      setTrackingStates([handoffState]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const q = submittedQuery.trim();
      if (!q) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/bottle-check?q=${encodeURIComponent(q)}&state=${encodeURIComponent(submittedState)}&intent=check`, { signal: controller.signal });
        const data = (await res.json()) as BottleResult;
        if (data.usage && typeof data.usage.used === "number") {
          setFreeChecksUsed(data.usage.used);
          if (typeof window !== "undefined") window.localStorage.setItem(BOTTLE_CHECK_USAGE_STORAGE_KEY, String(data.usage.used));
        }
        setResult(data);
        setHasSearched(true);
        if (res.ok && data.bottle) {
          setShelfPrice("");
          setCollectionError(null);
          setCollectionSaveState("idle");
          pendingValueResult.current = true;
          setValueResultVersion((version) => version + 1);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResult({ bottle: null, message: "Bottle Check is temporarily unavailable. Try again in a minute." });
          setHasSearched(true);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [submittedQuery, submittedState]);

  useEffect(() => {
    if (!isLoaded || !pendingValueResult.current || freeValueRecorded.current) return;
    pendingValueResult.current = false;
    if (!isSignedIn || entitlements.tier !== "free") return;
    freeValueRecorded.current = true;
    void recordGrowthMilestone("free_value_reached", {
      surface: "bottle_check",
      kind: "bottle_check",
    });
  }, [entitlements.tier, isLoaded, isSignedIn, valueResultVersion]);

  useEffect(() => {
    setTrackingStates((prev) => Array.from(new Set([...(prev.length ? prev : []), state])));
  }, [state]);

  useEffect(() => {
    if (!suggestionsOpen) {
      setLiveSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const q = query.trim();
    if (q.length < 2) {
      setLiveSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const queryKey = normalizeBottleKey(q);
    const requestVersion = ++suggestionRequestVersion.current;
    const exactCached = suggestionCache.current.get(queryKey);
    const cachedNeedsAuthority = Boolean(
      exactCached
      && !authoritativeSuggestionCache.current.has(queryKey)
      && (!exactCached.length || (queryKey.includes(" ") && !hasDecisiveBottleSuggestion(exactCached))),
    );
    if (exactCached) {
      setLiveSuggestions(exactCached);
      setSuggestionsLoading(false);
      if (!cachedNeedsAuthority) return;
    }
    const prefixSuggestions = exactCached || findCachedSuggestionPrefix(suggestionCache.current, q);
    if (prefixSuggestions.length) setLiveSuggestions(prefixSuggestions);

    const controller = new AbortController();
    if (!exactCached) setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        let suggestions = exactCached;
        if (!suggestions) {
          const res = await fetch(`/api/bottle-check?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}&intent=suggest`, { signal: controller.signal });
          if (requestVersion !== suggestionRequestVersion.current) return;
          if (!res.ok) {
            setLiveSuggestions([]);
            return;
          }
          const data = (await res.json()) as BottleResult;
          if (requestVersion !== suggestionRequestVersion.current) return;
          suggestions = dedupeSuggestions([data.bottle, ...(data.suggestions || [])]
            .filter((suggestion): suggestion is NonNullable<BottleResult["bottle"]> => Boolean(suggestion))
            .filter((suggestion, index, array) => array.findIndex((item) => item.id === suggestion.id) === index))
            .slice(0, 6);
          suggestionCache.current.set(queryKey, suggestions);
          setLiveSuggestions(suggestions);
          setSuggestionsLoading(false);
        }

        const needsAuthority = !authoritativeSuggestionCache.current.has(queryKey)
          && (!suggestions.length || (queryKey.includes(" ") && !hasDecisiveBottleSuggestion(suggestions)));
        if (!needsAuthority || requestVersion !== suggestionRequestVersion.current) return;
        const authoritativeRes = await fetch(`/api/bottle-check?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}&intent=suggest-authoritative`, { signal: controller.signal });
        if (!authoritativeRes.ok || requestVersion !== suggestionRequestVersion.current) return;
        const authoritativeData = (await authoritativeRes.json()) as BottleResult;
        if (requestVersion !== suggestionRequestVersion.current) return;
        const authoritativeSuggestions = dedupeSuggestions([authoritativeData.bottle, ...(authoritativeData.suggestions || [])]
          .filter((suggestion): suggestion is NonNullable<BottleResult["bottle"]> => Boolean(suggestion)))
          .slice(0, 6);
        authoritativeSuggestionCache.current.add(queryKey);
        suggestionCache.current.set(queryKey, authoritativeSuggestions);
        setLiveSuggestions(authoritativeSuggestions);
      } catch (error) {
        if (
          (error as Error).name !== "AbortError"
          && requestVersion === suggestionRequestVersion.current
          && !prefixSuggestions.length
          && !(suggestionCache.current.get(queryKey)?.length)
        ) setLiveSuggestions([]);
      } finally {
        if (requestVersion === suggestionRequestVersion.current) setSuggestionsLoading(false);
      }
    }, 40);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, state, suggestionsOpen, suggestionSession]);

  const bottle = result?.bottle || null;
  const signal = result?.localSignal;
  const memberTasteScore = result?.memberTasteScore || null;
  const bottleKey = bottle ? normalizeBottleKey(bottle.canonicalName) : "";
  const savedBottleKeys = prefs.bottleAlertPreferences.bottleKeys.map(normalizeBottleKey);
  const savedBottleNames = prefs.bottleAlertPreferences.bottleNames.map(normalizeBottleKey);
  const isTracked = Boolean(bottleKey && (savedBottleKeys.includes(bottleKey) || savedBottleNames.includes(bottleKey)));
  const collectionEntries = prefs.collectionPreferences.bottles;
  const collectionBottleKey = bottle ? normalizeBottleKey(bottle.canonicalName) : "";
  const collectionEntry = findBottleCheckCollectionEntry(collectionEntries, bottle);
  const isInCollection = Boolean(collectionEntry);
  const collectionRatingCopy = formatBottleCheckCollectionRating(collectionEntry);
  const trackedBottleCount = new Set([...savedBottleKeys, ...savedBottleNames]).size;
  const currentAlertAreaCount = countBottleCheckAlertAreas(prefs.areaPreferences);
  const requestedNewAreaCount = trackingStates.filter((selectedState) => !prefs.areaPreferences.states.includes(selectedState)).length;
  const trackActionAccess = bottleCheckActionAccess("track", entitlements, {
    trackedBottleCount,
    currentAlertAreaCount,
    requestedNewAreaCount,
    alreadyTracked: isTracked,
  });
  const collectionActionAccess = bottleCheckActionAccess("collection", entitlements, {
    collectionBottleCount: collectionEntries.length,
    alreadyInCollection: isInCollection,
  });
  const effectiveCollectionSaveState = collectionSaveState === "idle"
    ? (isInCollection ? collectionSyncState : "idle")
    : collectionSaveState;
  const canTrack = Boolean(bottle && signal?.canTrack);
  const isRegular = signal?.marketTier === "regular";
  const parsedShelfPrice = shelfPrice.trim() ? Number(shelfPrice) : null;
  const shelfPriceAssessment = assessShelfPrice(bottle?.msrp, parsedShelfPrice);
  const resultStateCode = signal?.state || submittedState;
  const resultStateName = activeStates.find((item) => item.code === resultStateCode)?.name || resultStateCode;
  const classificationIsUnderReview = signal?.classificationSource === "national_baseline"
    && signal.classificationConfidence === "low"
    && signal.nationalTier !== "regular";

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    closeSuggestionMenu();
    if (!hasFreeChecksRemaining) {
      setResult({ bottle: null, message: "Free includes 3 Bottle Checks. Upgrade for unlimited Bottle Check access." });
      return;
    }
    if (isFreeBottleCheck && !isSignedIn) {
      setFreeChecksUsed((current) => {
        const next = Math.min(bottleCheckLimit ?? current + 1, current + 1);
        if (typeof window !== "undefined") window.localStorage.setItem(BOTTLE_CHECK_USAGE_STORAGE_KEY, String(next));
        return next;
      });
    }
    setSubmittedState(state);
    setSubmittedQuery(nextQuery);
  }

  async function addMissingBottleFromCheck() {
    const rawName = query.trim() || submittedQuery.trim();
    if (!rawName) return;
    if (!isSignedIn) {
      signIn();
      return;
    }
    setAddingMissingBottle(true);
    setMissingBottleError(null);
    setMissingBottleAdded(false);
    try {
      const res = await fetch("/api/bottle-contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawName, source: "bottle_check", context: { state: submittedState, searchQuery: rawName } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add that bottle yet.");
      setMissingBottleAdded(true);
      setMissingBottleAddedName(rawName);
      closeSuggestionMenu();
    } catch (error) {
      setMissingBottleError(error instanceof Error ? error.message : "Could not add that bottle yet.");
    } finally {
      setAddingMissingBottle(false);
    }
  }

  function toggleTrackingState(nextState: string) {
    setTrackingStates((prev) => {
      const hasState = prev.includes(nextState);
      const next = hasState ? prev.filter((item) => item !== nextState) : [...prev, nextState];
      return next.length ? next : [nextState];
    });
  }

  function requireBottleCheckAction(action: "track" | "collection") {
    const access = action === "track" ? trackActionAccess : collectionActionAccess;
    if (access.allowed) return true;
    setUpgradePrompt({ ...access, action });
    return false;
  }

  async function trackBottle() {
    if (!bottle || !canTrack) return;
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (!requireBottleCheckAction("track")) return;
    if (prefsLoading) {
      setTrackError("Loading your saved preferences. Try again in a second.");
      return;
    }

    setSavingTrack(true);
    setTrackError(null);
    setTrackSaved(false);
    try {
      const selectedStates = trackingStates.length ? trackingStates : [state];
      await savePreferences({
        areaPreferences: {
          ...prefs.areaPreferences,
          states: Array.from(new Set([...prefs.areaPreferences.states, ...selectedStates])),
        },
        alertMode: "specific_bottles",
        watchlistMutation: { bottleName: bottle.canonicalName, bottleKey: bottleKey || undefined, watched: true },
      });
      setTrackSaved(true);
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Could not save this bottle yet.");
    } finally {
      setSavingTrack(false);
    }
  }

  async function addBottleToCollection() {
    if (!bottle) return;
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (!requireBottleCheckAction("collection")) return;
    if (prefsLoading) {
      setCollectionError("Loading your saved collection. Try again in a second.");
      return;
    }
    if (isInCollection && effectiveCollectionSaveState !== "pending" && effectiveCollectionSaveState !== "conflict") return;

    setSavingCollection(true);
    setCollectionError(null);
    setCollectionSaveState("idle");
    try {
      const retryExistingCollection = effectiveCollectionSaveState === "pending" || effectiveCollectionSaveState === "conflict";
      const collectionPreferences = retryExistingCollection
        ? prefs.collectionPreferences
        : {
            bottles: [
              ...collectionEntries.filter((entry) => normalizeBottleKey(entry.canonicalKey) !== collectionBottleKey),
              buildBottleCheckCollectionEntry({
                bottleId: bottle.id,
                bottleName: bottle.canonicalName,
                canonicalKey: collectionBottleKey,
              }),
            ],
            version: prefs.collectionPreferences.version ?? 0,
          };
      const saveResult = await savePreferences({ collectionPreferences });
      if (saveResult?.status === "conflict") {
        setCollectionSaveState("conflict");
        setCollectionError("Your collection changed on another device. Retry to save this bottle with the latest version.");
        return;
      }
      if (saveResult?.status === "pending") {
        setCollectionSaveState("pending");
        return;
      }
      setCollectionSaveState("saved");
    } catch (error) {
      setCollectionSaveState("idle");
      setCollectionError(error instanceof Error ? error.message : "Could not add this bottle to your collection yet.");
    } finally {
      setSavingCollection(false);
    }
  }

  return (
    <>
      <Navigation />
      <main className="bottle-check-page">
        <style>{bottleCheckCss}</style>

        <section className="bc-hero">
          <p className="bc-kicker">One search. The bottle intelligence that matters.</p>
          <h1>Know the bottle before you buy it.</h1>
          <p className="bc-hero-copy">See rarity, market and shipment signals, proof, age, producer, and release context in one clear read.</p>
        </section>

        <section className="bc-shell">
          {isFreeBottleCheck ? (
            <div className="bc-panel muted" style={{ marginBottom: 14 }}>
              Free preview: {remainingFreeChecks} of {bottleCheckLimit} Bottle Checks remaining. Upgrade for unlimited access.
            </div>
          ) : null}
          <form className="bc-search-card" onSubmit={submitSearch}>
            <div className="bc-field grow">
              <label htmlFor="bottle-search">Bottle name</label>
              <div className="bc-search-input-wrap">
                <input
                  id="bottle-search"
                  value={query}
                  onFocus={openSuggestionMenu}
                  onPointerDown={openSuggestionMenu}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeSuggestionMenu();
                    }
                  }}
                  onChange={(event) => {
                    updateSuggestionQuery(event.target.value);
                    setMissingBottleAdded(false);
                    setMissingBottleAddedName("");
                    setMissingBottleError(null);
                  }}
                  placeholder="Try Blanton's, Weller Green, Maker's Mark…"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    className="bc-search-clear"
                    aria-label="Clear bottle search"
                    onClick={() => {
                      closeSuggestionMenu();
                      setQuery("");
                      setResult(null);
                      setHasSearched(false);
                      setMissingBottleAdded(false);
                      setMissingBottleAddedName("");
                      setMissingBottleError(null);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {suggestionsOpen && (suggestionsLoading || liveSuggestions.length > 0) ? (
                <div className="bc-live-suggestions" aria-label="Bottle suggestions">
                  {suggestionsLoading && liveSuggestions.length === 0 ? (
                    <div className="bc-suggestion-loading" role="status" aria-live="polite">Searching Bottle Check…</div>
                  ) : null}
                  {liveSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>{suggestion.canonicalName}</span>
                      <em className={`bc-tier ${suggestion.nationalTier}`}>{suggestion.scarcityLabel}</em>
                    </button>
                  ))}
                  {!suggestionsLoading ? (
                    <button type="button" className="bc-live-missing" onClick={addMissingBottleFromCheck} disabled={addingMissingBottle || missingBottleAdded}>
                      <span>{missingBottleAdded ? "Added to Bourbon Signal ✓" : `Can’t find it? Add “${query.trim()}” to Bourbon Signal`}</span>
                      <em>{!isSignedIn ? "Sign in" : addingMissingBottle ? "Adding…" : "Missing bottle"}</em>
                    </button>
                  ) : null}
                  {missingBottleError ? <small className="bc-track-error">{missingBottleError}</small> : null}
                </div>
              ) : null}
            </div>
            <div className="bc-field state">
              <label htmlFor="state-select">Area</label>
              <select id="state-select" value={state} onChange={(event) => updateSuggestionState(event.target.value)} className="bourbon-select">
                {activeStates.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!hasFreeChecksRemaining}>{hasFreeChecksRemaining ? "Check bottle" : "Upgrade for unlimited"}</button>
          </form>

          {(missingBottleAdded || missingBottleError) ? (
            <div className={`bc-missing-confirmation ${missingBottleAdded ? "success" : "error"}`} role="status" aria-live="polite">
              {missingBottleAdded ? (
                <>
                  <strong>Added to Bourbon Signal ✓</strong>
                  <p>“{missingBottleAddedName || query.trim() || submittedQuery}” is in the bottle queue. We’ll match it to an official Bottle Bible record before it becomes trusted catalog data.</p>
                </>
              ) : (
                <>
                  <strong>Could not add that bottle yet</strong>
                  <p>{missingBottleError}</p>
                </>
              )}
            </div>
          ) : null}

          {loading ? (
            <div className="bc-panel muted">Checking Bottle Signal…</div>
          ) : !hasSearched ? (
            <div className="bc-panel empty">
              <strong>Search any bottle to read the signal.</strong>
              <p>Check rarity, local market history, and whether a bottle is worth chasing before you burn a trip.</p>
            </div>
          ) : !bottle ? (
            <div className="bc-panel empty">
              <strong>We do not have that bottle yet.</strong>
              <p>{result?.message || "Add it to Bourbon Signal and we’ll use it to improve future Bottle Check results."}</p>
              <button type="button" className="bc-missing-button" onClick={addMissingBottleFromCheck} disabled={addingMissingBottle || missingBottleAdded}>
                {!isSignedIn ? "Sign in to add missing bottle" : addingMissingBottle ? "Adding…" : missingBottleAdded ? "Added to Bourbon Signal ✓" : `Add “${submittedQuery || query}” to Bourbon Signal`}
              </button>
              {missingBottleError ? <small className="bc-track-error">{missingBottleError}</small> : null}
              {missingBottleAdded ? <small className="bc-track-success">We’ll match this to an official bottle record before it becomes a trusted Bottle Bible entry.</small> : null}
            </div>
          ) : (
            <div className="bc-result-grid">
              <article className="bc-verdict-card">
                <div className="bc-card-topline">
                  <span className={`bc-tier ${bottle.nationalTier}`}>{bottle.scarcityLabel}</span>
                  <span className="bc-confidence">National baseline · {signal?.nationalConfidence || bottle.nationalConfidence} confidence</span>
                </div>
                <h2>{bottle.canonicalName}</h2>
                <p className="bc-summary">{bottle.summary}</p>

                <section className="bc-dossier-section" aria-labelledby="bottle-facts-heading">
                  <div className="bc-section-heading">
                    <span>Bottle dossier</span>
                    <h3 id="bottle-facts-heading">Bottle facts</h3>
                  </div>
                  <dl className="bc-fact-grid">
                    <div><dt>MSRP</dt><dd>{typeof bottle.msrp === "number" ? `$${bottle.msrp.toFixed(2)}` : "Not listed"}</dd></div>
                    <div><dt>Proof</dt><dd>{typeof bottle.proof === "number" ? bottle.proof : "Not listed"}</dd></div>
                    <div><dt>Age</dt><dd>{bottle.ageStatement || "Not stated"}</dd></div>
                    <div><dt>Producer</dt><dd>{bottle.producer || "Not listed"}</dd></div>
                    <div><dt>Type</dt><dd>{bottle.category.replace(/_/g, " ")}</dd></div>
                    <div><dt>Release pattern</dt><dd>{bottle.releaseCadence}</dd></div>
                  </dl>
                </section>

                <section className="bc-price-check" aria-labelledby="shelf-price-heading">
                  <div className="bc-section-heading">
                    <span>Price read</span>
                    <h3 id="shelf-price-heading">Shelf price</h3>
                  </div>
                  {typeof bottle.msrp === "number" ? (
                    <>
                      <label htmlFor="shelf-price-input">What price are you looking at?</label>
                      <div className="bc-price-input-wrap">
                        <span aria-hidden="true">$</span>
                        <input
                          id="shelf-price-input"
                          type="number"
                          min="0.01"
                          max="99999"
                          step="0.01"
                          inputMode="decimal"
                          value={shelfPrice}
                          onChange={(event) => setShelfPrice(event.target.value)}
                          placeholder={bottle.msrp.toFixed(2)}
                        />
                      </div>
                      {shelfPriceAssessment ? (
                        <div className={`bc-price-read ${shelfPriceAssessment.tone}`} role="status" aria-live="polite">
                          <div>
                            <strong>{shelfPriceAssessment.label}</strong>
                            <span>{shelfPriceAssessment.premiumPercent > 0 ? "+" : ""}{Number(shelfPriceAssessment.premiumPercent.toFixed(2))}% vs. MSRP</span>
                          </div>
                          <p>{shelfPriceAssessment.detail}</p>
                        </div>
                      ) : (
                        <p className="bc-price-help">Enter the shelf price to compare it with the MSRP listed in Bottle Check.</p>
                      )}
                      <small>This is a retail price comparison, not a live inventory or secondary-market estimate.</small>
                    </>
                  ) : (
                    <p className="bc-price-help">Bottle Check does not list an MSRP for this bottle yet, so it will not calculate a comparison.</p>
                  )}
                </section>

                {signal ? (
                  <div className={`bc-score ${scoreTone(signal.rarityScore)}`}>
                    <div>
                      <span>{classificationIsUnderReview ? "Evidence status" : "Rarity Score"}</span>
                      <strong>{classificationIsUnderReview ? "—" : signal.rarityScore}</strong>
                    </div>
                    <p>{classificationIsUnderReview ? "Scarcity under review" : signal.label}</p>
                    <small>{signal.scoreBasis}</small>
                  </div>
                ) : null}

                {signal ? (
                  <div className="bc-classification-context">
                    <div>
                      <span>National baseline</span>
                      <strong>{signal.nationalLabel}</strong>
                    </div>
                    <div>
                      <span>{resultStateName}</span>
                      <strong>{signal.localClassificationEstablished ? signal.marketLabel : "Local classification not established"}</strong>
                    </div>
                    <p>{signal.localClassificationEstablished ? signal.localReason : "We use the national baseline until authoritative local evidence or normalized market coverage supports an override."}</p>
                    {signal.releaseBadges.length ? <div className="bc-release-badges">{signal.releaseBadges.map((badge) => <em key={badge}>{badge}</em>)}</div> : null}
                  </div>
                ) : null}

                {memberTasteScore ? (
                  <div className="bc-member-taste-score">
                    <div>
                      <span>Member Taste Score</span>
                      <strong>{(memberTasteScore.average / 10).toFixed(1)}</strong>
                    </div>
                    <p>{memberTasteScore.label}</p>
                    <small>{memberTasteScore.count} member {memberTasteScore.count === 1 ? "rating" : "ratings"} from saved collections.</small>
                  </div>
                ) : null}
                <div className="bc-guidance">
                  <h3>In-store read</h3>
                  <p>{classificationIsUnderReview ? "This bottle's scarcity tier is still being sourced. Use recent local sightings and price context; do not treat the current tier as verified." : (signal?.verdict || bottle.guidance)}</p>
                  <small>{classificationIsUnderReview ? "Purchase guidance is withheld until this classification has enough evidence." : bottle.guidance}</small>
                </div>

                <div className="bc-bottle-actions" aria-label="Bottle actions">
                  <div>
                    <strong>{isInCollection ? "In your collection" : "Save this bottle"}</strong>
                    <p>{collectionRatingCopy || "Add it to your collection now and rate it later from the member dashboard."}</p>
                    {collectionError ? <small className="bc-track-error" role="alert">{collectionError}</small> : null}
                    <div role="status" aria-live="polite">
                      {effectiveCollectionSaveState === "saved" ? <small className="bc-track-success">Added to your collection.</small> : null}
                      {effectiveCollectionSaveState === "pending" ? <small className="bc-track-pending">Saved on this device. Retry now, or it will sync automatically when your collection reloads online.</small> : null}
                    </div>
                  </div>
                  {!isInCollection || effectiveCollectionSaveState === "pending" || effectiveCollectionSaveState === "conflict" ? (
                    <button
                      type="button"
                      onClick={addBottleToCollection}
                      disabled={savingCollection || prefsLoading}
                    >
                      {!isSignedIn
                        ? "Sign in to add"
                        : prefsLoading
                          ? "Loading..."
                          : savingCollection
                            ? "Adding..."
                            : effectiveCollectionSaveState === "pending"
                              ? "Retry sync"
                              : effectiveCollectionSaveState === "conflict"
                                ? "Retry save"
                                : "Add to collection"}
                    </button>
                  ) : null}
                </div>

                <div className="bc-track-box">
                  {isRegular ? (
                    <p><strong>No alert settings for regularly available bottles in this market.</strong> Bottle Check can still help you evaluate it, but everyday shelf bottles stay out of alert/watchlist noise.</p>
                  ) : canTrack ? (
                    <>
                      <div className="bc-track-content">
                        <p><strong>Track this bottle</strong> saves it to your alert preferences for selected markets.</p>
                        <div className="bc-market-picker" aria-label="Choose markets to track this bottle">
                          {activeStates.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              className={trackingStates.includes(item.code) ? "selected" : ""}
                              onClick={() => toggleTrackingState(item.code)}
                            >
                              {item.code}
                            </button>
                          ))}
                        </div>
                        <small>Saves selected markets now. Use the dashboard afterward for board, city, or store-level territory refinement.</small>
                        {trackError ? <small className="bc-track-error" role="alert">{trackError}</small> : null}
                        <div role="status" aria-live="polite">
                          {trackSaved ? <small className="bc-track-success">Saved to your alert preferences.</small> : null}
                        </div>
                      </div>
                      <button type="button" onClick={trackBottle} disabled={savingTrack || prefsLoading || (trackActionAccess.allowed && isTracked)}>
                        {!isSignedIn
                          ? "Sign in to track"
                          : prefsLoading
                            ? "Loading..."
                            : savingTrack
                              ? "Saving..."
                              : trackActionAccess.allowed && isTracked
                                ? "Tracked"
                                : "Track this bottle"}
                      </button>
                    </>
                  ) : (
                    <p><strong>Alerts are not enabled for this bottle yet.</strong> {signal?.trackDisabledReason || "This bottle is still being evaluated for future alert support."}</p>
                  )}
                </div>
              </article>

              <aside className="bc-detail-card">
                <h3>Local signal in {resultStateName}</h3>
                <p className="bc-local-note">Recent Bourbon Signal sightings for the selected market. This is not a live shelf confirmation.</p>
                <p className="bc-local-confidence">Signal coverage: {signal?.signalConfidence || "low"} confidence</p>
                <div className="bc-stat-grid">
                  <div><span>Last seen</span><strong>{formatDate(signal?.lastSeenAt)}</strong></div>
                  <div><span>30 days</span><strong>{signal?.recentCount30d ?? 0}</strong></div>
                  <div><span>90 days</span><strong>{signal?.recentCount90d ?? 0}</strong></div>
                </div>

                <div className="bc-recent">
                  <h4>Recent sightings</h4>
                  {signal?.recentLocations?.length ? (
                    signal.recentLocations.map((location, index) => (
                      <div className="bc-sighting" key={`${location.label}-${location.seenAt}-${index}`}>
                        <strong>{location.label}</strong>
                        <span>{location.signalLabel || "Bottle signal"} · {formatDate(location.seenAt)}</span>
                      </div>
                    ))
                  ) : (
                    <p>No recent Bourbon Signal sightings for this bottle in the current engine window.</p>
                  )}
                </div>
              </aside>
            </div>
          )}
        </section>
      </main>
      <dialog
        ref={upgradeDialogRef}
        className="bc-upgrade-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bc-upgrade-title"
        aria-describedby="bc-upgrade-description"
        onCancel={(event) => {
          event.preventDefault();
          setUpgradePrompt(null);
        }}
        onClose={() => setUpgradePrompt(null)}
      >
        {upgradePrompt ? (
          <>
            <button type="button" className="bc-dialog-close" aria-label="Close upgrade note" onClick={() => setUpgradePrompt(null)}>×</button>
            <span className="bc-dialog-kicker">{upgradePrompt.requiredTier}</span>
            <h2 id="bc-upgrade-title">{upgradePrompt.title}</h2>
            <p id="bc-upgrade-description">{upgradePrompt.description}</p>
            <div className="bc-dialog-actions">
              <a href={`/pricing?source=bottle-check&action=${upgradePrompt.action}`}>View membership options</a>
              <button type="button" onClick={() => setUpgradePrompt(null)}>Not now</button>
            </div>
          </>
        ) : null}
      </dialog>
      <Footer />
    </>
  );
}

const bottleCheckCss = `
.bottle-check-page { min-height: 100vh; padding-top: 96px; overflow-x:hidden; background: radial-gradient(circle at 48% 0%, rgba(196,148,58,0.14), transparent 34%), radial-gradient(circle at 82% 28%, rgba(184,115,51,0.08), transparent 30%), var(--color-bg-primary); color: var(--color-text-primary); }
.bc-hero, .bc-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; box-sizing:border-box; }
.bc-hero { padding: 54px 0 26px; }
.bc-kicker { margin:0 0 14px; color:var(--color-accent-amber); font:900 11px/1 var(--font-jetbrains); letter-spacing:.15em; text-transform:uppercase; }
.bc-hero h1 { max-width: 920px; font-family: var(--font-playfair); font-size: clamp(42px, 7vw, 78px); line-height: .94; letter-spacing: -.045em; margin: 0; overflow-wrap:break-word; }
.bc-hero-copy { max-width:720px; margin:20px 0 0; color:var(--color-text-secondary); font:16px/1.6 var(--font-dm-sans); }
.bc-shell { padding: 10px 0 78px; }
.bc-search-card { display:flex; align-items:flex-end; gap:12px; width:100%; max-width:100%; box-sizing:border-box; padding:18px; border-radius:var(--radius-feature); background:linear-gradient(180deg, var(--surface-raised), var(--surface-soft)); box-shadow:0 24px 72px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.045); }
.bc-field { display:grid; gap:8px; min-width:0; max-width:100%; }
.bc-field.grow { position:relative; z-index:8; flex:1 1 0; min-width:0; }
.bc-field.state { width:220px; min-width:0; }
.bc-field label { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-search-input-wrap { position:relative; min-width:0; max-width:100%; }
.bc-field input { width:100%; max-width:100%; box-sizing:border-box; height:48px; border-radius:14px; border:1px solid rgba(196,148,58,.26); background:rgba(13,11,8,.62); color:var(--color-cream); padding:0 50px 0 15px; font:700 15px/1 var(--font-dm-sans); outline:none; }
.bc-field input:focus { border-color:rgba(212,164,74,.78); box-shadow:0 0 0 3px rgba(212,164,74,.12); }
.bc-search-clear { position:absolute; right:8px; top:50%; transform:translateY(-50%); appearance:none; width:32px; height:32px; border:1px solid rgba(247,240,224,.10); border-radius:999px; background:rgba(255,255,255,.045); color:var(--color-text-secondary); display:grid; place-items:center; padding:0; font:800 22px/0 var(--font-dm-sans); cursor:pointer; }
.bc-search-clear:hover, .bc-search-clear:focus-visible { color:var(--color-text-primary); border-color:rgba(212,146,11,.34); outline:none; }
.bc-live-suggestions { position:absolute; z-index:30; top:calc(100% + 7px); left:0; right:0; display:grid; gap:7px; width:100%; max-width:100%; max-height:min(420px,60vh); min-width:0; overflow-y:auto; padding:8px; box-sizing:border-box; border:1px solid rgba(196,148,58,.2); border-radius:16px; background:rgba(13,10,8,.985); box-shadow:0 20px 48px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.04); }
.bc-live-suggestions button { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; max-width:100%; min-width:0; box-sizing:border-box; text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:13px; background:rgba(255,255,255,.035); color:var(--color-text-primary); padding:9px 10px 9px 12px; font:800 13px/1.2 var(--font-dm-sans); cursor:pointer; }
.bc-live-suggestions button:hover, .bc-live-suggestions button:focus-visible { border-color:rgba(196,148,58,.48); background:rgba(196,148,58,.095); outline:none; }
.bc-live-suggestions .bc-live-missing { margin-top:6px; border-color:rgba(196,148,58,.32); background:rgba(196,148,58,.11); }
.bc-live-suggestions .bc-live-missing em { color:var(--color-accent-amber); }
.bc-live-suggestions span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bc-live-suggestions .bc-tier { flex-shrink:0; min-width:0; max-width:42vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bc-suggestion-loading { padding:12px; color:var(--color-text-secondary); font:700 13px/1.3 var(--font-dm-sans); }
.bc-search-card > button, .bc-track-box > button, .bc-bottle-actions > button { height:48px; border:none; border-radius:14px; background:linear-gradient(135deg, #C4943A 0%, #D4A44A 100%); color:#14100C; padding:0 18px; font:900 14px/1 var(--font-dm-sans); cursor:pointer; flex-shrink:0; }
.bc-track-box > button:disabled, .bc-bottle-actions > button:disabled { cursor:default; opacity:.72; }
.bc-panel { margin-top:22px; border-top:1px solid var(--boundary-subtle); padding:24px 4px; background:transparent; color:var(--color-text-secondary); font:14px/1.7 var(--font-dm-sans); }
.bc-panel strong { color:var(--color-cream); display:block; font:700 22px/1.2 var(--font-playfair); margin-bottom:8px; }
.bc-result-grid { display:grid; grid-template-columns:minmax(0, 1.35fr) minmax(320px, .85fr); gap:16px; margin-top:18px; }
.bc-verdict-card, .bc-detail-card { border-radius:var(--radius-feature); background:linear-gradient(180deg, rgba(255,255,255,.046), rgba(255,255,255,.018)); box-shadow:0 24px 72px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.035); padding:28px; }
.bc-verdict-card { background:radial-gradient(circle at 16% 0%, rgba(196,148,58,.16), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.024)); }
.bc-card-topline { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.bc-tier { display:inline-flex; border-radius:999px; padding:7px 10px; font:900 10px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; border:1px solid rgba(245,237,214,.14); color:var(--color-text-secondary); background:rgba(255,255,255,.04); }
.bc-tier.allocated, .bc-tier.highly_allocated, .bc-tier.unicorn { border-color:rgba(196,148,58,.38); color:var(--color-accent-amber); background:rgba(196,148,58,.10); }
.bc-tier.regular { border-color:rgba(245,237,214,.11); color:rgba(245,237,214,.58); }
.bc-confidence { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.08em; text-transform:uppercase; }
.bc-verdict-card h2 { margin:18px 0 0; font:700 clamp(32px, 5vw, 56px)/.98 var(--font-playfair); letter-spacing:-.035em; color:var(--color-cream); }
.bc-summary { margin:14px 0 0; color:var(--color-text-secondary); font:16px/1.7 var(--font-dm-sans); }
.bc-dossier-section, .bc-price-check { margin-top:22px; border:1px solid rgba(245,237,214,.085); border-radius:18px; padding:18px; background:rgba(0,0,0,.15); }
.bc-section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:14px; }
.bc-section-heading span { color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.11em; text-transform:uppercase; }
.bc-section-heading h3 { margin:0; color:var(--color-cream); font:800 17px/1 var(--font-dm-sans); }
.bc-fact-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; margin:0; }
.bc-fact-grid div { min-width:0; border-radius:13px; padding:12px; background:rgba(255,255,255,.035); }
.bc-fact-grid dt { color:var(--color-text-tertiary); font:900 9px/1 var(--font-dm-sans); letter-spacing:.09em; text-transform:uppercase; }
.bc-fact-grid dd { margin:7px 0 0; color:var(--color-cream); font:800 14px/1.3 var(--font-dm-sans); text-transform:capitalize; overflow-wrap:anywhere; }
.bc-price-check > label { display:block; margin-bottom:8px; color:var(--color-text-secondary); font:700 12px/1.3 var(--font-dm-sans); }
.bc-price-input-wrap { position:relative; width:min(240px,100%); }
.bc-price-input-wrap > span { position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--color-accent-amber); font:800 16px/1 var(--font-dm-sans); pointer-events:none; }
.bc-price-input-wrap input { width:100%; height:48px; box-sizing:border-box; border:1px solid rgba(196,148,58,.32); border-radius:13px; background:rgba(13,11,8,.68); color:var(--color-cream); padding:0 14px 0 30px; font:800 16px/1 var(--font-dm-sans); outline:none; }
.bc-price-input-wrap input:focus { border-color:rgba(212,164,74,.78); box-shadow:0 0 0 3px rgba(212,164,74,.12); }
.bc-price-read { display:grid; grid-template-columns:minmax(130px,.55fr) minmax(0,1fr); gap:14px; align-items:center; margin-top:12px; border-radius:14px; padding:14px; background:rgba(255,255,255,.035); }
.bc-price-read strong, .bc-price-read span { display:block; }
.bc-price-read strong { color:var(--color-cream); font:900 15px/1.2 var(--font-dm-sans); }
.bc-price-read span { margin-top:5px; color:var(--color-text-tertiary); font:800 10px/1 var(--font-dm-sans); letter-spacing:.07em; text-transform:uppercase; }
.bc-price-read p { margin:0; color:var(--color-text-secondary); font:13px/1.5 var(--font-dm-sans); }
.bc-price-read.near { border-left:3px solid #79b890; }
.bc-price-read.moderate { border-left:3px solid var(--color-accent-amber); }
.bc-price-read.high { border-left:3px solid #d4875c; }
.bc-price-help { margin:0; color:var(--color-text-secondary); font:13px/1.55 var(--font-dm-sans); }
.bc-price-check > small { display:block; margin-top:10px; color:var(--color-text-tertiary); font:11px/1.45 var(--font-dm-sans); }
.bc-score { margin-top:22px; display:grid; grid-template-columns:150px minmax(0,1fr); gap:16px; align-items:center; border-radius:18px; padding:20px; background:linear-gradient(135deg, rgba(0,0,0,.22), rgba(196,148,58,.065)); }
.bc-score span { display:block; color:var(--color-text-tertiary); font:900 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-score strong { display:block; margin-top:8px; font:800 54px/.85 var(--font-playfair); color:var(--color-cream); }
.bc-score p { margin:0; color:var(--color-text-primary); font:800 20px/1.25 var(--font-dm-sans); }
.bc-score small { display:block; margin-top:6px; color:var(--color-text-tertiary); font:700 12px/1.35 var(--font-dm-sans); }
.bc-score.hot { box-shadow:inset 0 1px 0 rgba(232,201,122,.10); }
.bc-score.hot strong, .bc-score.warm strong { color:var(--color-accent-amber); }
.bc-score.quiet strong { color:rgba(245,237,214,.55); }
.bc-classification-context { margin-top:12px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; border-radius:16px; padding:14px 16px; background:rgba(0,0,0,.16); border:1px solid rgba(245,237,214,.07); }
.bc-classification-context > div { min-width:0; }
.bc-classification-context span { display:block; color:var(--color-text-tertiary); font:900 10px/1 var(--font-dm-sans); letter-spacing:.09em; text-transform:uppercase; }
.bc-classification-context strong { display:block; margin-top:6px; color:var(--color-cream); font:800 14px/1.3 var(--font-dm-sans); }
.bc-classification-context > p { grid-column:1/-1; margin:2px 0 0; color:var(--color-text-tertiary); font:12px/1.45 var(--font-dm-sans); }
.bc-release-badges { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:6px; }
.bc-release-badges em { border-radius:999px; padding:5px 8px; background:rgba(196,148,58,.09); color:var(--color-accent-amber); font:800 10px/1 var(--font-dm-sans); font-style:normal; }
.bc-local-confidence { margin:5px 0 0; color:var(--color-text-tertiary); font:800 10px/1.3 var(--font-dm-sans); letter-spacing:.07em; text-transform:uppercase; }
.bc-member-taste-score { margin-top:12px; display:grid; grid-template-columns:116px minmax(0,1fr); gap:14px; align-items:center; border-radius:18px; padding:14px 16px; background:linear-gradient(135deg, rgba(196,148,58,.085), rgba(0,0,0,.16)); }
.bc-member-taste-score span { display:block; color:rgba(232,201,122,.78); font:900 10px/1 var(--font-jetbrains); letter-spacing:.11em; text-transform:uppercase; }
.bc-member-taste-score strong { display:block; margin-top:6px; font:800 34px/.9 var(--font-playfair); color:var(--color-accent-amber); }
.bc-member-taste-score p { margin:0; color:var(--color-cream); font:800 15px/1.25 var(--font-dm-sans); }
.bc-member-taste-score small { display:block; margin-top:5px; color:var(--color-text-tertiary); font:700 12px/1.35 var(--font-dm-sans); }
.bc-guidance { margin-top:22px; }
.bc-guidance h3, .bc-detail-card h3, .bc-recent h4, .bc-suggestions h4 { margin:0; color:var(--color-cream); font:800 15px/1 var(--font-dm-sans); letter-spacing:.04em; text-transform:uppercase; }
.bc-guidance p { margin:10px 0 0; color:var(--color-text-primary); font:16px/1.7 var(--font-dm-sans); }
.bc-guidance small { display:block; margin-top:8px; color:var(--color-text-tertiary); font:13px/1.6 var(--font-dm-sans); }
.bc-bottle-actions { margin-top:22px; display:flex; justify-content:space-between; align-items:center; gap:16px; border:1px solid rgba(245,237,214,.08); border-radius:16px; padding:16px; background:rgba(255,255,255,.025); }
.bc-bottle-actions strong { display:block; color:var(--color-cream); font:800 14px/1.2 var(--font-dm-sans); }
.bc-bottle-actions p { margin:6px 0 0; color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.bc-bottle-actions small { display:block; margin-top:6px; font:12px/1.4 var(--font-dm-sans); }
.bc-track-error { color:#ffb4a8; }
.bc-track-success { color:#9AD4B1; }
.bc-track-pending { color:var(--color-accent-amber); }
.bc-track-box { margin-top:22px; border-top:1px solid var(--boundary-accent); background:rgba(196,148,58,.045); padding:16px 4px 0; display:flex; justify-content:space-between; gap:16px; align-items:center; }
.bc-track-box p { margin:0; color:var(--color-text-secondary); font:13px/1.65 var(--font-dm-sans); }
.bc-track-box strong { color:var(--color-cream); }
.bc-track-content { display:grid; gap:10px; min-width:0; }
.bc-track-content small { color:var(--color-text-tertiary); font:12px/1.45 var(--font-dm-sans); }
.bc-market-picker { display:flex; flex-wrap:wrap; gap:7px; }
.bc-market-picker button { border:1px solid rgba(245,237,214,.12); border-radius:999px; background:rgba(255,255,255,.035); color:var(--color-text-secondary); padding:7px 10px; font:900 11px/1 var(--font-dm-sans); cursor:pointer; }
.bc-market-picker button.selected { border-color:rgba(196,148,58,.52); background:rgba(196,148,58,.15); color:var(--color-accent-amber); }
.bc-track-content .bc-track-error { color:#ffb4a8; }
.bc-track-content .bc-track-success { color:#9AD4B1; }
.bc-detail-card { display:grid; gap:20px; align-content:start; }
.bc-local-note { margin:-8px 0 0; color:var(--color-text-secondary); font:13px/1.55 var(--font-dm-sans); }
.bc-stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.bc-stat-grid div { border-radius:16px; background:rgba(0,0,0,.16); padding:12px; }
.bc-stat-grid span { display:block; color:var(--color-text-tertiary); font:800 10px/1 var(--font-dm-sans); letter-spacing:.08em; text-transform:uppercase; }
.bc-stat-grid strong { display:block; margin-top:8px; color:var(--color-cream); font:800 16px/1.2 var(--font-dm-sans); }
.bc-recent, .bc-suggestions { display:grid; gap:10px; }
.bc-sighting { border-bottom:1px solid var(--boundary-subtle); padding:12px 2px; background:transparent; }
.bc-sighting strong { display:block; color:var(--color-cream); font:800 13px/1.25 var(--font-dm-sans); }
.bc-sighting span, .bc-recent p { display:block; margin-top:5px; color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.bc-suggestions button { text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:12px; background:rgba(255,255,255,.03); color:var(--color-text-primary); padding:10px 12px; font:700 13px/1.2 var(--font-dm-sans); cursor:pointer; }
.bc-upgrade-dialog { position:relative; width:min(480px,calc(100% - 32px)); box-sizing:border-box; border:1px solid rgba(196,148,58,.32); border-radius:24px; padding:30px; background:linear-gradient(180deg,#211a13,#14110d); color:var(--color-text-primary); box-shadow:0 30px 90px rgba(0,0,0,.68); }
.bc-upgrade-dialog::backdrop { background:rgba(5,4,3,.76); backdrop-filter:blur(5px); }
.bc-dialog-close { position:absolute; top:12px; right:12px; width:36px; height:36px; border:1px solid rgba(245,237,214,.12); border-radius:999px; background:rgba(255,255,255,.04); color:var(--color-text-secondary); font:800 22px/1 var(--font-dm-sans); cursor:pointer; }
.bc-dialog-kicker { display:block; color:var(--color-accent-amber); font:900 10px/1 var(--font-jetbrains); letter-spacing:.11em; text-transform:uppercase; }
.bc-upgrade-dialog h2 { margin:12px 36px 0 0; color:var(--color-cream); font:700 30px/1.08 var(--font-playfair); }
.bc-upgrade-dialog p { margin:14px 0 0; color:var(--color-text-secondary); font:14px/1.65 var(--font-dm-sans); }
.bc-dialog-actions { display:flex; align-items:center; gap:10px; margin-top:22px; }
.bc-dialog-actions a, .bc-dialog-actions button { min-height:46px; display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; border-radius:13px; padding:0 16px; font:900 13px/1 var(--font-dm-sans); text-decoration:none; cursor:pointer; }
.bc-dialog-actions a { border:0; background:linear-gradient(135deg,#C4943A,#D4A44A); color:#14100C; }
.bc-dialog-actions button { border:1px solid rgba(245,237,214,.12); background:transparent; color:var(--color-text-secondary); }
@media (max-width: 900px) { .bc-search-card, .bc-result-grid, .bc-score, .bc-member-taste-score, .bc-track-box, .bc-bottle-actions { grid-template-columns:1fr; flex-direction:column; align-items:stretch; } .bc-field, .bc-field.grow, .bc-field.state { width:100%; max-width:100%; } .bc-search-card > button, .bc-track-box > button, .bc-bottle-actions > button { width:100%; } .bc-stat-grid { grid-template-columns:1fr; } }
@media (max-width: 520px) { .bc-hero, .bc-shell { width:calc(100% - 28px); } .bc-hero { padding-top:42px; } .bc-hero h1 { font-size:clamp(42px, 12vw, 56px); line-height:.96; } .bc-search-card { padding:14px; border-radius:22px; } .bc-live-suggestions button { grid-template-columns:minmax(0,1fr); align-items:start; gap:6px; padding:11px 12px; } .bc-live-suggestions .bc-tier { justify-self:start; max-width:100%; } .bc-classification-context, .bc-fact-grid, .bc-price-read { grid-template-columns:1fr; } .bc-classification-context > p, .bc-release-badges { grid-column:1; } .bc-dialog-actions { align-items:stretch; flex-direction:column; } .bc-dialog-actions a, .bc-dialog-actions button { width:100%; } }
`;
