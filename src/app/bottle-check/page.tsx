"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AVAILABLE_STATES } from "@/lib/statePreferences";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useAuth } from "@/lib/auth";

interface BottleResult {
  bottle: {
    id: string;
    canonicalName: string;
    brand: string;
    category: string;
    availability: "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";
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
    localScore: number;
    scoreStatus: "bible_baseline" | "local_adjusted";
    scoreBasis: string;
    label: string;
    verdict: string;
    confidence: "high" | "medium" | "low";
    recentCount90d: number;
    recentCount30d: number;
    lastSeenAt: string | null;
    recentLocations: { label: string; city?: string; state?: string; seenAt: string; signalLabel?: string }[];
    canTrack: boolean;
    trackDisabledReason?: string;
  };
  suggestions?: BottleResult["bottle"][];
  showSuggestions?: boolean;
  message?: string;
}

const availabilityLabels: Record<string, string> = {
  common: "Common",
  regional: "Regional",
  seasonal: "Seasonal",
  limited: "Limited",
  allocated: "Allocated",
  highly_allocated: "Highly allocated",
  unicorn: "Unicorn",
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

function formatDate(value: string | null | undefined) {
  if (!value) return "No signal yet";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "No signal yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(time);
}

function scoreTone(score: number) {
  if (score >= 82) return "hot";
  if (score >= 58) return "warm";
  if (score >= 36) return "medium";
  return "quiet";
}

export default function BottleCheckPage() {
  const { isSignedIn, signIn, entitlements } = useAuth();
  const bottleCheckLimit = entitlements.bottleCheckLimit;
  const isFreeBottleCheck = bottleCheckLimit !== null;
  const { prefs, loading: prefsLoading, savePreferences } = useAreaPreferences();
  const [query, setQuery] = useState("Buffalo Trace");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [state, setState] = useState("NC");
  const [result, setResult] = useState<BottleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [trackingStates, setTrackingStates] = useState<string[]>(["NC"]);
  const [savingTrack, setSavingTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackSaved, setTrackSaved] = useState(false);
  const [freeChecksUsed, setFreeChecksUsed] = useState(0);
  const [liveSuggestions, setLiveSuggestions] = useState<NonNullable<BottleResult["bottle"]>[]>([]);

  const remainingFreeChecks = bottleCheckLimit === null ? null : Math.max(0, bottleCheckLimit - freeChecksUsed);
  const hasFreeChecksRemaining = remainingFreeChecks === null || remainingFreeChecks > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(BOTTLE_CHECK_USAGE_STORAGE_KEY) || "0");
    setFreeChecksUsed(Number.isFinite(stored) ? Math.max(0, stored) : 0);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const q = submittedQuery.trim();
      if (!q) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/bottle-check?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}`, { signal: controller.signal });
        const data = (await res.json()) as BottleResult;
        setResult(data);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResult({ bottle: null, message: "Bottle Check is temporarily unavailable. Try again in a minute." });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [submittedQuery, state]);

  useEffect(() => {
    setTrackingStates((prev) => Array.from(new Set([...(prev.length ? prev : []), state])));
  }, [state]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLiveSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/bottle-check?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}`, { signal: controller.signal });
        if (!res.ok) return setLiveSuggestions([]);
        const data = (await res.json()) as BottleResult;
        const suggestions = dedupeSuggestions([data.bottle, ...(data.suggestions || [])]
          .filter((suggestion): suggestion is NonNullable<BottleResult["bottle"]> => Boolean(suggestion))
          .filter((suggestion, index, array) => array.findIndex((item) => item.id === suggestion.id) === index))
          .slice(0, 6);
        setLiveSuggestions(suggestions);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLiveSuggestions([]);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, state]);

  const bottle = result?.bottle || null;
  const signal = result?.localSignal;
  const bottleKey = bottle ? normalizeBottleKey(bottle.canonicalName) : "";
  const savedBottleKeys = prefs.bottleAlertPreferences.bottleKeys.map(normalizeBottleKey);
  const savedBottleNames = prefs.bottleAlertPreferences.bottleNames.map(normalizeBottleKey);
  const isTracked = Boolean(bottleKey && (savedBottleKeys.includes(bottleKey) || savedBottleNames.includes(bottleKey)));
  const canTrack = Boolean(bottle && signal?.canTrack);
  const isCommon = bottle?.availability === "common";
  const canSaveAlertFromBottleCheck = entitlements.trackedBottleLimit !== 0;
  const activeStateName = activeStates.find((item) => item.code === state)?.name || state;

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    if (!hasFreeChecksRemaining) {
      setResult({ bottle: null, message: "Free includes 3 Bottle Checks. Upgrade for unlimited Bottle Check access." });
      return;
    }
    if (isFreeBottleCheck) {
      setFreeChecksUsed((current) => {
        const next = Math.min(bottleCheckLimit ?? current + 1, current + 1);
        if (typeof window !== "undefined") window.localStorage.setItem(BOTTLE_CHECK_USAGE_STORAGE_KEY, String(next));
        return next;
      });
    }
    setSubmittedQuery(nextQuery);
  }

  function toggleTrackingState(nextState: string) {
    setTrackingStates((prev) => {
      const hasState = prev.includes(nextState);
      const next = hasState ? prev.filter((item) => item !== nextState) : [...prev, nextState];
      return next.length ? next : [nextState];
    });
  }

  async function trackBottle() {
    if (!bottle || !canTrack) return;
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (!canSaveAlertFromBottleCheck) {
      window.location.href = "/pricing";
      return;
    }
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
        notificationPreferences: prefs.notificationPreferences,
        alertMode: "specific_bottles",
        bottleAlertPreferences: {
          bottleNames: Array.from(new Set([...prefs.bottleAlertPreferences.bottleNames, bottle.canonicalName])),
          bottleKeys: Array.from(new Set([...prefs.bottleAlertPreferences.bottleKeys, bottleKey].filter(Boolean))),
        },
        collectionPreferences: prefs.collectionPreferences,
      });
      setTrackSaved(true);
    } catch (error) {
      setTrackError(error instanceof Error ? error.message : "Could not save this bottle yet.");
    } finally {
      setSavingTrack(false);
    }
  }

  return (
    <>
      <Navigation />
      <main className="bottle-check-page">
        <style>{bottleCheckCss}</style>

        <section className="bc-hero">
          <h1>Standing in the aisle? See how rare it is in your area.</h1>
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
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try Blanton's, Weller Green, Maker's Mark…"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    className="bc-search-clear"
                    aria-label="Clear bottle search"
                    onClick={() => {
                      setQuery("");
                      setResult(null);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {liveSuggestions.length > 0 ? (
                <div className="bc-live-suggestions">
                  {liveSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => {
                        setQuery(suggestion.canonicalName);
                        setSubmittedQuery(suggestion.canonicalName);
                      }}
                    >
                      <span>{suggestion.canonicalName}</span>
                      <em className={`bc-tier ${suggestion.availability}`}>{availabilityLabels[suggestion.availability] || suggestion.availability}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="bc-field state">
              <label htmlFor="state-select">Area</label>
              <select id="state-select" value={state} onChange={(event) => setState(event.target.value)} className="bourbon-select">
                {activeStates.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={!hasFreeChecksRemaining}>{hasFreeChecksRemaining ? "Check bottle" : "Upgrade for unlimited"}</button>
          </form>

          {loading ? (
            <div className="bc-panel muted">Checking Bottle Signal…</div>
          ) : !bottle ? (
            <div className="bc-panel empty">
              <strong>We do not have that bottle yet.</strong>
              <p>{result?.message || "Try a different spelling. Unknown searches help Bourbon Signal improve the Bottle Check index."}</p>
            </div>
          ) : (
            <div className="bc-result-grid">
              <article className="bc-verdict-card">
                <div className="bc-card-topline">
                  <span className={`bc-tier ${bottle.availability}`}>{availabilityLabels[bottle.availability] || bottle.availability}</span>
                  <span className="bc-confidence">Local signal: {signal?.confidence || "low"}</span>
                </div>
                <h2>{bottle.canonicalName}</h2>
                <p className="bc-summary">{bottle.summary}</p>

                {signal ? (
                  <div className={`bc-score ${scoreTone(signal.localScore)}`}>
                    <div>
                      <span>Bottle Score</span>
                      <strong>{signal.localScore}</strong>
                    </div>
                    <p>{signal.label}</p>
                    <small>{signal.scoreStatus === "local_adjusted" ? "Adjusted with recent Bourbon Signal sightings." : "Based on bottle profile; no recent local sightings yet."}</small>
                  </div>
                ) : null}
                <div className="bc-guidance">
                  <h3>In-store read</h3>
                  <p>{signal?.verdict || bottle.guidance}</p>
                  <small>{bottle.guidance}</small>
                </div>

                <div className="bc-track-box">
                  {isCommon ? (
                    <p><strong>No alert settings for common bottles.</strong> Bottle Check can still help you evaluate it, but everyday shelf bottles stay out of alert/watchlist noise.</p>
                  ) : canTrack ? (
                    canSaveAlertFromBottleCheck ? (
                    <>
                      <div className="bc-track-content">
                        <p><strong>Track this bottle</strong> saves it to your account-level alert preferences so future inbox/email alerts can use it.</p>
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
                        <small>
                          Saves selected markets now. Use the dashboard afterward for board, city, or store-level territory refinement.
                        </small>
                        {trackError ? <small className="bc-track-error">{trackError}</small> : null}
                        {trackSaved ? <small className="bc-track-success">Saved to your alert preferences.</small> : null}
                      </div>
                      <button type="button" onClick={trackBottle} disabled={savingTrack || prefsLoading || isTracked}>{!isSignedIn ? "Sign in to track" : prefsLoading ? "Loading..." : savingTrack ? "Saving..." : isTracked ? "Tracked" : "Track in my market"}</button>
                    </>
                    ) : (
                      <>
                        <div className="bc-track-content">
                          <p><strong>Get alerted when this drops in your area.</strong> Bottle Check can tell you whether a bottle is worth chasing; paid members can save it for inbox and email alerts.</p>
                          <small>Standard starts with 5 alert areas and 15 tracked bottles. Barrel and Founder are built for heavier hunting.</small>
                        </div>
                        <button type="button" onClick={() => { window.location.href = "/pricing"; }}>View memberships</button>
                      </>
                    )
                  ) : (
                    <p><strong>Alerts are not enabled for this bottle yet.</strong> {signal?.trackDisabledReason || "This bottle is still being evaluated for future alert support."}</p>
                  )}
                </div>
              </article>

              <aside className="bc-detail-card">
                <h3>Local signal in {activeStateName}</h3>
                <p className="bc-local-note">Recent Bourbon Signal sightings for the selected market. This is not a live shelf confirmation.</p>
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
      <Footer />
    </>
  );
}

const bottleCheckCss = `
.bottle-check-page { min-height: 100vh; padding-top: 96px; overflow-x:hidden; background: radial-gradient(circle at 48% 0%, rgba(196,148,58,0.14), transparent 34%), radial-gradient(circle at 82% 28%, rgba(184,115,51,0.08), transparent 30%), var(--color-bg-primary); color: var(--color-text-primary); }
.bc-hero, .bc-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; box-sizing:border-box; }
.bc-hero { padding: 54px 0 26px; }
.bc-hero h1 { max-width: 920px; font-family: var(--font-playfair); font-size: clamp(42px, 7vw, 78px); line-height: .94; letter-spacing: -.045em; margin: 0; overflow-wrap:break-word; }
.bc-shell { padding: 10px 0 78px; }
.bc-search-card { display:flex; align-items:flex-end; gap:12px; width:100%; max-width:100%; box-sizing:border-box; padding:16px; border:1px solid rgba(196,148,58,.22); border-radius:24px; background:linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.025)); box-shadow:0 24px 90px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.055); }
.bc-field { display:grid; gap:8px; min-width:0; max-width:100%; }
.bc-field.grow { flex:1 1 0; min-width:0; }
.bc-field.state { width:220px; min-width:0; }
.bc-field label { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-search-input-wrap { position:relative; min-width:0; max-width:100%; }
.bc-field input { width:100%; max-width:100%; box-sizing:border-box; height:48px; border-radius:14px; border:1px solid rgba(196,148,58,.26); background:rgba(13,11,8,.62); color:var(--color-cream); padding:0 50px 0 15px; font:700 15px/1 var(--font-dm-sans); outline:none; }
.bc-field input:focus { border-color:rgba(212,164,74,.78); box-shadow:0 0 0 3px rgba(212,164,74,.12); }
.bc-search-clear { position:absolute; right:8px; top:50%; transform:translateY(-50%); appearance:none; width:32px; height:32px; border:1px solid rgba(247,240,224,.10); border-radius:999px; background:rgba(255,255,255,.045); color:var(--color-text-secondary); display:grid; place-items:center; padding:0; font:800 22px/0 var(--font-dm-sans); cursor:pointer; }
.bc-search-clear:hover, .bc-search-clear:focus-visible { color:var(--color-text-primary); border-color:rgba(212,146,11,.34); outline:none; }
.bc-live-suggestions { margin-top:8px; display:grid; gap:7px; width:100%; max-width:100%; min-width:0; overflow:hidden; }
.bc-live-suggestions button { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; max-width:100%; min-width:0; box-sizing:border-box; text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:13px; background:rgba(255,255,255,.035); color:var(--color-text-primary); padding:9px 10px 9px 12px; font:800 13px/1.2 var(--font-dm-sans); cursor:pointer; }
.bc-live-suggestions button:hover, .bc-live-suggestions button:focus-visible { border-color:rgba(196,148,58,.48); background:rgba(196,148,58,.095); outline:none; }
.bc-live-suggestions span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bc-live-suggestions .bc-tier { flex-shrink:0; min-width:0; max-width:42vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bc-search-card > button, .bc-track-box > button { height:48px; border:none; border-radius:14px; background:linear-gradient(135deg, #C4943A 0%, #D4A44A 100%); color:#14100C; padding:0 18px; font:900 14px/1 var(--font-dm-sans); cursor:pointer; flex-shrink:0; }
.bc-track-box > button:disabled { cursor:default; opacity:.72; }
.bc-panel { margin-top:18px; border:1px solid rgba(245,237,214,.08); border-radius:22px; padding:24px; background:rgba(255,255,255,.026); color:var(--color-text-secondary); font:14px/1.7 var(--font-dm-sans); }
.bc-panel strong { color:var(--color-cream); display:block; font:700 22px/1.2 var(--font-playfair); margin-bottom:8px; }
.bc-result-grid { display:grid; grid-template-columns:minmax(0, 1.35fr) minmax(320px, .85fr); gap:16px; margin-top:18px; }
.bc-verdict-card, .bc-detail-card { border:1px solid rgba(245,237,214,.09); border-radius:28px; background:linear-gradient(180deg, rgba(255,255,255,.048), rgba(255,255,255,.022)); box-shadow:0 24px 90px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04); padding:28px; }
.bc-verdict-card { background:radial-gradient(circle at 16% 0%, rgba(196,148,58,.16), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.052), rgba(255,255,255,.024)); }
.bc-card-topline { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.bc-tier { display:inline-flex; border-radius:999px; padding:7px 10px; font:900 10px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; border:1px solid rgba(245,237,214,.14); color:var(--color-text-secondary); background:rgba(255,255,255,.04); }
.bc-tier.allocated, .bc-tier.highly_allocated, .bc-tier.unicorn { border-color:rgba(196,148,58,.38); color:var(--color-accent-amber); background:rgba(196,148,58,.10); }
.bc-tier.common { border-color:rgba(245,237,214,.11); color:rgba(245,237,214,.58); }
.bc-confidence { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.08em; text-transform:uppercase; }
.bc-verdict-card h2 { margin:18px 0 0; font:700 clamp(32px, 5vw, 56px)/.98 var(--font-playfair); letter-spacing:-.035em; color:var(--color-cream); }
.bc-summary { margin:14px 0 0; color:var(--color-text-secondary); font:16px/1.7 var(--font-dm-sans); }
.bc-score { margin-top:22px; display:grid; grid-template-columns:150px minmax(0,1fr); gap:16px; align-items:center; border-radius:24px; border:1px solid rgba(196,148,58,.16); padding:20px; background:linear-gradient(135deg, rgba(0,0,0,.22), rgba(196,148,58,.055)); }
.bc-score span { display:block; color:var(--color-text-tertiary); font:900 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-score strong { display:block; margin-top:8px; font:800 54px/.85 var(--font-playfair); color:var(--color-cream); }
.bc-score p { margin:0; color:var(--color-text-primary); font:800 20px/1.25 var(--font-dm-sans); }
.bc-score small { display:block; margin-top:6px; color:var(--color-text-tertiary); font:700 12px/1.35 var(--font-dm-sans); }
.bc-score.hot { border-color:rgba(196,148,58,.38); box-shadow:inset 0 0 0 1px rgba(196,148,58,.08); }
.bc-score.hot strong, .bc-score.warm strong { color:var(--color-accent-amber); }
.bc-score.quiet strong { color:rgba(245,237,214,.55); }
.bc-guidance { margin-top:22px; }
.bc-guidance h3, .bc-detail-card h3, .bc-recent h4, .bc-suggestions h4 { margin:0; color:var(--color-cream); font:800 15px/1 var(--font-dm-sans); letter-spacing:.04em; text-transform:uppercase; }
.bc-guidance p { margin:10px 0 0; color:var(--color-text-primary); font:16px/1.7 var(--font-dm-sans); }
.bc-guidance small { display:block; margin-top:8px; color:var(--color-text-tertiary); font:13px/1.6 var(--font-dm-sans); }
.bc-track-box { margin-top:22px; border-radius:18px; border:1px solid rgba(196,148,58,.16); background:rgba(196,148,58,.055); padding:16px; display:flex; justify-content:space-between; gap:16px; align-items:center; }
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
.bc-sighting { border:1px solid rgba(245,237,214,.075); border-radius:14px; padding:12px; background:rgba(255,255,255,.025); }
.bc-sighting strong { display:block; color:var(--color-cream); font:800 13px/1.25 var(--font-dm-sans); }
.bc-sighting span, .bc-recent p { display:block; margin-top:5px; color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.bc-suggestions button { text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:12px; background:rgba(255,255,255,.03); color:var(--color-text-primary); padding:10px 12px; font:700 13px/1.2 var(--font-dm-sans); cursor:pointer; }
@media (max-width: 900px) { .bc-search-card, .bc-result-grid, .bc-score, .bc-track-box { grid-template-columns:1fr; flex-direction:column; align-items:stretch; } .bc-field, .bc-field.grow, .bc-field.state { width:100%; max-width:100%; } .bc-search-card > button, .bc-track-box > button { width:100%; } .bc-stat-grid { grid-template-columns:1fr; } }
@media (max-width: 520px) { .bc-hero, .bc-shell { width:calc(100% - 28px); } .bc-hero { padding-top:42px; } .bc-hero h1 { font-size:clamp(42px, 12vw, 56px); line-height:.96; } .bc-search-card { padding:14px; border-radius:22px; } .bc-live-suggestions button { grid-template-columns:minmax(0,1fr); align-items:start; gap:6px; padding:11px 12px; } .bc-live-suggestions .bc-tier { justify-self:start; max-width:100%; } }
`;
