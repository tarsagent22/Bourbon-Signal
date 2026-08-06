"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  Radio,
  Search,
  UsersRound,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import {
  COVERAGE_REQUEST_DRAFT_KEY,
  CoverageRequestForm,
} from "@/components/coverage/CoverageRequestForm";
import { CoverageSummary } from "@/components/coverage/CoverageSummary";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useAuth } from "@/lib/auth";
import type { CoverageContract, CoverageSearchResult, CoverageState } from "@/lib/coverage-model";
import { US_STATE_OPTIONS } from "@/lib/coverage-model";
import type { DropEvent } from "@/lib/drops";
import { recordGrowthMilestone } from "@/lib/growth-client";
import type {
  WelcomeLocalPreviewPayload,
  WelcomeLocalPreviewRecord,
  WelcomeLocalPreviewSignal,
} from "@/lib/welcome-local-preview";
import {
  welcomeLocalPreviewSignalDetails,
  welcomeLocalPreviewSignalLocation,
  welcomeLocalPreviewTargetDetails,
} from "@/lib/welcome-local-preview";
import {
  welcomeLocalPreviewCanChooseTarget,
  welcomeLocalSearchPlaceholder,
} from "@/lib/welcome-onboarding";
import {
  welcomeStateSignalRows,
  welcomeStateSignalsCanLoad,
  type WelcomeStateSignalOwner,
} from "@/lib/welcome-state-signal-access";
import styles from "./welcome.module.css";

interface DropsPreviewResponse {
  drops?: DropEvent[];
  total?: number;
  lastUpdated?: string;
  engineFresh?: boolean;
  degradedStateFallback?: boolean;
  error?: string;
}

interface CoverageDraftPreview {
  accountId?: string | null;
  stateCode?: string;
}

interface LocalPreviewResponse {
  status?: "eligible" | "active" | "expired" | "ineligible";
  remainingMs?: number;
  preview?: WelcomeLocalPreviewPayload | null;
  error?: string;
}

type LocalPreviewStatus = "loading" | "eligible" | "active" | "expired" | "ineligible" | "error";

interface UserBoundLocalPreviewState {
  userId: string;
  status: LocalPreviewStatus;
  preview: WelcomeLocalPreviewPayload | null;
  remainingMs: number;
}

type SignalCardDrop = DropEvent | WelcomeLocalPreviewSignal;

const STATE_NAMES = new Map<string, string>(US_STATE_OPTIONS.map((state) => [state.code, state.name]));
const LOCAL_SEARCH_DEBOUNCE_MS = 250;
const CoverageMap = dynamic(
  () => import("@/components/coverage/CoverageMap").then((module) => module.CoverageMap),
  { ssr: false },
);

function draftStateForAccount(accountId: string | null) {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(COVERAGE_REQUEST_DRAFT_KEY) || "null",
    ) as CoverageDraftPreview | null;
    const stateCode = typeof stored?.stateCode === "string"
      ? stored.stateCode.trim().toUpperCase()
      : "";
    const validState = US_STATE_OPTIONS.some((state) => state.code === stateCode);
    const correctAccount = !stored?.accountId || stored.accountId === accountId;
    return validState && correctAccount ? stateCode : "";
  } catch {
    return "";
  }
}

function fallbackCoverageState(code: string): CoverageState {
  return {
    code,
    name: STATE_NAMES.get(code) || code,
    capability: "not-active",
    capabilityLabel: "Not active yet",
    coverageDepth: "not-available",
    coverageDepthLabel: "Not available yet",
    coverageStatus: "not-available",
    coverageStatusLabel: "Not available yet",
    coverageStrength: "none",
    coverageStrengthLabel: "No coverage",
    capabilities: {
      storeInformation: false,
      publicUpdates: false,
      currentBottleAvailability: false,
      restockAlerts: false,
    },
    updateLabel: null,
    health: "no-recent-update",
    healthLabel: "Live coverage unavailable",
    summary: "Live coverage detail is temporarily unavailable.",
    sourceLabel: null,
    precisions: [],
    areas: [],
    representedAreaCount: 0,
    monitoredStoreCount: 0,
    layers: { known: 0, probeable: 0, catalogWatch: 0, live: 0, alertGrade: 0 },
    scope: { knownBoards: 0, trackedShipmentBoards: 0, verifiedSourceTargets: 0, verifiedSourceAreas: 0, shipmentBoards: 0, searchableStores: 0, inventoryMonitoredStores: 0, singleStoreShipmentBoards: 0 },
    freshness: {
      observedInventoryStores: 0,
      currentInventoryStores: 0,
      currentInventoryCities: 0,
      alertEligibleStores: 0,
      staleInventoryStores: 0,
      freshPublicSignals: 0,
      freshPublicUpdates: 0,
      freshPublicUpdateBoards: 0,
      freshPublicUpdateStores: 0,
      freshPublicUpdateCities: 0,
      freshPublicUpdateAreas: 0,
      stalePublicSignals: 0,
    },
    canSee: [],
    cannotSee: [],
    fingerprint: `coverage-v2|${code}|unavailable`,
  };
}

function cleanLabel(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function signalName(drop: SignalCardDrop) {
  return cleanLabel(
    drop.brand_name
      || drop.tracked_brand_name
      || drop.canonical_name
      || drop.raw_name,
  ) || "Bourbon signal";
}

function signalLocation(drop: SignalCardDrop, stateName: string) {
  return welcomeLocalPreviewSignalLocation(drop as WelcomeLocalPreviewSignal, stateName);
}

function signalDetails(drop: SignalCardDrop) {
  return welcomeLocalPreviewSignalDetails(drop as WelcomeLocalPreviewSignal);
}

function signalTime(drop: SignalCardDrop) {
  const raw = drop.last_confirmed_at || drop.observed_at || drop.event_at || drop.timestamp;
  const timestamp = Date.parse(raw || "");
  if (!Number.isFinite(timestamp)) return drop.historical ? "Historical signal" : "Update time unavailable";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
  return `${drop.historical ? "Historical" : "Updated"} ${formatted}`;
}

function localTargetStatus(status: WelcomeLocalPreviewRecord["target"]["status"]) {
  if (status === "actively-monitored" || status === "covered") return "Actively monitored";
  if (status === "partially-covered") return "Coverage available";
  return "Listed, not monitored";
}

function SignalCards({ signals, stateName }: { signals: SignalCardDrop[]; stateName: string }) {
  return (
    <ol className={styles.signalList}>
      {signals.map((drop, index) => (
        <li key={`${drop.timestamp}-${("store_id" in drop && drop.store_id) || drop.board_name || index}`}>
          <div className={styles.signalTopline}>
            <span className={styles.signalBadge}>{cleanLabel(drop.signal_label || drop.rarity_tier) || "Eligible signal"}</span>
            <span className={styles.signalTime}><Clock3 size={12} aria-hidden="true" />{signalTime(drop)}</span>
          </div>
          <h3>{signalName(drop)}</h3>
          <div className={styles.signalLocation}>
            <MapPin size={14} aria-hidden="true" />
            <strong>{signalLocation(drop, stateName)}</strong>
          </div>
          {signalDetails(drop).length ? (
            <p className={styles.signalSource}>{signalDetails(drop).join(" · ")}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function statePreviewMessage(
  stateName: string,
  coverage: CoverageState | null,
  drops: DropEvent[],
  error: string,
  degradedStateFallback: boolean,
) {
  if (error) return `Current signals for ${stateName} are temporarily unavailable.`;
  if (!drops.length && coverage?.coverageStatus === "not-available") {
    return `Bourbon Signal does not currently have useful coverage in ${stateName}.`;
  }
  if (!drops.length) return `No current signals are available in ${stateName}.`;
  if (degradedStateFallback) return `Showing recent retained signals for ${stateName} while a source recovers.`;
  return `Recent signals currently available in ${stateName}.`;
}

export default function WelcomePage() {
  const { isLoaded, isSignedIn, user } = useAuth();
  const { prefs, ready: preferencesReady, savePreferences } = useAreaPreferences();
  const authenticatedUserId = isLoaded && isSignedIn ? user?.id || null : null;
  const [selectedState, setSelectedState] = useState("");
  const [activeState, setActiveState] = useState("");
  const [editingState, setEditingState] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [stateSignalOwner, setStateSignalOwner] = useState<WelcomeStateSignalOwner<DropEvent> | null>(null);
  const [dropsError, setDropsError] = useState("");
  const [degradedStateFallback, setDegradedStateFallback] = useState(false);
  const [coverageState, setCoverageState] = useState<CoverageState | null>(null);
  const [coverageStates, setCoverageStates] = useState<CoverageState[]>([]);
  const [coverageError, setCoverageError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [localPreviewState, setLocalPreviewState] = useState<UserBoundLocalPreviewState | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [localResults, setLocalResults] = useState<CoverageSearchResult[]>([]);
  const [localSearchStatus, setLocalSearchStatus] = useState<"idle" | "searching" | "opening">("idle");
  const [localMessage, setLocalMessage] = useState("");
  const [showEarlierSignals, setShowEarlierSignals] = useState(false);
  const registrationRecorded = useRef(false);
  const freeValueRecordedFor = useRef(new Set<string>());
  const currentUserIdRef = useRef<string | null>(authenticatedUserId);
  const currentStateCodeRef = useRef(activeState);
  const localPreviewGetControllerRef = useRef<AbortController | null>(null);
  const localPreviewPostControllerRef = useRef<AbortController | null>(null);
  const localSearchControllerRef = useRef<AbortController | null>(null);
  const localSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  currentUserIdRef.current = authenticatedUserId;
  currentStateCodeRef.current = activeState;

  const currentLocalPreviewState = authenticatedUserId
    && localPreviewState?.userId === authenticatedUserId
    ? localPreviewState
    : null;
  const localPreviewStatus: LocalPreviewStatus = currentLocalPreviewState?.status
    || (isLoaded && !authenticatedUserId ? "ineligible" : "loading");
  const canShowStateSignals = welcomeStateSignalsCanLoad(localPreviewStatus);
  const drops = welcomeStateSignalRows({
    status: localPreviewStatus,
    owner: stateSignalOwner,
    userId: authenticatedUserId,
    stateCode: activeState,
  });
  const localPreview = currentLocalPreviewState?.preview || null;
  const localPreviewRemainingMs = currentLocalPreviewState?.remainingMs || 0;
  const selectedTargetDetails = localPreview ? welcomeLocalPreviewTargetDetails(localPreview.target) : [];
  const canChooseLocalPreviewTarget = welcomeLocalPreviewCanChooseTarget(localPreviewStatus);
  const localPreviewMatchesActiveState = Boolean(localPreview && localPreview.target.stateCode === activeState);

  const persistedHomeState = prefs.memberProfile?.homeState || "";
  const activeStateName = STATE_NAMES.get(activeState) || activeState;
  const requestState = useMemo(
    () => coverageState || (activeState ? fallbackCoverageState(activeState) : null),
    [activeState, coverageState],
  );
  const localSearchPlaceholder = welcomeLocalSearchPlaceholder(coverageState || fallbackCoverageState(activeState));

  useEffect(() => {
    const registrationCompleted = new URLSearchParams(window.location.search).get("registration") === "1";
    if (!registrationCompleted || !isLoaded || !isSignedIn || registrationRecorded.current) return;
    registrationRecorded.current = true;
    void recordGrowthMilestone("registration_completed", { surface: "welcome" }).then((recorded) => {
      if (recorded) window.history.replaceState({}, "", "/welcome");
      else registrationRecorded.current = false;
    });
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    localPreviewGetControllerRef.current?.abort();
    localPreviewPostControllerRef.current?.abort();
    localSearchControllerRef.current?.abort();
    if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
    localPreviewGetControllerRef.current = null;
    localPreviewPostControllerRef.current = null;
    localSearchControllerRef.current = null;
    localSearchDebounceRef.current = null;
    setLocalPreviewState(null);
    setLocalQuery("");
    setLocalResults([]);
    setLocalSearchStatus("idle");
    setLocalMessage("");
    setShowEarlierSignals(false);
    if (!isLoaded || !authenticatedUserId) return;

    const requestUserId = authenticatedUserId;
    const controller = new AbortController();
    localPreviewGetControllerRef.current = controller;
    setLocalPreviewState({ userId: requestUserId, status: "loading", preview: null, remainingMs: 0 });
    void fetch("/api/welcome/local-preview", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as LocalPreviewResponse }))
      .then(({ response, payload }) => {
        if (controller.signal.aborted || currentUserIdRef.current !== requestUserId) return;
        if (!response.ok || !payload.status) throw new Error(payload.error || "Local preview unavailable.");
        setLocalPreviewState({
          userId: requestUserId,
          status: payload.status,
          preview: payload.preview || null,
          remainingMs: Number.isFinite(payload.remainingMs) ? Math.max(0, payload.remainingMs || 0) : 0,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted && currentUserIdRef.current === requestUserId) {
          setLocalPreviewState({ userId: requestUserId, status: "error", preview: null, remainingMs: 0 });
        }
      })
      .finally(() => {
        if (localPreviewGetControllerRef.current === controller) localPreviewGetControllerRef.current = null;
      });
    return () => {
      controller.abort();
      localPreviewPostControllerRef.current?.abort();
      localSearchControllerRef.current?.abort();
      if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
      localSearchDebounceRef.current = null;
    };
  }, [authenticatedUserId, isLoaded]);

  useEffect(() => {
    if (!authenticatedUserId || localPreviewStatus !== "active" || !localPreview) return;
    const expireCurrentPreview = () => {
      setLocalPreviewState((current) => current?.userId === authenticatedUserId
        ? {
            ...current,
            status: "expired",
            preview: current.preview ? { ...current.preview, recent: [], earlier: [] } : null,
            remainingMs: 0,
          }
        : current);
      setShowEarlierSignals(false);
    };
    if (localPreviewRemainingMs <= 0) {
      expireCurrentPreview();
      return;
    }
    const timer = window.setTimeout(expireCurrentPreview, localPreviewRemainingMs);
    return () => window.clearTimeout(timer);
  }, [authenticatedUserId, localPreview, localPreviewRemainingMs, localPreviewStatus]);

  useEffect(() => {
    localSearchControllerRef.current?.abort();
    localPreviewPostControllerRef.current?.abort();
    if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
    localSearchControllerRef.current = null;
    localPreviewPostControllerRef.current = null;
    localSearchDebounceRef.current = null;
    setLocalSearchStatus("idle");
    setLocalQuery("");
    setLocalResults([]);
    setLocalMessage("");
  }, [activeState]);

  useEffect(() => {
    if (!preferencesReady) return;
    if (persistedHomeState) {
      setSelectedState(persistedHomeState);
      setActiveState(persistedHomeState);
      setEditingState(false);
      return;
    }
    const draftState = draftStateForAccount(user?.id || null);
    if (draftState) setSelectedState(draftState);
    setEditingState(true);
  }, [persistedHomeState, preferencesReady, user?.id]);

  useEffect(() => {
    if (!activeState) return;
    const controller = new AbortController();
    const requestUserId = authenticatedUserId;
    const requestStateCode = activeState;
    setPreviewLoading(true);
    setStateSignalOwner(null);
    setDropsError("");
    setCoverageState(null);
    setCoverageError("");
    setDegradedStateFallback(false);

    const loadDrops = canShowStateSignals && requestUserId ? fetch(`/api/drops?state=${encodeURIComponent(requestStateCode)}&limit=5`, {
      signal: controller.signal,
    }).then(async (response) => ({
      response,
      payload: await response.json().catch(() => ({})) as DropsPreviewResponse,
    })) : Promise.resolve(null);
    const loadCoverage = fetch("/api/coverage", {
      signal: controller.signal,
    }).then(async (response) => ({
      response,
      payload: await response.json().catch(() => ({})) as Partial<CoverageContract>,
    }));

    void Promise.allSettled([loadDrops, loadCoverage])
      .then(([dropResult, coverageResult]) => {
        if (controller.signal.aborted
          || currentUserIdRef.current !== requestUserId
          || currentStateCodeRef.current !== requestStateCode) return;
        if (!canShowStateSignals) {
          setStateSignalOwner(null);
        } else if (dropResult.status === "fulfilled" && dropResult.value?.response.ok && requestUserId) {
          const previewDrops = Array.isArray(dropResult.value.payload.drops)
            ? dropResult.value.payload.drops.slice(0, 5)
            : [];
          setStateSignalOwner({ userId: requestUserId, stateCode: requestStateCode, rows: previewDrops });
          setDegradedStateFallback(dropResult.value.payload.degradedStateFallback === true);
          if (previewDrops.length && !freeValueRecordedFor.current.has(requestStateCode)) {
            freeValueRecordedFor.current.add(requestStateCode);
            void recordGrowthMilestone("free_value_reached", {
              surface: "welcome",
              kind: "welcome_state_signals",
              market: requestStateCode,
              precision: "state_preview",
            });
          }
        } else {
          setDropsError(
            dropResult.status === "fulfilled" && dropResult.value
              ? dropResult.value.payload.error || "Latest signals are temporarily unavailable."
              : "Latest signals are temporarily unavailable.",
          );
        }

        if (coverageResult.status === "fulfilled"
          && coverageResult.value.response.ok
          && Array.isArray(coverageResult.value.payload.states)) {
          setCoverageStates(coverageResult.value.payload.states);
          const current = coverageResult.value.payload.states.find((state) => state.code === requestStateCode) || null;
          setCoverageState(current);
          if (!current) setCoverageError("Coverage detail for this state is temporarily unavailable.");
        } else {
          setCoverageError("Live coverage detail is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    return () => controller.abort();
  }, [activeState, authenticatedUserId, canShowStateSignals]);

  async function saveHomeState() {
    if (!selectedState || localSearchStatus === "opening") return;
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      await savePreferences({
        memberProfile: {
          homeState: selectedState,
          homeStateSelectedAt: null,
        },
      });
      setActiveState(selectedState);
      setEditingState(false);
      setSaveStatus("idle");
      void recordGrowthMilestone("onboarding_state_selected", {
        surface: "welcome",
        kind: "state_selection",
        market: selectedState,
        precision: "state_preview",
      });
    } catch {
      setSaveStatus("error");
      setSaveMessage("We could not save your home state. Please try again.");
    }
  }

  const runLocalPreviewSearch = useCallback(async (
    rawQuery: string,
    announceEmpty: boolean,
    requestUserId: string | null,
    requestStateCode: string,
  ) => {
    const query = rawQuery.replace(/\s+/g, " ").trim();
    if (!requestStateCode
      || query.length < 2
      || !requestUserId
      || !welcomeLocalPreviewCanChooseTarget(localPreviewStatus)
      || localPreviewPostControllerRef.current
      || currentUserIdRef.current !== requestUserId
      || currentStateCodeRef.current !== requestStateCode) return;
    localSearchControllerRef.current?.abort();
    const controller = new AbortController();
    localSearchControllerRef.current = controller;
    setLocalSearchStatus("searching");
    setLocalMessage("");
    try {
      const response = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: requestStateCode, query }),
        signal: controller.signal,
      });
      const payload = await response.json() as { results?: CoverageSearchResult[]; error?: string };
      if (controller.signal.aborted
        || currentUserIdRef.current !== requestUserId
        || currentStateCodeRef.current !== requestStateCode) return;
      if (!response.ok || !Array.isArray(payload.results)) throw new Error(payload.error || "Search unavailable.");
      const queryToken = cleanLabel(query).toLowerCase();
      const results = payload.results
        .filter((result) => result.kind !== "unknown" && result.status !== "not-found")
        .sort((left, right) => {
          const rank = (result: CoverageSearchResult) => {
            const label = cleanLabel(result.label).toLowerCase();
            if (label === queryToken) return 0;
            if (label.startsWith(queryToken)) return 1;
            return 2;
          };
          return rank(left) - rank(right) || left.label.localeCompare(right.label);
        })
        .slice(0, 6);
      setLocalResults(results);
      if (announceEmpty && !results.length) setLocalMessage("No listed match yet. Try a nearby board or city.");
    } catch (error) {
      if (!controller.signal.aborted
        && currentUserIdRef.current === requestUserId
        && currentStateCodeRef.current === requestStateCode) {
        setLocalMessage(error instanceof Error ? error.message : "Search unavailable.");
      }
    } finally {
      if (localSearchControllerRef.current === controller) {
        localSearchControllerRef.current = null;
        if (currentUserIdRef.current === requestUserId
          && currentStateCodeRef.current === requestStateCode
          && !localPreviewPostControllerRef.current) setLocalSearchStatus("idle");
      }
    }
  }, [localPreviewStatus]);

  useEffect(() => {
    if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
    localSearchControllerRef.current?.abort();
    const query = localQuery.replace(/\s+/g, " ").trim();
    const scheduledUserId = currentUserIdRef.current;
    const scheduledStateCode = currentStateCodeRef.current;
    setLocalResults([]);
    setLocalMessage("");
    if (!canChooseLocalPreviewTarget
      || !activeState
      || query.length < 2
      || !scheduledUserId
      || localPreviewPostControllerRef.current) {
      if (!localPreviewPostControllerRef.current) setLocalSearchStatus("idle");
      return;
    }
    localSearchDebounceRef.current = setTimeout(() => {
      localSearchDebounceRef.current = null;
      void runLocalPreviewSearch(query, false, scheduledUserId, scheduledStateCode);
    }, LOCAL_SEARCH_DEBOUNCE_MS);
    return () => {
      if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
      localSearchDebounceRef.current = null;
    };
  }, [activeState, canChooseLocalPreviewTarget, localQuery, runLocalPreviewSearch]);

  async function searchLocalPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
    localSearchDebounceRef.current = null;
    await runLocalPreviewSearch(
      localQuery,
      true,
      currentUserIdRef.current,
      currentStateCodeRef.current,
    );
  }

  async function openLocalPreview(result: CoverageSearchResult) {
    const requestUserId = currentUserIdRef.current;
    const requestStateCode = currentStateCodeRef.current;
    if (!result.canonicalTargetKey
      || !requestUserId
      || result.stateCode !== requestStateCode
      || !canChooseLocalPreviewTarget
      || localPreviewPostControllerRef.current) return;
    if (localSearchDebounceRef.current) clearTimeout(localSearchDebounceRef.current);
    localSearchDebounceRef.current = null;
    localSearchControllerRef.current?.abort();
    localSearchControllerRef.current = null;
    setLocalResults([]);
    const controller = new AbortController();
    localPreviewPostControllerRef.current = controller;
    setLocalSearchStatus("opening");
    setLocalMessage("");
    try {
      const response = await fetch("/api/welcome/local-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateCode: result.stateCode,
          label: result.label,
          canonicalTargetKey: result.canonicalTargetKey,
        }),
        signal: controller.signal,
      });
      const payload = await response.json() as LocalPreviewResponse;
      if (controller.signal.aborted
        || currentUserIdRef.current !== requestUserId
        || currentStateCodeRef.current !== requestStateCode) return;
      if (!response.ok || !payload.status || !payload.preview) throw new Error(payload.error || "Preview unavailable.");
      setLocalPreviewState({
        userId: requestUserId,
        status: payload.status,
        preview: payload.preview,
        remainingMs: Number.isFinite(payload.remainingMs) ? Math.max(0, payload.remainingMs || 0) : 0,
      });
      setLocalResults([]);
      setShowEarlierSignals(false);
      void recordGrowthMilestone("free_value_reached", {
        surface: "welcome",
        kind: "welcome_local_signal_preview",
        market: payload.preview.target.stateCode,
        precision: payload.preview.target.kind === "store" ? "store_area_preview" : "area_preview",
      });
    } catch (error) {
      if (!controller.signal.aborted
        && currentUserIdRef.current === requestUserId
        && currentStateCodeRef.current === requestStateCode) {
        setLocalMessage(error instanceof Error ? error.message : "Preview unavailable.");
      }
    } finally {
      if (localPreviewPostControllerRef.current === controller) {
        localPreviewPostControllerRef.current = null;
        if (currentUserIdRef.current === requestUserId
          && currentStateCodeRef.current === requestStateCode) setLocalSearchStatus("idle");
      }
    }
  }

  const previewMessage = statePreviewMessage(
    activeStateName,
    coverageState,
    drops,
    dropsError,
    degradedStateFallback,
  );

  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <div className={styles.journey}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>Welcome</p>
            <h1>Check out Bourbon Signal.</h1>
            <p>Choose a home state and start exploring.</p>
          </header>

          {!preferencesReady ? (
            <p className={styles.loading} aria-live="polite">Loading your member profile…</p>
          ) : editingState || !activeState ? (
            <section className={styles.stateChooser} aria-labelledby="home-state-heading">
              <div>
                <p className={styles.stepLabel}>First, choose one state</p>
                <h2 id="home-state-heading">Where do you hunt most often?</h2>
                <p>Choose any U.S. state or the District of Columbia. We will show exactly what current sources support there.</p>
              </div>
              <label htmlFor="welcome-state">Home state</label>
              <select
                id="welcome-state"
                value={selectedState}
                onChange={(event) => {
                  setSelectedState(event.target.value);
                  setSaveStatus("idle");
                  setSaveMessage("");
                }}
                required
              >
                <option value="">Choose a state</option>
                {US_STATE_OPTIONS.map((state) => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
              <div className={styles.chooserActions}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={!selectedState || saveStatus === "saving" || localSearchStatus === "opening"}
                  onClick={saveHomeState}
                >
                  {saveStatus === "saving" ? "Saving state…" : activeState ? "Save new home state" : "Show my state preview"}
                </button>
                {activeState ? (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => {
                      setSelectedState(activeState);
                      setEditingState(false);
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <p className={styles.inlineError} role={saveStatus === "error" ? "alert" : undefined}>{saveMessage}</p>
            </section>
          ) : null}

          {activeState ? (
            <>
              <section className={`${styles.section} ${styles.signalSection}`} aria-labelledby="state-preview-heading">
                <div className={styles.sectionHeading}>
                  <div className={styles.headingGroup}>
                    <span className={styles.landmark} aria-hidden="true">01</span>
                    <div>
                      <p className={styles.stepLabel}>Your latest state preview</p>
                      <h2 id="state-preview-heading">{activeStateName}</h2>
                    </div>
                  </div>
                  {!editingState ? (
                    <button
                      type="button"
                      className={styles.changeState}
                      onClick={() => {
                        setSelectedState(activeState);
                        setEditingState(true);
                      }}
                    >
                      Change state
                    </button>
                  ) : null}
                </div>

                {canChooseLocalPreviewTarget ? (
                  <div className={styles.localPreviewBox}>
                    <div className={styles.localPreviewIntro}>
                      <div>
                        <p>{localPreviewStatus === "active" ? "Explore another location" : "One-time local preview"}</p>
                        <h3>{localPreviewStatus === "active" ? `Explore ${activeStateName}.` : "Make these signals local."}</h3>
                      </div>
                      <span>{localPreviewStatus === "active" ? `${Math.max(1, Math.ceil(localPreviewRemainingMs / 60_000))} min left` : "15 minutes"}</span>
                    </div>
                    <form className={styles.localPreviewSearch} onSubmit={searchLocalPreview}>
                      <label htmlFor="welcome-local-search">ABC board, city, or store</label>
                      <div>
                        <input
                          id="welcome-local-search"
                          value={localQuery}
                          maxLength={120}
                          autoComplete="off"
                          disabled={localSearchStatus === "opening"}
                          onChange={(event) => setLocalQuery(event.target.value)}
                          placeholder={localSearchPlaceholder}
                        />
                        <button type="submit" disabled={localQuery.trim().length < 2 || localSearchStatus !== "idle"}>{localSearchStatus === "searching" ? "Checking…" : "Find"}</button>
                      </div>
                    </form>
                    {localResults.length ? (
                      <div id="welcome-local-results" className={styles.localResults} aria-live="polite" aria-label="Matching locations">
                        {localResults.map((result) => (
                          <button key={result.canonicalTargetKey || result.label} type="button" disabled={localSearchStatus === "opening"} onClick={() => openLocalPreview(result)}>
                            <span><strong>{result.label}</strong><small>{[result.city, result.address].filter(Boolean).join(" · ") || result.detail}</small></span>
                            <em>{localPreviewStatus === "active" ? "Switch" : "Preview"}</em>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className={styles.localPreviewNote}>{localMessage || (localPreviewStatus === "active" ? "Switching locations does not restart the preview clock." : "Choose a location to start.")}</p>
                  </div>
                ) : null}

                {localPreviewStatus === "active" && localPreview && localPreviewMatchesActiveState ? (
                  <>
                    <div className={styles.localTargetCard}>
                      <div>
                        <span>{localTargetStatus(localPreview.target.status)}</span>
                        <h3>{localPreview.target.label}</h3>
                        {selectedTargetDetails.length ? <p>{selectedTargetDetails.join(" · ")}</p> : null}
                      </div>
                    </div>
                    <div className={styles.previewStatus}>
                      <Radio size={15} aria-hidden="true" />
                      <p>{localPreview.recent.length ? `Showing ${localPreview.recent.length} recent local ${localPreview.recent.length === 1 ? "signal" : "signals"}.` : "No recent signal is available here; earlier verified signals remain below."}</p>
                    </div>
                    <SignalCards signals={showEarlierSignals ? [...localPreview.recent, ...localPreview.earlier] : localPreview.recent} stateName={STATE_NAMES.get(localPreview.target.stateCode) || localPreview.target.stateCode} />
                    {localPreview.earlier.length ? (
                      <button type="button" className={styles.seeEarlier} onClick={() => setShowEarlierSignals((current) => !current)}>
                        {showEarlierSignals ? "Hide earlier signals" : "See earlier signals"}<ChevronDown size={15} aria-hidden="true" />
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {localPreviewStatus === "expired" && localPreview ? (
                      <div className={styles.localPreviewExpired}>
                        <LockKeyhole size={17} aria-hidden="true" />
                        <span><strong>Local preview complete.</strong><small>{localPreview.target.areaLabel} stays available with paid access.</small></span>
                        <Link href="/pricing?source=welcome-local-preview">View plans</Link>
                      </div>
                    ) : null}
                    {canShowStateSignals ? (
                      previewLoading ? (
                        <p className={styles.loading} aria-live="polite">Checking current signals and coverage…</p>
                      ) : (
                        <>
                          <div className={styles.previewStatus}>
                            <Radio size={15} aria-hidden="true" />
                            <p>{previewMessage}</p>
                          </div>
                          {drops.length ? <SignalCards signals={drops} stateName={activeStateName} /> : null}
                        </>
                      )
                    ) : null}
                  </>
                )}
              </section>

              <section className={`${styles.section} ${styles.coverageSection}`} aria-labelledby="coverage-depth-heading">
                <div className={styles.sectionHeading}>
                  <div className={styles.headingGroup}>
                    <span className={styles.landmark} aria-hidden="true">02</span>
                    <div>
                      <p className={styles.stepLabel}>Coverage in your state</p>
                      <h2 id="coverage-depth-heading">{activeStateName} coverage</h2>
                    </div>
                  </div>
                </div>
                {coverageError ? <p className={styles.previewMessage}>{coverageError}</p> : null}
                {coverageStates.length ? (
                  <div className={styles.coverageMapEmbed}>
                    <CoverageMap
                      states={coverageStates}
                      selectedCode={activeState}
                      interactive={false}
                      compact
                    />
                    <Link className={styles.coverageMapLink} href={`/coverage?state=${encodeURIComponent(activeState)}`}>
                      Explore the full map <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                ) : null}
                {coverageState ? <CoverageSummary state={coverageState} /> : null}
              </section>

              {requestState ? (
                <section className={`${styles.section} ${styles.requestSection}`} aria-label="Optional coverage request">
                  <div className={styles.requestMarker}><span className={styles.landmark} aria-hidden="true">03</span><p>Optional request</p></div>
                  <CoverageRequestForm
                    state={requestState}
                    visible
                    variant="welcome"
                    onCancel={() => undefined}
                    onDraftRestored={() => undefined}
                  />
                </section>
              ) : null}

              <section className={`${styles.section} ${styles.exploreSection}`} aria-labelledby="explore-heading">
                <div className={styles.sectionHeading}>
                  <div className={styles.headingGroup}>
                    <span className={styles.landmark} aria-hidden="true">04</span>
                    <div>
                      <p className={styles.stepLabel}>Keep exploring</p>
                      <h2 id="explore-heading">Choose where to go next</h2>
                    </div>
                  </div>
                </div>
                <nav className={styles.exploreLinks} aria-label="Explore Bourbon Signal">
                  <Link className={styles.explorePrimary} href="/bottle-check"><Search aria-hidden="true" /><span><strong>Bottle Check</strong><small>Look up rarity, value, and recent evidence.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                  <Link href={`/?state=${encodeURIComponent(activeState)}#drops`}><Radio aria-hidden="true" /><span><strong>Drop Feed</strong><small>Open the broader state feed.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                  <Link href="/release-radar"><CalendarDays aria-hidden="true" /><span><strong>Release Radar</strong><small>Track public releases and calendars.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                  <Link href="/sightings"><UsersRound aria-hidden="true" /><span><strong>Member Sightings</strong><small>Read recent community reports.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                  <Link href={`/coverage?state=${encodeURIComponent(activeState)}`}><MapIcon aria-hidden="true" /><span><strong>Coverage Map</strong><small>See what information is available across the country.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                  <Link href="/dashboard"><LayoutDashboard aria-hidden="true" /><span><strong>Dashboard</strong><small>Open your member workspace.</small></span><ArrowUpRight aria-hidden="true" /></Link>
                </nav>
              </section>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
