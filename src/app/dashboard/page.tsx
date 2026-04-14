"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { useBottles } from "@/hooks/useBottles";
import { useStores } from "@/hooks/useStores";
import { useWatchlistStore } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import type { Bottle } from "@/data/bottles";
import type { AreaPreferences } from "@/app/api/user/preferences/route";

const EMPTY_PREFS: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  paCounties: [],
  paStores: [],
};

interface NotificationPreferences {
  sms: boolean;
  email: boolean;
  site: boolean;
}

interface BottleOption {
  canonicalKey: string;
  label: string;
  bottleIds: string[];
  bottle: Bottle;
  states: string[];
}

interface LocationSuggestion {
  id: string;
  label: string;
  hint: string;
  type: "zip" | "city" | "state";
  state: string;
  value: string;
}

function normalizeBottleName(name: string) {
  return name
    .toLowerCase()
    .replace(/small batch\s*\d+/g, "small batch")
    .replace(/single barrel\s*\d+/g, "single barrel")
    .replace(/private barrel\s*\d+/g, "private barrel")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(input: string) {
  return input.replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeStateLabel(code: string) {
  if (code === "NC") return "North Carolina";
  if (code === "VA") return "Virginia";
  if (code === "PA") return "Pennsylvania";
  return code;
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
    <section style={{ padding: "0 0 28px" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 40px)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
            border: "1px solid rgba(196,148,58,0.14)",
            borderRadius: "18px",
            padding: "clamp(22px, 4vw, 34px)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.24)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top right, rgba(196,148,58,0.08) 0%, transparent 32%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  alignItems: "center",
                  gap: "8px",
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--color-accent-amber)",
                  background: "rgba(196,148,58,0.10)",
                  border: "1px solid rgba(196,148,58,0.22)",
                  borderRadius: "999px",
                  padding: "6px 12px",
                }}
              >
                Step {step}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h2
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(24px, 3.2vw, 34px)",
                    fontWeight: 700,
                    color: "var(--color-cream)",
                    lineHeight: 1.08,
                    margin: 0,
                  }}
                >
                  {title}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.65,
                    maxWidth: "760px",
                    margin: 0,
                  }}
                >
                  {subtitle}
                </p>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function WatchlistBottleCard({
  option,
  onRemove,
}: {
  option: BottleOption;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(10, 8, 5, 0.52)",
        border: "1px solid rgba(196,148,58,0.14)",
        borderRadius: "14px",
        padding: "16px 18px",
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        alignItems: "flex-start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--color-cream)",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {option.label}
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              color: "var(--color-accent-amber)",
              background: "rgba(196,148,58,0.10)",
              border: "1px solid rgba(196,148,58,0.2)",
              borderRadius: "999px",
              padding: "4px 10px",
            }}
          >
            {option.bottle.distillery}
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "999px",
              padding: "4px 10px",
            }}
          >
            {option.states.join(" • ")}
          </span>
          {option.bottle.msrp > 0 && (
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "999px",
                padding: "4px 10px",
              }}
            >
              MSRP ${option.bottle.msrp.toFixed(0)}
            </span>
          )}
        </div>
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
  const { isSignedIn } = useAuth();
  const { prefs, savePreferences } = useAreaPreferences();
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();

  const [mounted, setMounted] = useState(false);
  const [bottleQuery, setBottleQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>(EMPTY_PREFS);
  const [savingLocations, setSavingLocations] = useState(false);
  const [savedLocations, setSavedLocations] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    sms: false,
    email: true,
    site: true,
  });
  const [savedNotifications, setSavedNotifications] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setLocalPrefs(isSignedIn ? prefs : EMPTY_PREFS);
  }, [prefs, isSignedIn, mounted]);

  const bottleOptions = useMemo<BottleOption[]>(() => {
    const grouped = new Map<string, BottleOption>();

    for (const bottle of bottles) {
      const canonicalKey = normalizeBottleName(bottle.name);
      const existing = grouped.get(canonicalKey);
      if (!existing) {
        grouped.set(canonicalKey, {
          canonicalKey,
          label: bottle.name,
          bottleIds: [bottle.id],
          bottle,
          states: bottle.state ? [bottle.state] : [],
        });
        continue;
      }

      existing.bottleIds.push(bottle.id);
      if (bottle.state && !existing.states.includes(bottle.state)) {
        existing.states.push(bottle.state);
      }

      const existingScore = (existing.bottle.drop_count_30d || 0) + (existing.bottle.lastSeen ? 5 : 0);
      const nextScore = (bottle.drop_count_30d || 0) + (bottle.lastSeen ? 5 : 0);
      if (nextScore > existingScore) {
        existing.bottle = bottle;
        existing.label = bottle.name;
      }
    }

    return Array.from(grouped.values())
      .map((option) => ({ ...option, states: option.states.sort() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bottles]);

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
      return (
        option.label.toLowerCase().includes(query) ||
        option.bottle.distillery.toLowerCase().includes(query)
      );
    });
  }, [bottleOptions, bottleQuery, selectedCanonicalKeys]);

  const allCities = useMemo(() => {
    const cityMap = new Map<string, string>();
    for (const store of stores) {
      if (!store.city || !store.state) continue;
      const city = titleCase(store.city);
      const key = `${store.state}:${city}`;
      if (!cityMap.has(key)) cityMap.set(key, city);
    }
    return Array.from(cityMap.entries()).map(([key, city]) => {
      const [state] = key.split(":");
      return { city, state };
    });
  }, [stores]);

  const zipSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ zip: string; state: string }> = [];
    for (const store of stores) {
      const match = store.address?.match(/\b(\d{5})\b/);
      if (!match) continue;
      const zip = match[1];
      const key = `${store.state}:${zip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ zip, state: store.state });
    }
    return items.sort((a, b) => a.zip.localeCompare(b.zip));
  }, [stores]);

  const locationSuggestions = useMemo<LocationSuggestion[]>(() => {
    const stateSuggestions: LocationSuggestion[] = ["NC", "VA", "PA"].map((state) => ({
      id: `state:${state}`,
      label: makeStateLabel(state),
      hint: `State`,
      type: "state",
      state,
      value: state,
    }));

    const citySuggestions: LocationSuggestion[] = allCities.map(({ city, state }) => ({
      id: `city:${state}:${city}`,
      label: city,
      hint: makeStateLabel(state),
      type: "city",
      state,
      value: city,
    }));

    const zips: LocationSuggestion[] = zipSuggestions.map(({ zip, state }) => ({
      id: `zip:${state}:${zip}`,
      label: zip,
      hint: makeStateLabel(state),
      type: "zip",
      state,
      value: zip,
    }));

    return [...stateSuggestions, ...citySuggestions, ...zips];
  }, [allCities, zipSuggestions]);

  const filteredLocationSuggestions = useMemo(() => {
    const query = locationQuery.trim().toLowerCase();
    if (!query) return locationSuggestions.slice(0, 16);
    return locationSuggestions
      .filter((suggestion) => {
        const haystack = `${suggestion.label} ${suggestion.hint} ${suggestion.state}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 18);
  }, [locationSuggestions, locationQuery]);

  const selectedStateDetails = useMemo(() => {
    return localPrefs.states.map((state) => {
      if (state === "NC") {
        return {
          state,
          title: "North Carolina",
          detailLabel: "Boards",
          detailOptions: Array.from(
            new Set(
              stores.flatMap((store) => {
                if (store.state !== "NC" || !store.name) return [];
                return [store.name.replace(/^NC ABC —\s*/i, "").trim()];
              })
            )
          ).sort(),
          selectedDetails: localPrefs.ncBoards,
        };
      }

      if (state === "VA") {
        return {
          state,
          title: "Virginia",
          detailLabel: "Cities",
          detailOptions: Array.from(
            new Set(
              stores
                .filter((store) => store.state === "VA" && store.city)
                .map((store) => titleCase(store.city))
            )
          ).sort(),
          selectedDetails: localPrefs.vaCities,
        };
      }

      return {
        state,
        title: "Pennsylvania",
        detailLabel: "Counties",
        detailOptions: Array.from(
          new Set(
            stores.flatMap((store) => {
              if (store.state !== "PA" || !store.county) return [];
              return [titleCase(store.county)];
            })
          )
        ).sort(),
        selectedDetails: localPrefs.paCounties,
      };
    });
  }, [localPrefs, stores]);

  const addBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => addBottle(id));
    setBottleQuery("");
  };

  const removeBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => removeBottle(id));
  };

  const applyLocationSuggestion = (suggestion: LocationSuggestion) => {
    setLocalPrefs((prev) => {
      const nextStates = prev.states.includes(suggestion.state)
        ? prev.states
        : [...prev.states, suggestion.state];

      if (suggestion.type === "state") {
        return { ...prev, states: nextStates };
      }

      if (suggestion.type === "city" && suggestion.state === "VA") {
        return {
          ...prev,
          states: nextStates,
          vaCities: prev.vaCities.includes(suggestion.value)
            ? prev.vaCities
            : [...prev.vaCities, suggestion.value],
        };
      }

      if (suggestion.type === "city" && suggestion.state === "PA") {
        return {
          ...prev,
          states: nextStates,
          paCounties: prev.paCounties,
        };
      }

      return { ...prev, states: nextStates };
    });
    setLocationQuery("");
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

  const handleSaveLocations = async () => {
    if (!isSignedIn) return;
    setSavingLocations(true);
    try {
      await savePreferences(localPrefs);
      setSavedLocations(true);
      setTimeout(() => setSavedLocations(false), 2200);
    } finally {
      setSavingLocations(false);
    }
  };

  const handleSaveNotifications = () => {
    setSavedNotifications(true);
    setTimeout(() => setSavedNotifications(false), 2200);
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
                  fontSize: "clamp(34px, 5vw, 52px)",
                  fontWeight: 700,
                  color: "var(--color-cream)",
                  lineHeight: 1.02,
                  marginBottom: "14px",
                }}
              >
                Build your hunt in three moves.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={160}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "16px",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.7,
                  maxWidth: "640px",
                  margin: "0 auto",
                }}
              >
                Pick the bottles you care about, narrow the territory you actually hunt, then choose how you want Bourbon Signal to tap you on the shoulder.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <StepShell
          step="01"
          title="Pick your bottles"
          subtitle="Add bottles you want alerts for. This list is deduped so you are not sorting through the same bottle repeated for different states or inventory variants."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(300px, 0.8fr)",
              gap: "22px",
            }}
            className="md:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] grid-cols-1"
          >
            <div
              style={{
                background: "rgba(11,9,7,0.56)",
                border: "1px solid rgba(196,148,58,0.12)",
                borderRadius: "14px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="bottle-search"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Bottle search
                </label>
                <input
                  id="bottle-search"
                  value={bottleQuery}
                  onChange={(event) => setBottleQuery(event.target.value)}
                  placeholder="Search bottle name or distillery"
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: "1px solid rgba(196,148,58,0.18)",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    padding: "12px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  <span>Bottle library</span>
                  <span>{filteredBottleOptions.length} options</span>
                </div>
                <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                  {loading ? (
                    <div style={{ padding: "22px 16px", color: "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)" }}>
                      Loading bottles…
                    </div>
                  ) : filteredBottleOptions.length === 0 ? (
                    <div style={{ padding: "22px 16px", color: "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)" }}>
                      Nothing matched that search.
                    </div>
                  ) : (
                    filteredBottleOptions.slice(0, 160).map((option) => (
                      <div
                        key={option.canonicalKey}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) auto",
                          gap: "12px",
                          alignItems: "center",
                          padding: "14px 16px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "var(--font-playfair)",
                              fontSize: "18px",
                              color: "var(--color-cream)",
                              lineHeight: 1.18,
                              marginBottom: "4px",
                            }}
                          >
                            {option.label}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-dm-sans)",
                              fontSize: "13px",
                              color: "var(--color-text-secondary)",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                            }}
                          >
                            <span>{option.bottle.distillery}</span>
                            <span style={{ color: "var(--color-text-tertiary)" }}>•</span>
                            <span>{option.states.join(" / ")}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => addBottleOption(option)}
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "999px",
                            border: "1px solid rgba(196,148,58,0.25)",
                            background: "rgba(196,148,58,0.10)",
                            color: "var(--color-accent-amber)",
                            fontSize: "22px",
                            lineHeight: 1,
                            cursor: "pointer",
                          }}
                          aria-label={`Add ${option.label}`}
                        >
                          +
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "rgba(11,9,7,0.56)",
                border: "1px solid rgba(196,148,58,0.12)",
                borderRadius: "14px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div>
                  <h3
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "22px",
                      color: "var(--color-cream)",
                      margin: 0,
                    }}
                  >
                    Watchlist
                  </h3>
                  <p
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                      margin: "6px 0 0",
                    }}
                  >
                    The bottles that should trigger alerts for you.
                  </p>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "11px",
                    color: "var(--color-accent-amber)",
                    background: "rgba(196,148,58,0.10)",
                    border: "1px solid rgba(196,148,58,0.2)",
                    borderRadius: "999px",
                    padding: "6px 10px",
                  }}
                >
                  {watchedBottleOptions.length} selected
                </span>
              </div>

              {watchedBottleOptions.length === 0 ? (
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "12px",
                    border: "1px dashed rgba(255,255,255,0.16)",
                    color: "var(--color-text-tertiary)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    lineHeight: 1.7,
                  }}
                >
                  Start with the bottles you would actually drop what you are doing to chase. Keep this focused.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {watchedBottleOptions.map((option) => (
                    <WatchlistBottleCard
                      key={option.canonicalKey}
                      option={option}
                      onRemove={() => removeBottleOption(option)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </StepShell>

        <StepShell
          step="02"
          title="Set your location"
          subtitle="Tell Bourbon Signal the territory you actually hunt. Start broad with a zip code, city, or state, then narrow into boards, cities, or counties that matter."
        >
          <div style={{ display: "grid", gap: "18px" }}>
            {!isSignedIn && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(196,148,58,0.18)",
                  background: "rgba(196,148,58,0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Build your hunt flow here now. To save location settings to your account, sign in first.
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <Link href="/sign-up?redirect_url=/dashboard" style={{ color: "#0D0B07", background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)", padding: "10px 14px", borderRadius: "10px", textDecoration: "none", fontFamily: "var(--font-dm-sans)", fontWeight: 700, fontSize: "13px" }}>
                    Create account
                  </Link>
                  <Link href="/sign-in?redirect_url=/dashboard" style={{ color: "var(--color-accent-amber)", border: "1px solid rgba(196,148,58,0.25)", background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: "10px", textDecoration: "none", fontFamily: "var(--font-dm-sans)", fontWeight: 600, fontSize: "13px" }}>
                    Sign in
                  </Link>
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,0.95fr) minmax(0,1.05fr)",
                gap: "18px",
              }}
              className="md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] grid-cols-1"
            >
              <div
                style={{
                  background: "rgba(11,9,7,0.56)",
                  border: "1px solid rgba(196,148,58,0.12)",
                  borderRadius: "14px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div>
                  <label
                    htmlFor="location-search"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-text-tertiary)",
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Start with a zip code, city, or state
                  </label>
                  <input
                    id="location-search"
                    value={locationQuery}
                    onChange={(event) => setLocationQuery(event.target.value)}
                    placeholder="Charlotte, 27601, Virginia, PA..."
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "1px solid rgba(196,148,58,0.18)",
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--color-text-primary)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "15px",
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {filteredLocationSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => applyLocationSuggestion(suggestion)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        padding: "14px 16px",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "15px", color: "var(--color-text-primary)", fontWeight: 600 }}>
                          {suggestion.label}
                        </span>
                        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                          {suggestion.hint}
                        </span>
                      </div>
                      <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)" }}>
                        {suggestion.type.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(11,9,7,0.56)",
                  border: "1px solid rgba(196,148,58,0.12)",
                  borderRadius: "14px",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {["NC", "VA", "PA"].map((state) => {
                    const active = localPrefs.states.includes(state);
                    return (
                      <button
                        key={state}
                        onClick={() => toggleState(state)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "999px",
                          border: active ? "1px solid rgba(196,148,58,0.45)" : "1px solid rgba(255,255,255,0.1)",
                          background: active ? "rgba(196,148,58,0.14)" : "rgba(255,255,255,0.04)",
                          color: active ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                          fontFamily: "var(--font-dm-sans)",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                        }}
                      >
                        {makeStateLabel(state)}
                      </button>
                    );
                  })}
                </div>

                {selectedStateDetails.length === 0 ? (
                  <div style={{ padding: "18px", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.16)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)", fontSize: "14px", lineHeight: 1.7 }}>
                    Pick a state above, or start with a search on the left. Then you can narrow into boards, cities, or counties specific to that state.
                  </div>
                ) : (
                  selectedStateDetails.map((section) => (
                    <div
                      key={section.state}
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "12px",
                        padding: "16px",
                        background: "rgba(255,255,255,0.03)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "20px", color: "var(--color-cream)" }}>
                          {section.title}
                        </h3>
                        <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                          Refine by {section.detailLabel.toLowerCase()} if you want a tighter hunt area.
                        </p>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {section.detailOptions.slice(0, 80).map((value) => {
                          const active = section.selectedDetails.includes(value);
                          return (
                            <button
                              key={value}
                              onClick={() => updateStateDetail(section.state, value)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "999px",
                                border: active ? "1px solid rgba(196,148,58,0.45)" : "1px solid rgba(255,255,255,0.1)",
                                background: active ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.04)",
                                color: active ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                                fontFamily: "var(--font-dm-sans)",
                                fontSize: "13px",
                                cursor: "pointer",
                              }}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}

                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <button
                    onClick={handleSaveLocations}
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
                    {!isSignedIn ? "Sign in to save locations" : savingLocations ? "Saving…" : savedLocations ? "Saved ✓" : "Save location setup"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </StepShell>

        <StepShell
          step="03"
          title="Set up notifications"
          subtitle="Choose how Bourbon Signal should notify you when a bottle signal matches your watchlist and hunting territory. This is preference UI for now, and the delivery wiring comes next."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,0.95fr) minmax(0,1.05fr)",
              gap: "18px",
            }}
            className="md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] grid-cols-1"
          >
            <div
              style={{
                background: "rgba(11,9,7,0.56)",
                border: "1px solid rgba(196,148,58,0.12)",
                borderRadius: "14px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {[
                { key: "sms", title: "SMS", note: "Fastest tap on the shoulder when you are away from the app." },
                { key: "email", title: "Email", note: "Best for a readable trail of bottle signals and hunt recaps." },
                { key: "site", title: "Site notifications", note: "Catch alerts in the dashboard when you are already in the product." },
              ].map((channel) => {
                const active = notificationPrefs[channel.key as keyof NotificationPreferences];
                return (
                  <button
                    key={channel.key}
                    onClick={() =>
                      setNotificationPrefs((prev) => ({
                        ...prev,
                        [channel.key]: !prev[channel.key as keyof NotificationPreferences],
                      }))
                    }
                    style={{
                      width: "100%",
                      borderRadius: "14px",
                      border: active ? "1px solid rgba(196,148,58,0.32)" : "1px solid rgba(255,255,255,0.08)",
                      background: active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)",
                      padding: "16px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)" }}>
                        {channel.title}
                      </span>
                      <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                        {channel.note}
                      </span>
                    </div>
                    <span
                      style={{
                        width: "46px",
                        height: "28px",
                        borderRadius: "999px",
                        background: active ? "rgba(196,148,58,0.24)" : "rgba(255,255,255,0.10)",
                        border: active ? "1px solid rgba(196,148,58,0.32)" : "1px solid rgba(255,255,255,0.08)",
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "3px",
                          left: active ? "22px" : "3px",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: active ? "var(--color-accent-amber)" : "rgba(255,255,255,0.45)",
                          transition: "left 180ms ease",
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                background: "rgba(11,9,7,0.56)",
                border: "1px solid rgba(196,148,58,0.12)",
                borderRadius: "14px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)" }}>
                  Alert preview
                </h3>
                <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                  This is how your preferences stack right now. Delivery channels are still UI-only for the moment, but this is the control flow we will wire next.
                </p>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "16px" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Watchlist scope
                  </p>
                  <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                    {watchedBottleOptions.length > 0
                      ? `${watchedBottleOptions.length} bottle${watchedBottleOptions.length === 1 ? "" : "s"} will trigger alerts.`
                      : "No bottles selected yet. Add bottles in Step 1 to make this useful."}
                  </p>
                </div>

                <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "16px" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Territory
                  </p>
                  <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                    {localPrefs.states.length > 0
                      ? `Alerts will be scoped to ${localPrefs.states.map(makeStateLabel).join(", ")}.`
                      : "No hunt territory selected yet. Add a state in Step 2."}
                  </p>
                </div>

                <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "16px" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Delivery channels
                  </p>
                  <p style={{ margin: "8px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
                    {Object.entries(notificationPrefs)
                      .filter(([, active]) => active)
                      .map(([key]) => key.toUpperCase())
                      .join(", ") || "None selected yet."}
                  </p>
                </div>
              </div>

              <div>
                <button
                  onClick={handleSaveNotifications}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    border: savedNotifications ? "1px solid rgba(82, 180, 126, 0.45)" : "none",
                    background: savedNotifications ? "rgba(82,180,126,0.15)" : "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: savedNotifications ? "#9AD4B1" : "#0D0B07",
                    fontFamily: "var(--font-dm-sans)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {savedNotifications ? "Saved ✓" : "Save notification preferences"}
                </button>
              </div>
            </div>
          </div>
        </StepShell>
      </motion.main>
      <Footer />
    </div>
  );
}
