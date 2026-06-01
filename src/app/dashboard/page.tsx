"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { useBottles } from "@/hooks/useBottles";
import { useStores } from "@/hooks/useStores";
import { useDrops } from "@/hooks/useDrops";
import { useWatchlistStore } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useStats } from "@/lib/useEngineData";
import type { Bottle } from "@/data/bottles";
import type { AreaPreferences, UserAlertPreferences } from "@/app/api/user/preferences/route";
import { canonicalBottleKey, dropMatchesBottle } from "@/lib/bottleIdentity";
import { getDisplayName } from "@/lib/drops";
import { LiquidToggle } from "@/components/LiquidToggle";
import { getDefaultNotificationPreferences, type NotificationPreferences } from "@/lib/notification-preferences";
import { getPopularBottlePool } from "@/lib/bottleSuggestions";

const EMPTY_PREFS: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  paCounties: [],
  paStores: [],
};

const SIMPLE_STATE_CODES = ["NC", "VA", "PA", "IN"] as const;

interface AlertPreviewState {
  sending: boolean;
  success: boolean;
  error: string | null;
}

interface BottleOption {
  canonicalKey: string;
  label: string;
  bottleIds: string[];
  bottle: Bottle;
}

interface StoreSelectionState {
  mode: "all" | "custom";
  storeIds: string[];
}

interface TerritoryCardConfig {
  stateCode: string;
  label: string;
  detailLabel: string;
  summary: string;
  selectedCount: number;
  totalCount: number;
}

interface TerritoryDropdownState {
  stateCode: string;
  scope: "primary" | "secondary";
  value?: string;
}

function isWhiskeyProduct(name: string) {
  const normalized = name.toLowerCase();
  const blockedTerms = [
    "vodka",
    "tequila",
    "rum",
    "gin",
    "brandy",
    "cognac",
    "mezcal",
    "liqueur",
    "cream",
    "moonshine",
    "vermouth",
    "cordial",
    "schnapps",
    "wine",
    "champagne",
    "amaro",
    "aperitif",
    "agave",
    "soju",
    "ready to drink",
    "hard seltzer",
  ];

  if (blockedTerms.some((term) => normalized.includes(term))) return false;

  const allowedTerms = [
    "bourbon",
    "whiskey",
    "whisky",
    "rye",
    "scotch",
    "single malt",
    "irish",
    "weller",
    "blanton",
    "stagg",
    "pappy",
    "van winkle",
    "eh taylor",
    "e.h. taylor",
    "old fitzgerald",
    "king of kentucky",
    "elijah craig",
    "four roses",
    "wild turkey",
    "maker's mark",
    "makers mark",
    "buffalo trace",
    "old forester",
    "knob creek",
    "booker's",
    "bookers",
    "woodford reserve",
    "jack daniel",
    "heaven hill",
    "michter",
    "old grand dad",
    "1792",
  ];

  return allowedTerms.some((term) => normalized.includes(term));
}

function titleCase(input: string) {
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

function canonicalizeLocationName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeNcBoardLabel(value: string) {
  return value
    .replace(/abc/gi, "")
    .replace(/board/gi, "")
    .replace(/county/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isLikelyNcBoardLabel(value: string) {
  if (!value) return false;
  if (/^store\b/i.test(value)) return false;
  if (/\d/.test(value)) return false;
  return value.length >= 3;
}

function formatStoreLabel(name?: string | null, city?: string | null) {
  const trimmedName = (name || "Unnamed store").trim();
  const trimmedCity = city?.trim();
  return trimmedCity ? `${trimmedName} · ${trimmedCity}` : trimmedName;
}

function makeStateLabel(code: string) {
  const labels: Record<string, string> = {
    NC: "North Carolina",
    VA: "Virginia",
    PA: "Pennsylvania",
    IN: "Indiana",
    AL: "Alabama",
    WV: "West Virginia",
    MS: "Mississippi",
    GA: "Georgia",
    KY: "Kentucky",
    TN: "Tennessee",
    FL: "Florida",
    "MD-MONTGOMERY": "Montgomery, MD",
  };
  return labels[code] || code;
}

function StepShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderRadius: "22px",
        border: "1px solid rgba(196,148,58,0.12)",
        background: "linear-gradient(180deg, rgba(17,13,10,0.92) 0%, rgba(11,9,7,0.96) 100%)",
        padding: "clamp(18px, 3vw, 28px)",
        boxShadow: "inset 0 1px 0 rgba(245,237,214,0.03)",
      }}
    >
      <div style={{ display: "grid", gap: "20px" }}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-accent-amber)",
            }}
          >
            <span>{step}</span>
            <span style={{ width: "44px", height: "1px", background: "rgba(196,148,58,0.32)" }} />
            <span>Alert setup</span>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 36px)", color: "var(--color-cream)", margin: 0 }}>
              {title}
            </h2>
            <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: 1.8, maxWidth: "60ch" }}>
              {subtitle}
            </p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function BottleChip({ option, onRemove }: { option: BottleOption; onRemove: () => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 14px",
        borderRadius: "999px",
        border: "1px solid rgba(196,148,58,0.18)",
        background: "rgba(196,148,58,0.08)",
        maxWidth: "100%",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {option.label}
        </div>
        {option.bottle.distillery ? (
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {option.bottle.distillery}
          </div>
        ) : null}
      </div>
      <button
        onClick={onRemove}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "var(--color-text-tertiary)",
          borderRadius: "999px",
          width: "34px",
          height: "34px",
          cursor: "pointer",
          fontSize: "18px",
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label={`Remove ${option.label}`}
      >
        ×
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { bottles, loading } = useBottles();
  const { stores } = useStores();
  const { drops: recentDrops } = useDrops({ limit: 120 });
  const { drops: ncDrops } = useDrops({ limit: 500, state: "NC" });
  const { stats: engineStats } = useStats();
  const { isSignedIn } = useAuth();
  const { prefs, savePreferences } = useAreaPreferences();
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();

  const [mounted, setMounted] = useState(false);
  const [bottleQuery, setBottleQuery] = useState("");
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>(EMPTY_PREFS);
  const [savingLocations, setSavingLocations] = useState(false);
  const [savedLocations, setSavedLocations] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [alertPreview, setAlertPreview] = useState<AlertPreviewState>({
    sending: false,
    success: false,
    error: null,
  });
  const [savedNotifications, setSavedNotifications] = useState(false);
  const [collapsedStates, setCollapsedStates] = useState<Record<string, boolean>>({});
  const [vaStoreSelections, setVaStoreSelections] = useState<Record<string, StoreSelectionState>>({});
  const [paStoreSelections, setPaStoreSelections] = useState<Record<string, StoreSelectionState>>({});

  const [territoryDropdown, setTerritoryDropdown] = useState<TerritoryDropdownState | null>(null);
  const territoryDropdownRef = useRef<HTMLDivElement | null>(null);

  async function sendPreviewEmail() {
    setAlertPreview({ sending: true, success: false, error: null });
    try {
      const response = await fetch("/api/alerts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Failed to send preview email");
      }

      setAlertPreview({ sending: false, success: true, error: null });
    } catch (error) {
      setAlertPreview({
        sending: false,
        success: false,
        error: error instanceof Error ? error.message : "Failed to send preview email",
      });
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setLocalPrefs(isSignedIn ? prefs.areaPreferences : EMPTY_PREFS);
    setNotificationPrefs(isSignedIn ? prefs.notificationPreferences : getDefaultNotificationPreferences());
  }, [prefs, isSignedIn, mounted]);

  const bottleOptions = useMemo<BottleOption[]>(() => {
    const grouped = new Map<string, BottleOption>();

    for (const bottle of bottles) {
      if (!isWhiskeyProduct(bottle.name)) continue;
      const canonicalKey = bottle.canonical_key || canonicalBottleKey(bottle.name);
      const existing = grouped.get(canonicalKey);
      if (!existing) {
        grouped.set(canonicalKey, {
          canonicalKey,
          label: bottle.name,
          bottleIds: [bottle.id],
          bottle,
        });
        continue;
      }

      existing.bottleIds.push(bottle.id);
      const existingScore = (existing.bottle.drop_count_30d || 0) + (existing.bottle.lastSeen ? 5 : 0);
      const nextScore = (bottle.drop_count_30d || 0) + (bottle.lastSeen ? 5 : 0);
      if (nextScore > existingScore) {
        existing.bottle = bottle;
        existing.label = bottle.name;
      }
    }

    return Array.from(grouped.values())
      .filter((option) => option.label.length > 1)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bottles]);

  const toggleStateCollapsed = (state: string) => {
    setCollapsedStates((prev) => ({
      ...prev,
      [state]: !prev[state],
    }));
  };

  const watchedBottleOptions = useMemo(() => {
    if (!mounted) return [];
    return bottleOptions.filter((option) =>
      option.bottleIds.some((id) => watchedBottles.includes(id))
    );
  }, [bottleOptions, watchedBottles, mounted]);

  const selectedCanonicalKeys = useMemo(
    () => new Set(watchedBottleOptions.map((option) => option.canonicalKey)),
    [watchedBottleOptions]
  );

  const filteredBottleOptions = useMemo(() => {
    const query = bottleQuery.trim().toLowerCase();
    return bottleOptions.filter((option) => {
      if (selectedCanonicalKeys.has(option.canonicalKey)) return false;
      if (!query) return true;
      return [
        option.label,
        option.bottle.distillery,
        ...(option.bottle.search_aliases || []),
        ...Object.values(option.bottle.state_aliases || {}).flat(),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [bottleOptions, bottleQuery, selectedCanonicalKeys]);

  const suggestedBottleOptions = useMemo(() => {
    const pool = getPopularBottlePool(bottleOptions.map((option) => option.bottle)).slice(0, 5);
    const ids = new Set(pool.map((bottle) => bottle.id));
    return bottleOptions.filter((option) => ids.has(option.bottle.id) && !selectedCanonicalKeys.has(option.canonicalKey));
  }, [bottleOptions, selectedCanonicalKeys]);

  const ncBoards = useMemo(() => {
    const boardNames = new Set<string>();

    const addBoard = (raw?: string | null) => {
      if (!raw) return;
      const label = normalizeNcBoardLabel(raw);
      if (isLikelyNcBoardLabel(label)) boardNames.add(label);
    };

    for (const store of stores) {
      if (store.state !== "NC" && store.state !== "North Carolina") continue;
      addBoard(store.district || store.county || store.name || store.displayLabel);
    }

    for (const drop of ncDrops) {
      addBoard(drop.board_name || drop.store_county);
    }

    return Array.from(boardNames).sort();
  }, [stores, ncDrops]);

  const vaCities = useMemo(() => {
    return Array.from(
      new Set(
        stores.flatMap((store) => {
          if (store.state !== "VA" || !store.city) return [];
          return [titleCase(store.city)];
        })
      )
    ).sort();
  }, [stores]);

  const vaStoresByCity = useMemo(() => {
    const grouped = new Map<string, typeof stores>();
    for (const store of stores) {
      if (store.state !== "VA" || !store.city) continue;
      const city = titleCase(store.city);
      const existing = grouped.get(city) ?? [];
      grouped.set(city, [...existing, store]);
    }
    return grouped;
  }, [stores]);

  const paCounties = useMemo(() => {
    return Array.from(
      new Set(
        stores.flatMap((store) => {
          if (store.state !== "PA" || !store.county) return [];
          return [titleCase(store.county)];
        })
      )
    ).sort();
  }, [stores]);

  const paStoresByCounty = useMemo(() => {
    const grouped = new Map<string, typeof stores>();
    for (const store of stores) {
      if (store.state !== "PA" || !store.county) continue;
      const county = titleCase(store.county);
      const existing = grouped.get(county) ?? [];
      grouped.set(county, [...existing, store]);
    }
    return grouped;
  }, [stores]);

  const watchlistSignals = useMemo(() => {
    if (!mounted || watchedBottleOptions.length === 0) return [] as Array<{ bottle: string; location: string; timestamp: string; state: string }>;

    const matched = recentDrops.filter((drop) =>
      watchedBottleOptions.some((option) =>
        option.bottleIds.some((id) => {
          const bottle = bottles.find((candidate) => candidate.id === id);
          return bottle ? dropMatchesBottle(drop, bottle) : false;
        })
      )
    );

    return matched.slice(0, 6).map((drop) => ({
      bottle: getDisplayName(drop),
      location: drop.store_address || drop.board_name || drop.store_city || "Location signal",
      timestamp: drop.timestamp,
      state: drop.state || drop.state_code || "NC",
    }));
  }, [mounted, watchedBottleOptions, recentDrops, bottles]);


  const territoryCards = useMemo<TerritoryCardConfig[]>(() => ([
    {
      stateCode: "NC",
      label: "North Carolina",
      detailLabel: "boards",
      summary: "Pick the boards you realistically chase.",
      selectedCount: localPrefs.ncBoards.length,
      totalCount: ncBoards.length,
    },
    {
      stateCode: "VA",
      label: "Virginia",
      detailLabel: "cities",
      summary: "Start at the city level, then narrow to stores only when needed.",
      selectedCount: localPrefs.vaCities.length,
      totalCount: vaCities.length,
    },
    {
      stateCode: "PA",
      label: "Pennsylvania",
      detailLabel: "counties",
      summary: "Choose counties first, then drop to store-level only when your hunt is that precise.",
      selectedCount: localPrefs.paCounties.length,
      totalCount: paCounties.length,
    },
    {
      stateCode: "IN",
      label: "Indiana",
      detailLabel: "coverage",
      summary: "Indiana is still broad coverage for now. Pick the state and save, then we’ll refine it as coverage matures.",
      selectedCount: localPrefs.states.includes("IN") ? 1 : 0,
      totalCount: 1,
    },
  ]), [localPrefs.ncBoards.length, localPrefs.paCounties.length, localPrefs.states, localPrefs.vaCities.length, ncBoards.length, paCounties.length, vaCities.length]);

  const addBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => addBottle(id));
    setBottleQuery("");
  };

  const removeBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => removeBottle(id));
  };

  const toggleState = (state: string) => {
    setLocalPrefs((prev) => {
      const removing = prev.states.includes(state);
      return {
        ...prev,
        states: removing ? prev.states.filter((item) => item !== state) : [...prev.states, state],
        ncBoards: state === "NC" && removing ? [] : prev.ncBoards,
        vaCities: state === "VA" && removing ? [] : prev.vaCities,
        paCounties: state === "PA" && removing ? [] : prev.paCounties,
        paStores: state === "PA" && removing ? [] : prev.paStores,
      };
    });
  };

  const updateStateDetail = (state: string, value: string) => {
    setLocalPrefs((prev) => {
      if (state === "NC") {
        const has = prev.ncBoards.includes(value);
        return {
          ...prev,
          ncBoards: has ? prev.ncBoards.filter((item) => item !== value) : [...prev.ncBoards, value],
        };
      }
      if (state === "VA") {
        const has = prev.vaCities.includes(value);
        return {
          ...prev,
          vaCities: has ? prev.vaCities.filter((item) => item !== value) : [...prev.vaCities, value],
        };
      }
      const has = prev.paCounties.includes(value);
      return {
        ...prev,
        paCounties: has ? prev.paCounties.filter((item) => item !== value) : [...prev.paCounties, value],
      };
    });
  };

  const updateVaSelectionMode = (city: string, mode: "all" | "custom") => {
    const cityStores = (vaStoresByCity.get(city) ?? []).map((store) => store.id);
    setVaStoreSelections((prev) => ({
      ...prev,
      [city]: {
        mode,
        storeIds: mode === "all" ? cityStores : prev[city]?.storeIds ?? [],
      },
    }));
  };

  const toggleVaStore = (city: string, storeId: string) => {
    setVaStoreSelections((prev) => {
      const current = prev[city] ?? { mode: "custom" as const, storeIds: [] };
      const has = current.storeIds.includes(storeId);
      const nextStoreIds = has
        ? current.storeIds.filter((id) => id !== storeId)
        : [...current.storeIds, storeId];
      return {
        ...prev,
        [city]: {
          mode: "custom",
          storeIds: nextStoreIds,
        },
      };
    });
  };

  const updatePaSelectionMode = (county: string, mode: "all" | "custom") => {
    const countyStores = (paStoresByCounty.get(county) ?? []).map((store) => store.id);
    setPaStoreSelections((prev) => ({
      ...prev,
      [county]: {
        mode,
        storeIds: mode === "all" ? countyStores : prev[county]?.storeIds ?? [],
      },
    }));
  };

  const togglePaCountyStore = (county: string, storeId: string) => {
    setPaStoreSelections((prev) => {
      const current = prev[county] ?? { mode: "custom" as const, storeIds: [] };
      const has = current.storeIds.includes(storeId);
      const nextStoreIds = has
        ? current.storeIds.filter((id) => id !== storeId)
        : [...current.storeIds, storeId];
      return {
        ...prev,
        [county]: {
          mode: "custom",
          storeIds: nextStoreIds,
        },
      };
    });
  };

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!territoryDropdownRef.current) return;
      if (event.target instanceof Node && territoryDropdownRef.current.contains(event.target)) return;
      setTerritoryDropdown(null);
    }

    if (territoryDropdown) {
      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }
  }, [territoryDropdown]);

  const handleSaveAlertSetup = async () => {
    if (!isSignedIn) return;
    setSavingLocations(true);
    try {
      const nextPrefs: UserAlertPreferences = {
        areaPreferences: localPrefs,
        notificationPreferences: notificationPrefs,
      };
      await savePreferences(nextPrefs);
      setSavedLocations(true);
      setSavedNotifications(true);
      setTimeout(() => setSavedLocations(false), 2200);
      setTimeout(() => setSavedNotifications(false), 2200);
    } finally {
      setSavingLocations(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      <Navigation />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <section
          style={{
            paddingTop: "118px",
            paddingBottom: "28px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 720px 320px at 50% 30%, rgba(196,148,58,0.08) 0%, transparent 72%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              padding: "0 clamp(20px, 5vw, 40px)",
              textAlign: "center",
              position: "relative",
            }}
          >
            <ScrollReveal delay={80}>
              <h1
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(42px, 6vw, 68px)",
                  lineHeight: 0.96,
                  color: "var(--color-text-primary)",
                  maxWidth: 760,
                  margin: "0 auto",
                  letterSpacing: "-0.02em",
                }}
              >
                Build your signal stack
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={140}>
              <p
                style={{
                  margin: "20px auto 0",
                  maxWidth: 680,
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "16px",
                  lineHeight: 1.8,
                  color: "var(--color-text-secondary)",
                }}
              >
                Choose the bottles you chase, the territory you hunt, and the alert channels you want live.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px) 80px", display: "grid", gap: "22px" }}>
          <StepShell
            step="01"
            title="Bottle watchlist"
            subtitle="Add the bottles you actually want Bourbon Signal to track. Your watchlist is the first filter that decides what deserves your attention."
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ display: "grid", gap: "14px" }}>
                <label htmlFor="watchlist-search" style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Search bottles
                </label>
                <input
                  id="watchlist-search"
                  value={bottleQuery}
                  onChange={(event) => setBottleQuery(event.target.value)}
                  placeholder={loading ? "Loading bottle library…" : "Search bourbon, rye, distillery, or release"}
                  style={{
                    width: "100%",
                    padding: "16px 18px",
                    borderRadius: "18px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    outline: "none",
                  }}
                />
              </div>

              {watchedBottleOptions.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                  {watchedBottleOptions.map((option) => (
                    <BottleChip key={option.canonicalKey} option={option} onRemove={() => removeBottleOption(option)} />
                  ))}
                </div>
              ) : (
                <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  Your watchlist is empty. Add the bottles that make you leave dinner early.
                </div>
              )}

              {!bottleQuery.trim() && suggestedBottleOptions.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Popular right now
                  </div>
                  {suggestedBottleOptions.map((option) => (
                    <button
                      key={`suggested-${option.canonicalKey}`}
                      onClick={() => addBottleOption(option)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(196,148,58,0.24)",
                        background: "linear-gradient(180deg, rgba(55,39,21,0.66) 0%, rgba(22,18,14,0.94) 100%)",
                        boxShadow: "0 0 22px rgba(196,148,58,0.10)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontFamily: "var(--font-playfair)", fontSize: "20px", color: "var(--color-cream)" }}>{option.label}</div>
                      <div style={{ marginTop: "4px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)" }}>{option.bottle.distillery}</div>
                    </button>
                  ))}
                </div>
              ) : null}

              {bottleQuery.trim() ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {filteredBottleOptions.slice(0, 10).map((option) => (
                  <button
                    key={option.canonicalKey}
                    onClick={() => addBottleOption(option)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "16px 18px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)" }}>{option.label}</div>
                    <div style={{ marginTop: "6px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>{option.bottle.distillery}</div>
                  </button>
                  ))}
                </div>
              ) : null}
            </div>
          </StepShell>

          <StepShell
            step="02"
            title="Hunt territory"
            subtitle="Tell Bourbon Signal where your hunt is real. That way alerts stay useful instead of turning into ambient noise."
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {SIMPLE_STATE_CODES.map((stateCode) => {
                  const active = localPrefs.states.includes(stateCode);
                  return (
                    <button
                      key={stateCode}
                      onClick={() => toggleState(stateCode)}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "999px",
                        border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)",
                        background: active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)",
                        color: active ? "var(--color-cream)" : "var(--color-text-secondary)",
                        fontFamily: "var(--font-dm-sans)",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      {makeStateLabel(stateCode)}
                    </button>
                  );
                })}
              </div>

              {localPrefs.states.length > 0 ? (
                <div ref={territoryDropdownRef} style={{ display: "grid", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    {territoryCards
                      .filter((card) => localPrefs.states.includes(card.stateCode))
                      .map((card) => {
                        const dropdownOpen = territoryDropdown?.stateCode === card.stateCode;
                        const selectedSummary = card.stateCode === "NC"
                          ? localPrefs.ncBoards.slice(0, 2).join(", ")
                          : card.stateCode === "VA"
                            ? localPrefs.vaCities.slice(0, 2).join(", ")
                            : card.stateCode === "PA"
                              ? localPrefs.paCounties.slice(0, 2).join(", ")
                              : localPrefs.states.includes("IN") ? "Statewide" : "None";
                        return (
                          <div key={card.stateCode} style={{ position: "relative" }}>
                            <button
                              onClick={() => setTerritoryDropdown((prev) => prev?.stateCode === card.stateCode ? null : { stateCode: card.stateCode, scope: "primary" })}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                borderRadius: "18px",
                                border: dropdownOpen ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)",
                                background: dropdownOpen ? "linear-gradient(180deg, rgba(47,33,18,0.65) 0%, rgba(22,18,14,0.96) 100%)" : "rgba(255,255,255,0.03)",
                                padding: "16px",
                                cursor: "pointer",
                                display: "grid",
                                gap: "8px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                                <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>{card.label}</span>
                                <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: dropdownOpen ? "#17110a" : "var(--color-cream)", letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: "999px", border: dropdownOpen ? "1px solid rgba(196,148,58,0.36)" : "1px solid rgba(196,148,58,0.32)", background: dropdownOpen ? "var(--color-accent-amber)" : "rgba(196,148,58,0.14)", padding: "8px 11px", boxShadow: dropdownOpen ? "0 0 18px rgba(196,148,58,0.22)" : "0 0 16px rgba(196,148,58,0.12)" }}>
                                  {dropdownOpen ? "Open" : "Choose ▾"}
                                </span>
                              </div>
                              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                                {card.summary}
                              </div>
                              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-primary)", fontWeight: 700 }}>
                                {card.selectedCount} selected {card.detailLabel}
                              </div>
                              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                                {selectedSummary || "Nothing selected yet"}
                              </div>
                            </button>

                            {dropdownOpen ? (
                              <div style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, right: 0, zIndex: 40, borderRadius: "20px", border: "1px solid rgba(196,148,58,0.18)", background: "linear-gradient(180deg, rgba(18,14,10,0.98) 0%, rgba(11,9,7,0.98) 100%)", boxShadow: "0 28px 80px rgba(0,0,0,0.42)", padding: "14px", backdropFilter: "blur(18px)" }}>
                                <div style={{ display: "grid", gap: "10px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                                      {card.stateCode === "NC" ? "Choose boards" : card.stateCode === "VA" ? "Choose cities" : card.stateCode === "PA" ? "Choose counties" : "Statewide coverage"}
                                    </div>
                                    <button onClick={() => setTerritoryDropdown(null)} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", borderRadius: "999px", padding: "6px 10px", cursor: "pointer" }}>Done</button>
                                  </div>

                                  {card.stateCode === "NC" ? (
                                    <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto", display: "grid", gap: "8px" }}>
                                      {ncBoards.length > 0 ? ncBoards.map((board) => {
                                        const active = localPrefs.ncBoards.includes(board);
                                        return <button key={board} onClick={() => updateStateDetail("NC", board)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer" }}>{board}</button>;
                                      }) : (
                                        <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                                          No North Carolina boards are loaded yet. Try refreshing in a moment.
                                        </div>
                                      )}
                                    </div>
                                  ) : null}

                                  {card.stateCode === "VA" ? (
                                    territoryDropdown.scope === "secondary" && territoryDropdown.value ? (
                                      <div style={{ display: "grid", gap: "10px" }}>
                                        <button onClick={() => setTerritoryDropdown({ stateCode: "VA", scope: "primary" })} style={{ justifySelf: "start", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", borderRadius: "999px", padding: "6px 10px", cursor: "pointer" }}>← Back to cities</button>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                          <button onClick={() => updateVaSelectionMode(territoryDropdown.value!, "all")} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: vaStoreSelections[territoryDropdown.value!]?.mode !== "custom" ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)", color: vaStoreSelections[territoryDropdown.value!]?.mode !== "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer" }}>All stores</button>
                                          <button onClick={() => updateVaSelectionMode(territoryDropdown.value!, "custom")} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: vaStoreSelections[territoryDropdown.value!]?.mode === "custom" ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)", color: vaStoreSelections[territoryDropdown.value!]?.mode === "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer" }}>Pick stores</button>
                                        </div>
                                        {vaStoreSelections[territoryDropdown.value!]?.mode === "custom" ? (
                                          <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto", display: "grid", gap: "8px" }}>
                                            {(vaStoresByCity.get(territoryDropdown.value!) ?? []).map((store) => {
                                              const storeId = store.id || store.name || `${territoryDropdown.value}-store`;
                                              const selected = vaStoreSelections[territoryDropdown.value!]?.storeIds.includes(storeId) ?? false;
                                              return <button key={storeId} onClick={() => toggleVaStore(territoryDropdown.value!, storeId)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: selected ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: selected ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: selected ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer" }}>{formatStoreLabel(store.name, store.city)}</button>;
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto", display: "grid", gap: "8px" }}>
                                        {vaCities.map((city) => {
                                          const active = localPrefs.vaCities.includes(city);
                                          return (
                                            <div key={city} style={{ display: "grid", gap: "8px" }}>
                                              <button onClick={() => updateStateDetail("VA", city)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer" }}>{city}</button>
                                              {active ? <button onClick={() => setTerritoryDropdown({ stateCode: "VA", scope: "secondary", value: city })} style={{ justifySelf: "start", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", borderRadius: "999px", padding: "6px 10px", cursor: "pointer" }}>Refine stores</button> : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )
                                  ) : null}

                                  {card.stateCode === "PA" ? (
                                    territoryDropdown.scope === "secondary" && territoryDropdown.value ? (
                                      <div style={{ display: "grid", gap: "10px" }}>
                                        <button onClick={() => setTerritoryDropdown({ stateCode: "PA", scope: "primary" })} style={{ justifySelf: "start", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", borderRadius: "999px", padding: "6px 10px", cursor: "pointer" }}>← Back to counties</button>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                          <button onClick={() => updatePaSelectionMode(territoryDropdown.value!, "all")} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: paStoreSelections[territoryDropdown.value!]?.mode !== "custom" ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)", color: paStoreSelections[territoryDropdown.value!]?.mode !== "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer" }}>All stores</button>
                                          <button onClick={() => updatePaSelectionMode(territoryDropdown.value!, "custom")} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: paStoreSelections[territoryDropdown.value!]?.mode === "custom" ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)", color: paStoreSelections[territoryDropdown.value!]?.mode === "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer" }}>Pick stores</button>
                                        </div>
                                        {paStoreSelections[territoryDropdown.value!]?.mode === "custom" ? (
                                          <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto", display: "grid", gap: "8px" }}>
                                            {(paStoresByCounty.get(territoryDropdown.value!) ?? []).map((store) => {
                                              const storeId = store.id || store.name || `${territoryDropdown.value}-store`;
                                              const selected = paStoreSelections[territoryDropdown.value!]?.storeIds.includes(storeId) ?? false;
                                              return <button key={storeId} onClick={() => togglePaCountyStore(territoryDropdown.value!, storeId)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: selected ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: selected ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: selected ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer" }}>{formatStoreLabel(store.name, store.city)}</button>;
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto", display: "grid", gap: "8px" }}>
                                        {paCounties.map((county) => {
                                          const active = localPrefs.paCounties.includes(county);
                                          return (
                                            <div key={county} style={{ display: "grid", gap: "8px" }}>
                                              <button onClick={() => updateStateDetail("PA", county)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer" }}>{county}</button>
                                              {active ? <button onClick={() => setTerritoryDropdown({ stateCode: "PA", scope: "secondary", value: county })} style={{ justifySelf: "start", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", borderRadius: "999px", padding: "6px 10px", cursor: "pointer" }}>Refine stores</button> : null}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )
                                  ) : null}

                                  {card.stateCode === "IN" ? (
                                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.8, padding: "8px 4px" }}>
                                      Indiana is currently handled at the state level. Store-level narrowing can come later once coverage is richer.
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button
                  onClick={handleSaveAlertSetup}
                  disabled={!isSignedIn || savingLocations}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    border: savedLocations ? "1px solid rgba(82, 180, 126, 0.45)" : "none",
                    background: savedLocations ? "rgba(82,180,126,0.15)" : "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: savedLocations ? "#9AD4B1" : "#0D0B07",
                    fontFamily: "var(--font-dm-sans)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: !isSignedIn || savingLocations ? "not-allowed" : "pointer",
                    opacity: !isSignedIn || savingLocations ? 0.7 : 1,
                  }}
                >
                  {!isSignedIn ? "Sign in to save your alert setup" : savingLocations ? "Saving…" : savedLocations ? "Saved ✓" : "Save alert setup"}
                </button>
              </div>
            </div>
          </StepShell>

          <StepShell
            step="03"
            title="Notification preferences"
            subtitle="Choose how Bourbon Signal should contact you when a bottle signal matches your watchlist and hunting territory. Save the channels you want ready to go."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                gap: "18px",
                alignItems: "start",
              }}
            >
              <div
                style={{
                  background: "rgba(11,9,7,0.56)",
                  border: "1px solid rgba(196,148,58,0.12)",
                  borderRadius: "22px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  boxShadow: "inset 0 1px 0 rgba(245,237,214,0.03)",
                }}
              >
                {(() => {
                  const onSiteActive = notificationPrefs.onSite.enabled;
                  const emailActive = notificationPrefs.email.enabled;

                  return (
                    <>
                      <button
                        onClick={() =>
                          setNotificationPrefs((prev) => ({
                            ...prev,
                            onSite: { enabled: !prev.onSite.enabled },
                          }))
                        }
                        style={{
                          width: "100%",
                          borderRadius: "18px",
                          border: onSiteActive ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)",
                          background: onSiteActive
                            ? "linear-gradient(180deg, rgba(47,33,18,0.98) 0%, rgba(24,18,12,0.98) 100%)"
                            : "linear-gradient(180deg, rgba(20,16,12,0.92) 0%, rgba(14,11,8,0.92) 100%)",
                          boxShadow: onSiteActive ? "inset 0 1px 0 rgba(239,192,80,0.12), 0 0 28px rgba(212,146,11,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
                          padding: "18px",
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          alignItems: "center",
                          minHeight: "120px",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: onSiteActive
                              ? "radial-gradient(circle at top right, rgba(212,146,11,0.18), transparent 34%)"
                              : "none",
                            pointerEvents: "none",
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, flex: 1, position: "relative" }}>
                          <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>
                            On-site alerts
                          </span>
                          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, maxWidth: "34ch" }}>
                            See matching alerts in your Bourbon Signal inbox from anywhere on the site.
                          </span>
                        </div>
                        <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
                          <LiquidToggle
                            checked={onSiteActive}
                            onCheckedChange={(checked) =>
                              setNotificationPrefs((prev) => ({
                                ...prev,
                                onSite: { enabled: checked },
                              }))
                            }
                          />
                        </div>
                      </button>

                      <button
                        onClick={() =>
                          setNotificationPrefs((prev) => ({
                            ...prev,
                            email: { ...prev.email, enabled: !prev.email.enabled },
                          }))
                        }
                        style={{
                          width: "100%",
                          borderRadius: "18px",
                          border: emailActive ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)",
                          background: emailActive
                            ? "linear-gradient(180deg, rgba(47,33,18,0.98) 0%, rgba(24,18,12,0.98) 100%)"
                            : "linear-gradient(180deg, rgba(20,16,12,0.92) 0%, rgba(14,11,8,0.92) 100%)",
                          boxShadow: emailActive ? "inset 0 1px 0 rgba(239,192,80,0.12), 0 0 28px rgba(212,146,11,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
                          padding: "18px",
                          cursor: "pointer",
                          textAlign: "left",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          alignItems: "center",
                          minHeight: "120px",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: emailActive
                              ? "radial-gradient(circle at top right, rgba(212,146,11,0.18), transparent 34%)"
                              : "none",
                            pointerEvents: "none",
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, flex: 1, position: "relative" }}>
                          <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>
                            Email alerts
                          </span>
                          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, maxWidth: "34ch" }}>
                            Use email for either every matching alert, only major hits, or a calmer daily roundup.
                          </span>
                        </div>
                        <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
                          <LiquidToggle
                            checked={emailActive}
                            onCheckedChange={(checked) =>
                              setNotificationPrefs((prev) => ({
                                ...prev,
                                email: { ...prev.email, enabled: checked },
                              }))
                            }
                          />
                        </div>
                      </button>

                      {emailActive ? (
                        <div style={{ borderRadius: "20px", border: "1px solid rgba(196,148,58,0.16)", background: "linear-gradient(180deg, rgba(22,18,14,0.98) 0%, rgba(14,11,8,0.98) 100%)", padding: "18px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
                          <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                            Delivery profile
                          </p>
                          <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                            {[
                              { value: "all", label: "All signals", note: "Every matching bottle alert, right away.", eyebrow: "ALWAYS ON" },
                              { value: "major_only", label: "Major hits", note: "Only the strongest, most urgent matches hit your inbox.", eyebrow: "RECOMMENDED" },
                              { value: "daily_roundup", label: "Roundup", note: "Keep the inbox calm with a daily digest.", eyebrow: "DIGEST MODE" },
                            ].map((option) => {
                              const selected = notificationPrefs.email.mode === option.value;
                              return (
                                <button
                                  key={option.value}
                                  onClick={() =>
                                    setNotificationPrefs((prev) => ({
                                      ...prev,
                                      email: { ...prev.email, mode: option.value as typeof prev.email.mode },
                                    }))
                                  }
                                  style={{
                                    textAlign: "left",
                                    borderRadius: "16px",
                                    border: selected ? "1px solid rgba(196,148,58,0.32)" : "1px solid rgba(255,255,255,0.08)",
                                    background: selected
                                      ? "linear-gradient(180deg, rgba(47,33,18,0.96) 0%, rgba(24,18,12,0.96) 100%)"
                                      : "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
                                    boxShadow: selected ? "inset 0 1px 0 rgba(239,192,80,0.1), 0 0 24px rgba(212,146,11,0.08)" : "none",
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: selected ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>{option.eyebrow}</div>
                                  <div style={{ marginTop: "8px", fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)" }}>{option.label}</div>
                                  <div style={{ marginTop: "6px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{option.note}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <button
                        disabled
                        style={{
                          width: "100%",
                          borderRadius: "18px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "linear-gradient(180deg, rgba(20,16,12,0.92) 0%, rgba(14,11,8,0.92) 100%)",
                          padding: "18px",
                          cursor: "not-allowed",
                          textAlign: "left",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "14px",
                          alignItems: "center",
                          minHeight: "120px",
                          opacity: 0.72,
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>
                              SMS alerts
                            </span>
                            <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase", border: "1px solid rgba(196,148,58,0.22)", borderRadius: "999px", padding: "4px 8px" }}>
                              Coming soon
                            </span>
                          </div>
                          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, maxWidth: "34ch" }}>
                            Fastest channel for urgent drops once phone delivery is live.
                          </span>
                        </div>
                        <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
                          <LiquidToggle checked={false} disabled />
                        </div>
                      </button>
                    </>
                  );
                })()}
              </div>

              <div
                style={{
                  background: "linear-gradient(180deg, rgba(18,14,10,0.96) 0%, rgba(11,9,7,0.96) 100%)",
                  border: "1px solid rgba(196,148,58,0.14)",
                  borderRadius: "22px",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  boxShadow: "inset 0 1px 0 rgba(239,192,80,0.04)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "radial-gradient(circle at top right, rgba(212,146,11,0.14), transparent 36%)",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "relative" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Signal setup snapshot
                  </p>
                  <h3 style={{ margin: "10px 0 0", fontFamily: "var(--font-playfair)", fontSize: "30px", color: "var(--color-cream)" }}>
                    Preference summary
                  </h3>
                  <p style={{ margin: "10px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.8, maxWidth: "42ch" }}>
                    Your watchlist, territory, and delivery choices combine here into one alert setup snapshot.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", position: "relative" }}>
                  {[
                    { label: "Watched bottles", value: String(watchedBottleOptions.length) },
                    { label: "Recent matched signals", value: String(watchlistSignals.length) },
                    { label: "States", value: String(localPrefs.states.length) },
                    { label: "Channels", value: String([
                      notificationPrefs.onSite.enabled,
                      notificationPrefs.email.enabled,
                      notificationPrefs.sms.enabled,
                    ].filter(Boolean).length) },
                  ].map((item) => (
                    <div key={item.label} style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px" }}>
                      <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ marginTop: "8px", fontFamily: "var(--font-playfair)", fontSize: "28px", color: "var(--color-cream)" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: "12px", position: "relative" }}>
                  <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.025) 100%)", padding: "16px" }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Watchlist scope
                    </p>
                    <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                      {watchedBottleOptions.length > 0
                        ? `${watchedBottleOptions.length} bottle${watchedBottleOptions.length === 1 ? "" : "s"} will trigger alerts.`
                        : "Watchlist not set. Add bottles in Step 1 to start tracking signals."}
                    </p>
                  </div>

                  <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.025) 100%)", padding: "16px" }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Territory
                    </p>
                    <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                      {localPrefs.states.length > 0
                        ? `Alerts will be scoped to ${localPrefs.states.map(makeStateLabel).join(", ")}.`
                        : "Territory not set. Choose where you hunt so alerts stay relevant."}
                    </p>
                  </div>

                  <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.025) 100%)", padding: "16px" }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Delivery channels
                    </p>
                    <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                      {[
                        notificationPrefs.onSite.enabled ? "On-site inbox" : null,
                        notificationPrefs.email.enabled ? `Email (${notificationPrefs.email.mode === "all" ? "all signals" : notificationPrefs.email.mode === "major_only" ? "major hits" : "roundup"})` : null,
                        notificationPrefs.sms.enabled ? "SMS" : null,
                      ].filter(Boolean).join(", ") || "No alert channels selected yet."}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    paddingTop: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    position: "relative",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      Member email
                    </p>
                    <p style={{ margin: "10px 0 0", fontFamily: "var(--font-playfair)", fontSize: "26px", color: "var(--color-cream)" }}>
                      Premium email preview
                    </p>
                    <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.8, maxWidth: "38ch" }}>
                      Send a sample alert to your inbox and see exactly what the email experience feels like before the next real drop hits.
                    </p>
                  </div>

                  <button
                    onClick={sendPreviewEmail}
                    disabled={!isSignedIn || !notificationPrefs.email.enabled || alertPreview.sending}
                    style={{
                      padding: "14px 20px",
                      borderRadius: "999px",
                      border: "1px solid rgba(196,148,58,0.28)",
                      background: !isSignedIn || !notificationPrefs.email.enabled || alertPreview.sending
                        ? "rgba(255,255,255,0.05)"
                        : "linear-gradient(135deg, rgba(68,48,26,0.95) 0%, rgba(38,28,16,0.95) 100%)",
                      color: !isSignedIn || !notificationPrefs.email.enabled || alertPreview.sending
                        ? "var(--color-text-tertiary)"
                        : "var(--color-accent-gold)",
                      fontFamily: "var(--font-dm-sans)",
                      fontWeight: 700,
                      fontSize: "14px",
                      cursor: !isSignedIn || !notificationPrefs.email.enabled || alertPreview.sending ? "not-allowed" : "pointer",
                      textAlign: "left",
                      boxShadow: !isSignedIn || !notificationPrefs.email.enabled || alertPreview.sending ? "none" : "inset 0 1px 0 rgba(239,192,80,0.1), 0 0 24px rgba(212,146,11,0.08)",
                    }}
                  >
                    {alertPreview.sending ? "Sending preview…" : "Send test alert email"}
                  </button>

                  {alertPreview.success ? (
                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-accent-amber)" }}>
                      Preview sent. Check your inbox.
                    </p>
                  ) : null}

                  {alertPreview.error ? (
                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#D77A61" }}>
                      {alertPreview.error}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </StepShell>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
}
