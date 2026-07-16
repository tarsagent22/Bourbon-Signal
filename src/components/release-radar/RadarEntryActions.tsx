"use client";

import Link from "next/link";
import { Bookmark, Check, MapPinned, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useAuth } from "@/lib/auth";
import { canonicalBottleKey } from "@/lib/bottleIdentity";
import { trackRadarGrowthEvent } from "@/lib/radar-analytics";
import {
  getMarketHandoffHref,
  getTrackableBottleRelation,
  type RadarEntry,
} from "@/lib/release-radar";
import { followRadarRelease } from "@/lib/release-radar-preferences";
import { AVAILABLE_STATES, useStatePreferences } from "@/lib/statePreferences";
import { useWatchlistStore } from "@/lib/watchlist";

function marketOptions(entry: RadarEntry) {
  if (entry.markets.some((market) => market.code === "US")) {
    return AVAILABLE_STATES.filter((market) => market.active).map((market) => ({ code: market.code, label: market.name }));
  }
  return entry.markets.map((market) => ({ code: market.code, label: market.label }));
}

export function RadarEntryActions({ entry }: { entry: RadarEntry }) {
  const { isLoaded, isSignedIn, signIn, entitlements } = useAuth();
  const { prefs, loading, savePreferences } = useAreaPreferences();
  const setSelectedStates = useStatePreferences((state) => state.setSelectedStates);
  const addBottle = useWatchlistStore((state) => state.addBottle);
  const isWatching = useWatchlistStore((state) => state.isWatching);
  const bottle = getTrackableBottleRelation(entry);
  const options = useMemo(() => marketOptions(entry), [entry]);
  const preferredMarket = prefs.areaPreferences.states.find((code) => options.some((option) => option.code === code));
  const [market, setMarket] = useState(preferredMarket || options[0]?.code || "US");
  const [saving, setSaving] = useState<"follow" | "track" | null>(null);
  const [message, setMessage] = useState("");
  const followed = prefs.radarPreferences.followedReleases.some((follow) => follow.releaseSlug === entry.slug && follow.marketCodes.includes(market));
  const tracked = bottle ? isWatching(bottle.canonicalId) : false;

  async function followRelease() {
    if (!isLoaded || loading || saving) return;
    if (!isSignedIn) {
      setMessage("Sign in to keep this release in your free Radar follows.");
      signIn();
      return;
    }
    setSaving("follow");
    setMessage("");
    try {
      const radarPreferences = followRadarRelease(prefs.radarPreferences, entry.slug, [market]);
      await savePreferences({ radarPreferences });
      setMessage("Release followed. This saves the announcement only; it cannot create an availability alert.");
      trackRadarGrowthEvent("radar_release_followed", {
        surface: "release_radar",
        kind: entry.kind,
        market,
        verification: entry.verificationStatus,
      });
    } catch {
      setMessage("Could not save this follow. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  async function trackBottle() {
    if (!bottle || saving) return;
    addBottle(bottle.canonicalId, bottle.canonicalName);
    setSaving("track");
    setMessage("");
    try {
      if (isSignedIn && entitlements.trackedBottleLimit !== 0) {
        const bottleKey = canonicalBottleKey(bottle.canonicalName);
        await savePreferences({
          areaPreferences: {
            ...prefs.areaPreferences,
            states: market === "US" ? prefs.areaPreferences.states : Array.from(new Set([...prefs.areaPreferences.states, market])),
          },
          alertMode: "specific_bottles",
          bottleAlertPreferences: {
            bottleNames: Array.from(new Set([...prefs.bottleAlertPreferences.bottleNames, bottle.canonicalName])),
            bottleKeys: Array.from(new Set([...prefs.bottleAlertPreferences.bottleKeys, bottleKey].filter(Boolean))),
          },
        });
        setMessage("Bottle tracked in your saved market preferences. Alerts still require fresh, alert-grade availability evidence.");
      } else {
        setMessage("Bottle tracked on this device. Release announcements never count as availability alerts.");
      }
      trackRadarGrowthEvent("radar_bottle_tracked", {
        surface: "release_radar",
        kind: entry.kind,
        market,
        verification: entry.verificationStatus,
      });
    } catch {
      setMessage("The bottle is on this device's watchlist, but account sync did not finish.");
    } finally {
      setSaving(null);
    }
  }

  function handoffMarket() {
    if (market !== "US") setSelectedStates([market]);
    trackRadarGrowthEvent("radar_market_handoff", {
      surface: "release_radar",
      kind: entry.kind,
      market,
      verification: entry.verificationStatus,
    });
  }

  return <section className="radar-acquisition" aria-labelledby="radar-actions-title">
    <div className="radar-acquisition__copy">
      <span>Keep the signal</span>
      <h2 id="radar-actions-title">Carry this into your market.</h2>
      <p>Follows remember announcement context. Availability alerts remain gated to fresh inventory-grade evidence.</p>
    </div>
    <div className="radar-acquisition__controls">
      <label htmlFor={`radar-market-${entry.slug}`}>Market</label>
      <select id={`radar-market-${entry.slug}`} value={market} onChange={(event) => { setMarket(event.target.value); setMessage(""); }}>
        {options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
      <div className="radar-acquisition__buttons">
        {entry.followEligibility.release && <button type="button" onClick={followRelease} disabled={followed || saving !== null || loading || !isLoaded}>
          {followed ? <Check size={14} aria-hidden /> : <Radio size={14} aria-hidden />}
          {saving === "follow" ? "Saving…" : followed ? "Following" : "Follow release"}
        </button>}
        {bottle && <button type="button" onClick={trackBottle} disabled={saving !== null}>
          {tracked ? <Check size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
          {saving === "track" ? "Saving…" : tracked ? "Tracked" : "Track bottle"}
        </button>}
        <Link href={getMarketHandoffHref(entry, market)} onClick={handoffMarket}>
          <MapPinned size={14} aria-hidden /> Check {options.find((option) => option.code === market)?.label || "market"}
        </Link>
      </div>
      <p className="radar-acquisition__status" aria-live="polite">{message}</p>
    </div>
  </section>;
}
