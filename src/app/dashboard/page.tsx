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
}

interface StoreSelectionState {
  mode: "all" | "custom";
  storeIds: string[];
}

function normalizeBottleName(name: string) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/small batch\s*\d+/g, "small batch")
    .replace(/single barrel\s*\d+/g, "single barrel")
    .replace(/private barrel\s*\d+/g, "private barrel")
    .replace(/batch proof\s*\d+/g, "batch proof")
    .replace(/\bproof\s*\d+/g, "proof")
    .replace(/\b(375ml|750ml|1l|1\.75l)\b/g, " ")
    .replace(/\b(ncabc|nc abc|va abc|fwgs|state-specific|north carolina|virginia|pennsylvania)\b/g, " ")
    .replace(/\b(\d+)\b$/g, " ")
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

function normalizeNcBoardLabel(raw: string) {
  return raw
    .replace(/^NC ABC\s*[—-]\s*/i, "")
    .replace(/\bABC Board\b/gi, "")
    .replace(/\bMunicipal\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNcBoardLabel(label: string) {
  if (!label) return false;
  const normalized = label.trim();
  if (!normalized) return false;
  if (/\d/.test(normalized)) return false;
  if (/\b(county|address|suite|road|rd\b|street|st\b|drive|dr\b|lane|ln\b|avenue|ave\b|boulevard|blvd\b|highway|hwy\b|zip)\b/i.test(normalized)) {
    return false;
  }
  return normalized.split(" ").length <= 5;
}

function StyledSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }} className="md:hidden">
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          padding: "14px 44px 14px 16px",
          borderRadius: "12px",
          border: "1px solid rgba(196,148,58,0.18)",
          background: "rgba(17, 13, 9, 0.92)",
          color: "var(--color-cream)",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      >
        {children}
      </select>
      <span
        style={{
          position: "absolute",
          right: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--color-accent-amber)",
          fontSize: "12px",
          pointerEvents: "none",
        }}
      >
        ▾
      </span>
    </div>
  );
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
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>(EMPTY_PREFS);
  const [savingLocations, setSavingLocations] = useState(false);
  const [savedLocations, setSavedLocations] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({
    sms: false,
    email: true,
    site: true,
  });
  const [savedNotifications, setSavedNotifications] = useState(false);
  const [vaStoreSelections, setVaStoreSelections] = useState<Record<string, StoreSelectionState>>({});
  const [paStoreSelections, setPaStoreSelections] = useState<Record<string, StoreSelectionState>>({});

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

  const ncBoards = useMemo(() => {
    return Array.from(
      new Set(
        stores.flatMap((store) => {
          if (store.state !== "NC") return [];
          const raw = store.district || store.id || store.name || "";
          if (!raw) return [];
          const label = normalizeNcBoardLabel(raw);
          return isLikelyNcBoardLabel(label) ? [label] : [];
        })
      )
    )
      .filter(Boolean)
      .sort();
  }, [stores]);

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
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "22px",
            }}
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
                            }}
                          >
                            {option.bottle.msrp > 0 ? `MSRP $${option.bottle.msrp.toFixed(0)}` : "Track this bottle across your hunt area"}
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
          subtitle="Pick the states you hunt in first, then refine only as far as the available data allows. North Carolina drills into boards, Virginia drills into cities and then stores, and Pennsylvania drills into counties and then stores."
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

            <div style={{ display: "grid", gap: "18px" }}>
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
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "13px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      States you hunt in
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    {["NC", "VA", "PA"].map((state) => {
                      const active = localPrefs.states.includes(state);
                    return (
                      <button
                        key={state}
                        onClick={() => toggleState(state)}
                        style={{
                          width: "100%",
                          padding: "14px 16px",
                          borderRadius: "14px",
                          border: active ? "1px solid rgba(196,148,58,0.45)" : "1px solid rgba(255,255,255,0.1)",
                          background: active ? "rgba(196,148,58,0.14)" : "rgba(255,255,255,0.04)",
                          color: active ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                          fontFamily: "var(--font-dm-sans)",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {makeStateLabel(state)}
                      </button>
                    );
                  })}
                  </div>

                {localPrefs.states.length === 0 ? (
                  <div style={{ padding: "18px", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.16)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)", fontSize: "14px", lineHeight: 1.7 }}>
                    Pick the states you actually hunt in. Then Bourbon Signal will let you refine each state down to the most specific level the data supports.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {localPrefs.states.includes("NC") && (
                      <div
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
                            North Carolina
                          </h3>
                          <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            NC data is currently board-level, so this is the most specific filter we provide for this state
                          </p>
                        </div>
                        <StyledSelect
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return;
                            updateStateDetail("NC", event.target.value);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Add board</option>
                          {ncBoards.filter((board) => !localPrefs.ncBoards.includes(board)).map((board) => (
                            <option key={board} value={board}>
                              {board}
                            </option>
                          ))}
                        </StyledSelect>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }} className="hidden md:flex">
                          {ncBoards.map((board) => {
                            const active = localPrefs.ncBoards.includes(board);
                            return (
                              <button
                                key={board}
                                onClick={() => updateStateDetail("NC", board)}
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
                                {board}
                              </button>
                            );
                          })}
                        </div>
                        {localPrefs.ncBoards.length > 0 && (
                          <div style={{ display: "grid", gap: "8px" }} className="md:hidden">
                            {localPrefs.ncBoards.map((board) => (
                              <button
                                key={board}
                                onClick={() => updateStateDetail("NC", board)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  width: "100%",
                                  borderRadius: "10px",
                                  border: "1px solid rgba(196,148,58,0.18)",
                                  background: "rgba(196,148,58,0.08)",
                                  padding: "12px 14px",
                                  color: "var(--color-text-primary)",
                                  fontFamily: "var(--font-dm-sans)",
                                  fontSize: "14px",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <span>{board}</span>
                                <span style={{ color: "var(--color-text-tertiary)", fontSize: "18px" }}>×</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {localPrefs.states.includes("VA") && (
                      <div
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
                            Virginia
                          </h3>
                          <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            First pick the cities you hunt in, then drill all the way down to specific VA ABC stores if you want to stay tight.
                          </p>
                        </div>
                        <StyledSelect
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return;
                            updateStateDetail("VA", event.target.value);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Add city</option>
                          {vaCities.filter((city) => !localPrefs.vaCities.includes(city)).map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </StyledSelect>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }} className="hidden md:flex">
                          {vaCities.slice(0, 120).map((city) => {
                            const active = localPrefs.vaCities.includes(city);
                            return (
                              <button
                                key={city}
                                onClick={() => updateStateDetail("VA", city)}
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
                                {city}
                              </button>
                            );
                          })}
                        </div>

                        {localPrefs.vaCities.length > 0 && (
                          <div style={{ display: "grid", gap: "12px" }} className="md:hidden">
                            {localPrefs.vaCities.map((city) => {
                              const cityStores = vaStoresByCity.get(city) ?? [];
                              const selection = vaStoreSelections[city] ?? { mode: "all", storeIds: cityStores.map((store) => store.id) };
                              if (cityStores.length === 0) return null;
                              return (
                                <div key={city} style={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.14)", padding: "14px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                                      {city} stores
                                    </p>
                                    <button
                                      onClick={() => updateVaSelectionMode(city, selection.mode === "all" ? "custom" : "all")}
                                      style={{
                                        borderRadius: "999px",
                                        border: "1px solid rgba(196,148,58,0.24)",
                                        background: selection.mode === "all" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.04)",
                                        color: selection.mode === "all" ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                                        padding: "8px 12px",
                                        fontFamily: "var(--font-dm-sans)",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Track all stores
                                    </button>
                                  </div>
                                  <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                                    {cityStores.map((store) => {
                                      const active = selection.mode === "all" || selection.storeIds.includes(store.id);
                                      return (
                                        <button
                                          key={store.id}
                                          onClick={() => toggleVaStore(city, store.id)}
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            width: "100%",
                                            borderRadius: "10px",
                                            border: active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.06)",
                                            background: active ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.03)",
                                            padding: "10px 12px",
                                            cursor: "pointer",
                                            textAlign: "left",
                                          }}
                                        >
                                          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                                            {store.name} {store.address ? `• ${store.address}` : ""}
                                          </span>
                                          <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "16px", color: active ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>
                                            {active ? "✓" : "×"}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {localPrefs.states.includes("PA") && (
                      <div
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
                            Pennsylvania
                          </h3>
                          <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            Pick counties first, then keep going to the exact Fine Wine & Good Spirits stores you care about.
                          </p>
                        </div>
                        <StyledSelect
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return;
                            updateStateDetail("PA", event.target.value);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Add county</option>
                          {paCounties.filter((county) => !localPrefs.paCounties.includes(county)).map((county) => (
                            <option key={county} value={county}>
                              {county}
                            </option>
                          ))}
                        </StyledSelect>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }} className="hidden md:flex">
                          {paCounties.map((county) => {
                            const active = localPrefs.paCounties.includes(county);
                            return (
                              <button
                                key={county}
                                onClick={() => updateStateDetail("PA", county)}
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
                                {county}
                              </button>
                            );
                          })}
                        </div>

                        {localPrefs.paCounties.length > 0 && (
                          <div style={{ display: "grid", gap: "12px" }} className="md:hidden">
                            {localPrefs.paCounties.map((county) => {
                              const countyStores = paStoresByCounty.get(county) ?? [];
                              const selection = paStoreSelections[county] ?? { mode: "all", storeIds: countyStores.map((store) => store.id) };
                              if (countyStores.length === 0) return null;
                              return (
                                <div key={county} style={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.14)", padding: "14px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                                      {county} County stores
                                    </p>
                                    <button
                                      onClick={() => updatePaSelectionMode(county, selection.mode === "all" ? "custom" : "all")}
                                      style={{
                                        borderRadius: "999px",
                                        border: "1px solid rgba(196,148,58,0.24)",
                                        background: selection.mode === "all" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.04)",
                                        color: selection.mode === "all" ? "var(--color-accent-amber)" : "var(--color-text-secondary)",
                                        padding: "8px 12px",
                                        fontFamily: "var(--font-dm-sans)",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Track all stores
                                    </button>
                                  </div>
                                  <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                                    {countyStores.map((store) => {
                                      const active = selection.mode === "all" || selection.storeIds.includes(store.id);
                                      return (
                                        <button
                                          key={store.id}
                                          onClick={() => togglePaCountyStore(county, store.id)}
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: "12px",
                                            width: "100%",
                                            borderRadius: "10px",
                                            border: active ? "1px solid rgba(196,148,58,0.36)" : "1px solid rgba(255,255,255,0.06)",
                                            background: active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)",
                                            padding: "10px 12px",
                                            cursor: "pointer",
                                            textAlign: "left",
                                          }}
                                        >
                                          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                                            {store.name} {store.address ? `• ${store.address}` : ""}
                                          </span>
                                          <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "16px", color: active ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>
                                            {active ? "✓" : "×"}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "18px",
              alignItems: "start",
            }}
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
                      minHeight: "112px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, flex: 1 }}>
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
                        alignSelf: "center",
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
