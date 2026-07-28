"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import {
  COVERAGE_REQUEST_DRAFT_KEY,
  CoverageRequestForm,
} from "@/components/coverage/CoverageRequestForm";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useAuth } from "@/lib/auth";
import type { CoverageContract, CoverageState } from "@/lib/coverage-model";
import { US_STATE_OPTIONS } from "@/lib/coverage-model";
import type { DropEvent } from "@/lib/drops";
import { recordGrowthMilestone } from "@/lib/growth-client";
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

const STATE_NAMES = new Map<string, string>(US_STATE_OPTIONS.map((state) => [state.code, state.name]));

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
    capabilityLabel: "Coverage unavailable",
    health: "no-recent-update",
    healthLabel: "Live coverage unavailable",
    summary: "Live coverage detail is temporarily unavailable.",
    sourceLabel: null,
    precisions: [],
    areas: [],
    representedAreaCount: 0,
    monitoredStoreCount: 0,
    layers: { known: 0, probeable: 0, catalogWatch: 0, live: 0, alertGrade: 0 },
    canSee: [],
    cannotSee: [],
    fingerprint: `coverage-v1|${code}|unavailable`,
  };
}

function cleanLabel(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function signalName(drop: DropEvent) {
  return cleanLabel(
    drop.brand_name
      || drop.tracked_brand_name
      || drop.canonical_name
      || drop.raw_name,
  ) || "Bourbon signal";
}

function signalLocation(drop: DropEvent, stateName: string) {
  return cleanLabel(
    drop.display_location
      || drop.store_name
      || drop.board_name
      || drop.locationName
      || drop.store_city
      || drop.store_county,
  ) || stateName;
}

function signalSource(drop: DropEvent) {
  const direct = cleanLabel(drop.source);
  if (direct) return titleCase(direct);
  if (drop.sourceUrl) {
    try {
      return new URL(drop.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      // Fall through to a truthful generic source label.
    }
  }
  return "Bourbon Signal source";
}

function signalTime(drop: DropEvent) {
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

function statePreviewMessage(
  stateName: string,
  coverage: CoverageState | null,
  drops: DropEvent[],
  error: string,
  degradedStateFallback: boolean,
) {
  if (error) return `Latest signals for ${stateName} are temporarily unavailable. Live coverage detail and the optional request form remain below.`;
  if (!drops.length && coverage?.capability === "not-active") {
    return `Bourbon Signal does not currently have an active monitoring source in ${stateName}. No eligible state signals are available right now.`;
  }
  if (!drops.length) return `No eligible state signals are currently available in ${stateName}. Coverage may still be partial or source-specific.`;
  if (degradedStateFallback) {
    return `Showing ${drops.length} recent useful ${drops.length === 1 ? "signal" : "signals"} from the latest retained state data while a source recovers.`;
  }
  if (drops.length < 5) {
    return `Showing the ${drops.length} latest eligible ${drops.length === 1 ? "signal" : "signals"} available in ${stateName}; fewer than five currently meet the feed rules.`;
  }
  return `Showing the five latest eligible signals available in ${stateName}.`;
}

export default function WelcomePage() {
  const { isLoaded, isSignedIn, user } = useAuth();
  const { prefs, ready: preferencesReady, savePreferences } = useAreaPreferences();
  const [selectedState, setSelectedState] = useState("");
  const [activeState, setActiveState] = useState("");
  const [editingState, setEditingState] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [drops, setDrops] = useState<DropEvent[]>([]);
  const [dropsError, setDropsError] = useState("");
  const [degradedStateFallback, setDegradedStateFallback] = useState(false);
  const [coverageState, setCoverageState] = useState<CoverageState | null>(null);
  const [coverageError, setCoverageError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const registrationRecorded = useRef(false);
  const freeValueRecordedFor = useRef(new Set<string>());

  const persistedHomeState = prefs.memberProfile?.homeState || "";
  const activeStateName = STATE_NAMES.get(activeState) || activeState;
  const requestState = useMemo(
    () => coverageState || (activeState ? fallbackCoverageState(activeState) : null),
    [activeState, coverageState],
  );

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
    setPreviewLoading(true);
    setDrops([]);
    setDropsError("");
    setCoverageState(null);
    setCoverageError("");
    setDegradedStateFallback(false);

    const loadDrops = fetch(`/api/drops?state=${encodeURIComponent(activeState)}&limit=5`, {
      signal: controller.signal,
    }).then(async (response) => ({
      response,
      payload: await response.json().catch(() => ({})) as DropsPreviewResponse,
    }));
    const loadCoverage = fetch("/api/coverage", {
      signal: controller.signal,
    }).then(async (response) => ({
      response,
      payload: await response.json().catch(() => ({})) as Partial<CoverageContract>,
    }));

    void Promise.allSettled([loadDrops, loadCoverage])
      .then(([dropResult, coverageResult]) => {
        if (controller.signal.aborted) return;
        if (dropResult.status === "fulfilled" && dropResult.value.response.ok) {
          const previewDrops = Array.isArray(dropResult.value.payload.drops)
            ? dropResult.value.payload.drops.slice(0, 5)
            : [];
          setDrops(previewDrops);
          setDegradedStateFallback(dropResult.value.payload.degradedStateFallback === true);
          if (previewDrops.length && !freeValueRecordedFor.current.has(activeState)) {
            freeValueRecordedFor.current.add(activeState);
            void recordGrowthMilestone("free_value_reached", {
              surface: "welcome",
              kind: "welcome_state_signals",
              market: activeState,
              precision: "state_preview",
            });
          }
        } else {
          setDropsError(
            dropResult.status === "fulfilled"
              ? dropResult.value.payload.error || "Latest signals are temporarily unavailable."
              : "Latest signals are temporarily unavailable.",
          );
        }

        if (coverageResult.status === "fulfilled"
          && coverageResult.value.response.ok
          && Array.isArray(coverageResult.value.payload.states)) {
          const current = coverageResult.value.payload.states.find((state) => state.code === activeState) || null;
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
  }, [activeState]);

  async function saveHomeState() {
    if (!selectedState) return;
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
            <p className={styles.eyebrow}>Free member activation</p>
            <h1>Start with the bourbon signal closest to home.</h1>
            <p>Your home state personalizes this preview. It does not subscribe you to alerts, and you can change it here anytime.</p>
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
                  disabled={!selectedState || saveStatus === "saving"}
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
              <section className={styles.section} aria-labelledby="state-preview-heading">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.stepLabel}>Your latest state preview</p>
                    <h2 id="state-preview-heading">{activeStateName}</h2>
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

                {previewLoading ? (
                  <p className={styles.loading} aria-live="polite">Checking the latest eligible signals and live coverage…</p>
                ) : (
                  <>
                    <p className={styles.previewMessage}>{previewMessage}</p>
                    {drops.length ? (
                      <ol className={styles.signalList}>
                        {drops.map((drop, index) => (
                          <li key={`${drop.timestamp}-${drop.store_id || drop.board_name || index}`}>
                            <div className={styles.signalHeading}>
                              <strong>{signalName(drop)}</strong>
                              <span>{cleanLabel(drop.signal_label || drop.rarity_tier) || "Eligible signal"}</span>
                            </div>
                            <dl>
                              <div><dt>Freshness</dt><dd>{signalTime(drop)}</dd></div>
                              <div><dt>Location</dt><dd>{signalLocation(drop, activeStateName)}</dd></div>
                              <div><dt>Source</dt><dd>{signalSource(drop)}</dd></div>
                            </dl>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </>
                )}
              </section>

              <section className={styles.section} aria-labelledby="coverage-depth-heading">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.stepLabel}>Live coverage depth</p>
                    <h2 id="coverage-depth-heading">What Bourbon Signal can see now</h2>
                  </div>
                  <Link href={`/coverage?state=${encodeURIComponent(activeState)}`}>Open coverage map</Link>
                </div>
                {coverageError ? <p className={styles.previewMessage}>{coverageError}</p> : null}
                {coverageState ? (
                  <>
                    <p className={styles.coverageSummary}>{coverageState.summary}</p>
                    {coverageState.sourceLabel ? (
                      <p className={styles.coverageSource}>Primary source: <strong>{coverageState.sourceLabel}</strong></p>
                    ) : null}
                    <dl className={styles.coverageMetrics}>
                      <div><dt>Capability</dt><dd>{coverageState.capabilityLabel}</dd></div>
                      <div><dt>Health</dt><dd>{coverageState.healthLabel}</dd></div>
                      <div><dt>Known stores</dt><dd>{coverageState.layers.known}</dd></div>
                      <div><dt>Monitored stores</dt><dd>{coverageState.monitoredStoreCount}</dd></div>
                      <div><dt>Represented areas</dt><dd>{coverageState.representedAreaCount}</dd></div>
                      <div><dt>Alert-ready</dt><dd>{coverageState.layers.alertGrade}</dd></div>
                    </dl>
                    {coverageState.capability === "not-active" ? (
                      <p className={styles.coverageCaveat}>No active customer-facing monitoring source is available for this state yet.</p>
                    ) : coverageState.health !== "current" ? (
                      <p className={styles.coverageCaveat}>Coverage is available, but one or more sources are not currently at full health.</p>
                    ) : null}
                  </>
                ) : null}
              </section>

              {requestState ? (
                <div className={styles.section}>
                  <CoverageRequestForm
                    state={requestState}
                    visible
                    variant="welcome"
                    onCancel={() => undefined}
                    onDraftRestored={() => undefined}
                  />
                </div>
              ) : null}

              <section className={styles.section} aria-labelledby="explore-heading">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.stepLabel}>Keep exploring</p>
                    <h2 id="explore-heading">Explore the rest of Bourbon Signal</h2>
                  </div>
                </div>
                <nav className={styles.exploreLinks} aria-label="Explore Bourbon Signal">
                  <Link href="/bottle-check"><strong>Bottle Check</strong><span>Look up bottle context and value.</span></Link>
                  <Link href={`/?state=${encodeURIComponent(activeState)}#drops`}><strong>Drop Feed</strong><span>Open the broader state feed.</span></Link>
                  <Link href="/release-radar"><strong>Release Radar</strong><span>Track public releases and calendars.</span></Link>
                  <Link href="/sightings"><strong>Member Sightings</strong><span>Read recent community reports.</span></Link>
                  <Link href={`/coverage?state=${encodeURIComponent(activeState)}`}><strong>Coverage Map</strong><span>See source depth across the country.</span></Link>
                  <Link href="/dashboard"><strong>Dashboard</strong><span>Use your full member workspace.</span></Link>
                </nav>
                <p className={styles.membershipLink}>
                  Curious about paid alerts and expanded tools? <Link href="/pricing?source=welcome">See pricing quietly.</Link>
                </p>
              </section>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
