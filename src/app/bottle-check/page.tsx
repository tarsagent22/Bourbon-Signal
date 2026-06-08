"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AVAILABLE_STATES } from "@/lib/statePreferences";

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
  } | null;
  localSignal?: {
    state: string;
    localScore: number;
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Not seen recently";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Not seen recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(time);
}

function scoreTone(score: number) {
  if (score >= 82) return "hot";
  if (score >= 58) return "warm";
  if (score >= 36) return "medium";
  return "quiet";
}

export default function BottleCheckPage() {
  const [query, setQuery] = useState("Buffalo Trace");
  const [submittedQuery, setSubmittedQuery] = useState("Buffalo Trace");
  const [state, setState] = useState("NC");
  const [result, setResult] = useState<BottleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tracked, setTracked] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bourbon-signal-bottle-check-tracked");
      if (raw) setTracked(JSON.parse(raw));
    } catch {
      setTracked([]);
    }
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

  const bottle = result?.bottle || null;
  const signal = result?.localSignal;
  const isTracked = bottle ? tracked.includes(bottle.id) : false;
  const canTrack = Boolean(bottle && signal?.canTrack);
  const isCommon = bottle?.availability === "common";

  const suggestedNames = useMemo(() => {
    return (result?.suggestions || [])
      .filter((suggestion): suggestion is NonNullable<typeof suggestion> => Boolean(suggestion))
      .filter((suggestion) => suggestion.id !== bottle?.id)
      .slice(0, 5);
  }, [result?.suggestions, bottle?.id]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSubmittedQuery(query);
  }

  function trackBottle() {
    if (!bottle || !canTrack) return;
    const next = Array.from(new Set([...tracked, bottle.id]));
    setTracked(next);
    try {
      window.localStorage.setItem("bourbon-signal-bottle-check-tracked", JSON.stringify(next));
    } catch {
      // Ignore local storage failures; the UI should still feel responsive.
    }
  }

  return (
    <>
      <Navigation />
      <main className="bottle-check-page">
        <style>{bottleCheckCss}</style>

        <section className="bc-hero">
          <div className="bc-kicker">Bottle Check</div>
          <h1>Standing in the aisle? Check the bottle before you buy.</h1>
          <p>
            Search a bourbon, choose your state, and get a read on whether it is common, allocated, worth grabbing, or just not showing enough local signal yet.
          </p>
        </section>

        <section className="bc-shell">
          <form className="bc-search-card" onSubmit={submitSearch}>
            <div className="bc-field grow">
              <label htmlFor="bottle-search">Bottle name</label>
              <input
                id="bottle-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try Blanton's, Weller Green, Maker's Mark…"
                autoComplete="off"
              />
            </div>
            <div className="bc-field state">
              <label htmlFor="state-select">Area</label>
              <select id="state-select" value={state} onChange={(event) => setState(event.target.value)} className="bourbon-select">
                {activeStates.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
            </div>
            <button type="submit">Check bottle</button>
          </form>

          {loading ? (
            <div className="bc-panel muted">Checking the Bourbon Bible…</div>
          ) : !bottle ? (
            <div className="bc-panel empty">
              <strong>We do not have that bottle yet.</strong>
              <p>{result?.message || "Try a different spelling. Unknown searches are exactly how the Bourbon Bible gets better over time."}</p>
            </div>
          ) : (
            <div className="bc-result-grid">
              <article className="bc-verdict-card">
                <div className="bc-card-topline">
                  <span className={`bc-tier ${bottle.availability}`}>{availabilityLabels[bottle.availability] || bottle.availability}</span>
                  <span className="bc-confidence">Confidence: {signal?.confidence || "low"}</span>
                </div>
                <h2>{bottle.canonicalName}</h2>
                <p className="bc-summary">{bottle.summary}</p>

                {signal ? (
                  <div className={`bc-score ${scoreTone(signal.localScore)}`}>
                    <div>
                      <span>Local Score</span>
                      <strong>{signal.localScore}</strong>
                    </div>
                    <p>{signal.label}</p>
                  </div>
                ) : null}

                <div className="bc-guidance">
                  <h3>Buy guidance</h3>
                  <p>{signal?.verdict || bottle.guidance}</p>
                  <small>{bottle.guidance}</small>
                </div>

                <div className="bc-track-box">
                  {isCommon ? (
                    <p><strong>No alert settings for common bottles.</strong> This page can still help explain what you are looking at, but common shelf bottles stay out of alert/watchlist noise.</p>
                  ) : canTrack ? (
                    <>
                      <p><strong>Track this bottle</strong> saves it for Bottle Check follow-up. Alert setup stays separate so this page does not get confusing.</p>
                      <button type="button" onClick={trackBottle} disabled={isTracked}>{isTracked ? "Tracked" : "Track this bottle"}</button>
                    </>
                  ) : (
                    <p><strong>Tracking unavailable.</strong> {signal?.trackDisabledReason || "This bottle is not ready for tracking yet."}</p>
                  )}
                </div>
              </article>

              <aside className="bc-detail-card">
                <h3>Local signal in {state}</h3>
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
                    <p>No recent local sightings in the current engine window.</p>
                  )}
                </div>

                {suggestedNames.length ? (
                  <div className="bc-suggestions">
                    <h4>Possible matches</h4>
                    {suggestedNames.map((suggestion) => (
                      <button key={suggestion.id} type="button" onClick={() => { setQuery(suggestion.canonicalName); setSubmittedQuery(suggestion.canonicalName); }}>
                        {suggestion.canonicalName}
                      </button>
                    ))}
                  </div>
                ) : null}
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
.bottle-check-page { min-height: 100vh; padding-top: 96px; background: radial-gradient(circle at 48% 0%, rgba(196,148,58,0.12), transparent 34%), var(--color-bg-primary); color: var(--color-text-primary); }
.bc-hero, .bc-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
.bc-hero { padding: 54px 0 26px; }
.bc-kicker { display: inline-flex; border: 1px solid rgba(196,148,58,0.28); border-radius: 999px; color: var(--color-accent-amber); padding: 7px 11px; font: 800 11px/1 var(--font-dm-sans); letter-spacing: .13em; text-transform: uppercase; }
.bc-hero h1 { max-width: 920px; font-family: var(--font-playfair); font-size: clamp(42px, 7vw, 78px); line-height: .94; letter-spacing: -.045em; margin: 20px 0 0; }
.bc-hero p { max-width: 790px; margin-top: 20px; color: var(--color-text-secondary); font: 17px/1.7 var(--font-dm-sans); }
.bc-shell { padding: 10px 0 78px; }
.bc-search-card { display:flex; align-items:flex-end; gap:12px; padding:16px; border:1px solid rgba(196,148,58,.18); border-radius:24px; background:rgba(255,255,255,.035); box-shadow:0 22px 80px rgba(0,0,0,.24); }
.bc-field { display:grid; gap:8px; }
.bc-field.grow { flex:1; }
.bc-field.state { width:220px; }
.bc-field label { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-field input { height:48px; border-radius:14px; border:1px solid rgba(196,148,58,.26); background:rgba(13,11,8,.62); color:var(--color-cream); padding:0 15px; font:700 15px/1 var(--font-dm-sans); outline:none; }
.bc-field input:focus { border-color:rgba(212,164,74,.78); box-shadow:0 0 0 3px rgba(212,164,74,.12); }
.bc-search-card button, .bc-track-box button { height:48px; border:none; border-radius:14px; background:linear-gradient(135deg, #C4943A 0%, #D4A44A 100%); color:#14100C; padding:0 18px; font:900 14px/1 var(--font-dm-sans); cursor:pointer; }
.bc-track-box button:disabled { cursor:default; opacity:.72; }
.bc-panel { margin-top:18px; border:1px solid rgba(245,237,214,.08); border-radius:22px; padding:24px; background:rgba(255,255,255,.026); color:var(--color-text-secondary); font:14px/1.7 var(--font-dm-sans); }
.bc-panel strong { color:var(--color-cream); display:block; font:700 22px/1.2 var(--font-playfair); margin-bottom:8px; }
.bc-result-grid { display:grid; grid-template-columns:minmax(0, 1.35fr) minmax(320px, .85fr); gap:16px; margin-top:18px; }
.bc-verdict-card, .bc-detail-card { border:1px solid rgba(245,237,214,.08); border-radius:28px; background:rgba(255,255,255,.033); padding:24px; }
.bc-verdict-card { background:radial-gradient(circle at 16% 0%, rgba(196,148,58,.14), transparent 42%), rgba(255,255,255,.035); }
.bc-card-topline { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.bc-tier { display:inline-flex; border-radius:999px; padding:7px 10px; font:900 10px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; border:1px solid rgba(245,237,214,.14); color:var(--color-text-secondary); background:rgba(255,255,255,.04); }
.bc-tier.allocated, .bc-tier.highly_allocated, .bc-tier.unicorn { border-color:rgba(196,148,58,.38); color:var(--color-accent-amber); background:rgba(196,148,58,.10); }
.bc-tier.common { border-color:rgba(245,237,214,.11); color:rgba(245,237,214,.58); }
.bc-confidence { color:var(--color-text-tertiary); font:800 11px/1 var(--font-dm-sans); letter-spacing:.08em; text-transform:uppercase; }
.bc-verdict-card h2 { margin:18px 0 0; font:700 clamp(32px, 5vw, 56px)/.98 var(--font-playfair); letter-spacing:-.035em; color:var(--color-cream); }
.bc-summary { margin:14px 0 0; color:var(--color-text-secondary); font:16px/1.7 var(--font-dm-sans); }
.bc-score { margin-top:22px; display:grid; grid-template-columns:150px minmax(0,1fr); gap:16px; align-items:center; border-radius:22px; border:1px solid rgba(245,237,214,.08); padding:18px; background:rgba(0,0,0,.16); }
.bc-score span { display:block; color:var(--color-text-tertiary); font:900 11px/1 var(--font-dm-sans); letter-spacing:.10em; text-transform:uppercase; }
.bc-score strong { display:block; margin-top:8px; font:800 54px/.85 var(--font-playfair); color:var(--color-cream); }
.bc-score p { margin:0; color:var(--color-text-primary); font:800 20px/1.25 var(--font-dm-sans); }
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
.bc-detail-card { display:grid; gap:20px; align-content:start; }
.bc-stat-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.bc-stat-grid div { border-radius:16px; background:rgba(0,0,0,.16); padding:12px; }
.bc-stat-grid span { display:block; color:var(--color-text-tertiary); font:800 10px/1 var(--font-dm-sans); letter-spacing:.08em; text-transform:uppercase; }
.bc-stat-grid strong { display:block; margin-top:8px; color:var(--color-cream); font:800 16px/1.2 var(--font-dm-sans); }
.bc-recent, .bc-suggestions { display:grid; gap:10px; }
.bc-sighting { border:1px solid rgba(245,237,214,.075); border-radius:14px; padding:12px; background:rgba(255,255,255,.025); }
.bc-sighting strong { display:block; color:var(--color-cream); font:800 13px/1.25 var(--font-dm-sans); }
.bc-sighting span, .bc-recent p { display:block; margin-top:5px; color:var(--color-text-secondary); font:12px/1.5 var(--font-dm-sans); }
.bc-suggestions button { text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:12px; background:rgba(255,255,255,.03); color:var(--color-text-primary); padding:10px 12px; font:700 13px/1.2 var(--font-dm-sans); cursor:pointer; }
@media (max-width: 900px) { .bc-search-card, .bc-result-grid, .bc-score, .bc-track-box { grid-template-columns:1fr; flex-direction:column; align-items:stretch; } .bc-field.state { width:100%; } .bc-stat-grid { grid-template-columns:1fr; } }
`;
