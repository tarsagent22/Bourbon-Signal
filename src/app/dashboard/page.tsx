"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import BottleGrid from "@/components/sections/BottleGrid";
import { useBottles } from "@/hooks/useBottles";
import { useWatchlistStore } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useStores } from "@/hooks/useStores";
import type { Bottle } from "@/data/bottles";
import { getAvailabilityInfo } from "@/lib/availability";
import type { AreaPreferences } from "@/app/api/user/preferences/route";

// ─── Data ──────────────────────────────────────────────────────────────────────

const NC_BOARDS = [
  "Alamance", "Albemarle", "Alexander County", "Andrews", "Angier", "Asheboro",
  "Asheville", "Beaufort County", "Belmont", "Boiling Spring Lakes", "Boone",
  "Brevard", "Brunswick County", "Bryson City", "Burlington", "Burnsville",
  "Cabarrus County", "Camden County", "Carteret County", "Caswell County",
  "Catawba County", "Chapel Hill", "Chatham County", "Charlotte", "Cherryville",
  "Concord", "Craven County", "Cumberland County", "Currituck County", "Dare County",
  "Davidson County", "Durham", "Edgecombe County", "Fayetteville", "Franklin County",
  "Gastonia", "Goldsboro", "Graham County", "Granville County", "Greene County",
  "Greensboro", "Halifax County", "Harnett County", "Haywood County", "Henderson",
  "Hertford County", "High Point", "Hoke County", "Iredell County",
  "Johnston County", "Lee County", "Lenoir County", "Lincoln County", "McDowell County",
  "Mecklenburg", "Montgomery County", "Moore County", "Nash County", "New Hanover County",
  "Onslow County", "Orange County", "Pitt County", "Randolph County", "Robeson County",
  "Rockingham County", "Rowan County", "Rutherford County", "Sampson County",
  "Scotland County", "Stanly County", "Surry County", "Union County", "Wake",
  "Watauga County", "Wayne County", "Wilkes County", "Wilson County", "Yadkin County",
];

const VA_CITIES = [
  "Alexandria", "Arlington", "Ashburn", "Blacksburg", "Bristol", "Charlottesville",
  "Chesapeake", "Christiansburg", "Danville", "Fairfax", "Falls Church", "Fredericksburg",
  "Hampton", "Harrisonburg", "Herndon", "Leesburg", "Lynchburg", "Manassas",
  "McLean", "Newport News", "Norfolk", "Petersburg", "Portsmouth", "Radford",
  "Reston", "Richmond", "Roanoke", "Salem", "Springfield", "Staunton",
  "Sterling", "Suffolk", "Virginia Beach", "Waynesboro", "Williamsburg", "Winchester",
];

const PA_COUNTIES = [
  "Adams", "Allegheny", "Armstrong", "Beaver", "Bedford", "Berks", "Blair",
  "Bradford", "Bucks", "Butler", "Cambria", "Centre", "Chester", "Clarion",
  "Clearfield", "Columbia", "Crawford", "Cumberland", "Dauphin", "Delaware",
  "Erie", "Fayette", "Franklin", "Indiana", "Jefferson", "Lackawanna",
  "Lancaster", "Lawrence", "Lebanon", "Lehigh", "Luzerne", "Lycoming",
  "McKean", "Mercer", "Monroe", "Montgomery", "Northampton", "Philadelphia",
  "Pike", "Potter", "Schuylkill", "Somerset", "Tioga", "Venango",
  "Warren", "Washington", "Wayne", "Westmoreland", "Wyoming", "York",
];

// ─── Searchable multi-picker ────────────────────────────────────────────────────

interface PickerProps {
  options: string[];
  selected: string[];
  placeholder: string;
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
}

function SearchPicker({ options, selected, placeholder, onAdd, onRemove }: PickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options
    .filter((o) => !selected.includes(o) && o.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: "10px" }}>
          {selected.map((item) => (
            <span
              key={item}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-accent-amber)",
                background: "rgba(196,148,58,0.12)",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "6px",
                padding: "4px 8px",
              }}
            >
              {item}
              <button
                onClick={() => onRemove(item)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(196,148,58,0.6)",
                  fontSize: "14px",
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(196,148,58,0.2)",
          borderRadius: "8px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          color: "var(--color-text-primary)",
          outline: "none",
          transition: "border-color 200ms",
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.5)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.2)";
        }}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "var(--color-bg-tertiary)",
            border: "1px solid rgba(196,148,58,0.2)",
            borderRadius: "8px",
            zIndex: 100,
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.map((item) => (
            <button
              key={item}
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(item);
                setQuery("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                transition: "background 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(196,148,58,0.08)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Store name picker (string IDs) ───────────────────────────────────────────

interface StorePickerProps {
  options: Array<{ id: string; label: string }>;
  selected: string[]; // store IDs
  placeholder: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

function StoreIdPicker({ options, selected, placeholder, onAdd, onRemove }: StorePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(
    (o) => !selected.includes(o.id) && o.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = selected
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as Array<{ id: string; label: string }>;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* Selected chips */}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: "10px" }}>
          {selectedLabels.map((store) => (
            <span
              key={store.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-accent-amber)",
                background: "rgba(196,148,58,0.12)",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "6px",
                padding: "4px 8px",
              }}
            >
              {store.label}
              <button
                onClick={() => onRemove(store.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(196,148,58,0.6)",
                  fontSize: "14px",
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label={`Remove ${store.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(196,148,58,0.2)",
          borderRadius: "8px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          color: "var(--color-text-primary)",
          outline: "none",
          transition: "border-color 200ms",
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.5)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.2)";
        }}
      />

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "var(--color-bg-tertiary)",
            border: "1px solid rgba(196,148,58,0.2)",
            borderRadius: "8px",
            zIndex: 100,
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.map((item) => (
            <button
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(item.id);
                setQuery("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                transition: "background 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(196,148,58,0.08)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── State sub-section ─────────────────────────────────────────────────────────

interface StateAreaSectionProps {
  stateCode: string;
  label: string;
  subLabel: string;
  options: string[];
  selected: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}

function StateAreaSection({
  stateCode,
  label,
  subLabel,
  options,
  selected,
  onAdd,
  onRemove,
  placeholder,
  children,
}: StateAreaSectionProps) {
  const [expanded, setExpanded] = useState(selected.length > 0);

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "16px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(196,148,58,0.1)",
        borderRadius: "8px",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
        <div>
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "rgba(196,148,58,0.7)",
              marginRight: "8px",
            }}
          >
            {stateCode}
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            {label}
          </span>
        </div>
      </div>

      {selected.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            marginBottom: "10px",
          }}
        >
          Showing drops from all {subLabel}
        </p>
      ) : null}

      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--color-accent-amber)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
            textDecorationColor: "rgba(196,148,58,0.3)",
            textUnderlineOffset: "3px",
          }}
        >
          + Add specific {subLabel}
        </button>
      ) : (
        <>
          <SearchPicker
            options={options}
            selected={selected}
            placeholder={placeholder}
            onAdd={onAdd}
            onRemove={onRemove}
          />
          {selected.length === 0 && (
            <button
              onClick={() => setExpanded(false)}
              style={{
                marginTop: "8px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Cancel
            </button>
          )}
          {children}
        </>
      )}
    </div>
  );
}

// ─── PA Store Sub-Picker ──────────────────────────────────────────────────────

interface PAStorePickerProps {
  county: string;
  stores: Array<{ id: string; name?: string; city: string; address?: string }>;
  paStores: string[]; // all selected store IDs (across all counties)
  onAddStore: (id: string) => void;
  onRemoveStore: (id: string) => void;
}

function PAStorePicker({ county, stores, paStores, onAddStore, onRemoveStore }: PAStorePickerProps) {
  // "all" or "specific"
  const selectedInCounty = paStores.filter((id) =>
    stores.some((s) => s.id === id)
  );
  const [mode, setMode] = useState<"all" | "specific">(
    selectedInCounty.length > 0 ? "specific" : "all"
  );

  const storeOptions = stores.map((s) => ({
    id: s.id,
    label: `Fine Wine #${s.id} — ${s.city}${s.address ? ` (${s.address})` : ""}`,
  }));

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(196,148,58,0.08)",
        borderRadius: "6px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          marginBottom: "10px",
        }}
      >
        {county} County stores:
      </p>

      {/* Radio buttons */}
      <div className="flex flex-col gap-2" style={{ marginBottom: mode === "specific" ? "12px" : 0 }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: mode === "all" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}
        >
          <input
            type="radio"
            name={`pa-store-mode-${county}`}
            value="all"
            checked={mode === "all"}
            onChange={() => {
              setMode("all");
              // Remove all stores for this county from selection
              selectedInCounty.forEach((id) => onRemoveStore(id));
            }}
            style={{ accentColor: "var(--color-accent-amber)" }}
          />
          All stores in {county}
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: mode === "specific" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}
        >
          <input
            type="radio"
            name={`pa-store-mode-${county}`}
            value="specific"
            checked={mode === "specific"}
            onChange={() => setMode("specific")}
            style={{ accentColor: "var(--color-accent-amber)" }}
          />
          Specific stores only
        </label>
      </div>

      {mode === "specific" && (
        <StoreIdPicker
          options={storeOptions}
          selected={selectedInCounty}
          placeholder={`Search ${county} stores…`}
          onAdd={onAddStore}
          onRemove={onRemoveStore}
        />
      )}
    </div>
  );
}

// ─── Watchlist card ─────────────────────────────────────────────────────────────

function WatchlistCard({
  bottle,
  onRemove,
}: {
  bottle: Bottle;
  onRemove: () => void;
}) {
  const availability = getAvailabilityInfo(bottle);
  const tierColors: Record<string, string> = {
    unicorn: "#C4943A",
    allocated: "#B87333",
    limited: "#8A8A8A",
  };
  const tierLabels: Record<string, string> = {
    unicorn: "UNICORN",
    allocated: "ALLOCATED",
    limited: "LIMITED",
  };
  const tierColor = tierColors[bottle.tier] || "#8A8A8A";

  return (
    <div
      style={{
        minWidth: "280px",
        maxWidth: "320px",
        background: "var(--color-card-bg)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderTop: `2px solid ${tierColor}`,
        borderRadius: "10px",
        padding: "16px",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "transparent",
          color: "var(--color-text-tertiary)",
          fontSize: "12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms ease",
          padding: 0,
        }}
        title="Remove from watchlist"
      >
        ×
      </button>

      {/* Bottle name */}
      <h4
        style={{
          fontFamily: "var(--font-playfair)",
          fontSize: "14px",
          fontWeight: 700,
          color: "var(--color-cream)",
          lineHeight: 1.3,
          marginBottom: "6px",
          paddingRight: "28px",
        }}
      >
        {bottle.name}
      </h4>

      {/* Tier badge */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: "rgba(13, 11, 7, 0.6)",
          border: `1px solid ${tierColor}33`,
          borderRadius: "20px",
          padding: "2px 7px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: tierColor,
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: tierColor,
          }}
        />
        {tierLabels[bottle.tier]}
      </span>

      {/* Availability status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "12px",
          color: availability.isAvailable
            ? "var(--color-success)"
            : "var(--color-text-tertiary)",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: availability.isAvailable
              ? "var(--color-success)"
              : "var(--color-text-tertiary)",
            flexShrink: 0,
          }}
        />
        {availability.label}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { bottles, loading } = useBottles();
  const { isSignedIn } = useAuth();
  const { watchedBottles, removeBottle } = useWatchlistStore();
  const { prefs, savePreferences } = useAreaPreferences();
  const { stores } = useStores();
  const [mounted, setMounted] = useState(false);

  // Area prefs state
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>({
    states: [],
    ncBoards: [],
    vaCities: [],
    paCounties: [],
    paStores: [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync server prefs → local state
  useEffect(() => {
    setLocalPrefs(prefs);
  }, [prefs]);

  const toggleState = (code: string) => {
    setLocalPrefs((prev) => {
      const hasState = prev.states.includes(code);
      return {
        ...prev,
        states: hasState
          ? prev.states.filter((s) => s !== code)
          : [...prev.states, code],
        ncBoards: code === "NC" && hasState ? [] : prev.ncBoards,
        vaCities: code === "VA" && hasState ? [] : prev.vaCities,
        paCounties: code === "PA" && hasState ? [] : prev.paCounties,
        paStores: code === "PA" && hasState ? [] : prev.paStores,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePreferences(localPrefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // no-op
    } finally {
      setSaving(false);
    }
  };

  const stateOptions = [
    { code: "NC", label: "North Carolina" },
    { code: "VA", label: "Virginia" },
    { code: "PA", label: "Pennsylvania" },
  ];

  const watchedBottlesList = useMemo(() => {
    if (!mounted) return [];
    return bottles.filter((b) => watchedBottles.includes(b.id));
  }, [bottles, watchedBottles, mounted]);

  const showWatchlistSection = mounted && (isSignedIn || watchedBottles.length > 0);

  // Auto-filter bottles by selected states from saved prefs
  const filteredBottles = useMemo(() => {
    if (!prefs.states || prefs.states.length === 0) return bottles;
    return bottles.filter((b) => !b.state || prefs.states.includes(b.state));
  }, [bottles, prefs.states]);

  // PA stores grouped by county
  const paStoresByCounty = useMemo(() => {
    const paStoresAll = stores.filter((s) => s.state === "PA");
    const byCounty: Record<string, typeof paStoresAll> = {};
    for (const store of paStoresAll) {
      if (!store.county) continue;
      if (!byCounty[store.county]) byCounty[store.county] = [];
      byCounty[store.county].push(store);
    }
    return byCounty;
  }, [stores]);

  // VA stores grouped by city (title-cased)
  const vaStoresByCity = useMemo(() => {
    const vaStoresAll = stores.filter((s) => s.state === "VA");
    const byCity: Record<string, typeof vaStoresAll> = {};
    for (const store of vaStoresAll) {
      const city = (store.city || "").replace(/\b\w/g, (c) => c.toUpperCase());
      if (!city) continue;
      if (!byCity[city]) byCity[city] = [];
      byCity[city].push(store);
    }
    return byCity;
  }, [stores]);

  // Dynamic VA city list from actual store data (falls back to static list if stores not loaded)
  const vaCityOptions = useMemo(() => {
    const liveCities = Object.keys(vaStoresByCity).sort();
    return liveCities.length > 0 ? liveCities : VA_CITIES;
  }, [vaStoresByCity]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      <Navigation />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Page Header */}
        <section
          className="relative"
          style={{
            paddingTop: "120px",
            paddingBottom: "24px",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow behind title */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 600px 300px at 50% 40%, rgba(196, 148, 58, 0.06) 0%, transparent 70%)",
            }}
          />

          <div
            style={{
              maxWidth: 800,
              margin: "0 auto",
              padding: "0 clamp(20px, 5vw, 40px)",
              position: "relative",
            }}
          >
            <ScrollReveal delay={100}>
              <h1
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(32px, 5vw, 48px)",
                  fontWeight: 700,
                  color: "var(--color-cream)",
                  lineHeight: 1.1,
                  marginBottom: "16px",
                }}
              >
                Dashboard
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "16px",
                  color: "var(--color-text-secondary)",
                  maxWidth: "480px",
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}
              >
                Select your location preferences, save your favorite bottles to your watchlist, get alerted when they hit your area.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* ── Where I'm Hunting ── */}
        {mounted && isSignedIn && (
          <section style={{ padding: "0 0 32px" }}>
            <div
              style={{
                maxWidth: 800,
                margin: "0 auto",
                padding: "0 clamp(20px, 5vw, 40px)",
              }}
            >
              <div
                style={{
                  background: "var(--color-card-bg)",
                  border: "1px solid var(--color-card-border)",
                  borderRadius: "12px",
                  padding: "28px",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--color-cream)",
                    marginBottom: "6px",
                  }}
                >
                  Where I&apos;m Hunting
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "24px",
                  }}
                >
                  Filter the drop feed to only show bottles in your area. Select states, then narrow down by specific boards or cities.
                </p>

                {/* State pills */}
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                  }}
                >
                  States I hunt in
                </p>
                <div className="flex flex-wrap gap-3">
                  {stateOptions.map(({ code, label }) => {
                    const active = localPrefs.states.includes(code);
                    return (
                      <button
                        key={code}
                        onClick={() => toggleState(code)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "10px 18px",
                          borderRadius: "8px",
                          border: active
                            ? "1px solid rgba(196,148,58,0.6)"
                            : "1px solid rgba(255,255,255,0.1)",
                          background: active
                            ? "rgba(196,148,58,0.15)"
                            : "rgba(255,255,255,0.03)",
                          color: active
                            ? "var(--color-accent-amber)"
                            : "var(--color-text-tertiary)",
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "14px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 150ms ease",
                        }}
                      >
                        {active && (
                          <span style={{ fontSize: "12px" }}>✓</span>
                        )}
                        {code} — {label}
                      </button>
                    );
                  })}
                </div>

                {/* Per-state sub-sections */}
                {localPrefs.states.includes("NC") && (
                  <StateAreaSection
                    stateCode="NC"
                    label="Boards"
                    subLabel="NC boards"
                    options={NC_BOARDS}
                    selected={localPrefs.ncBoards}
                    placeholder="Search NC boards…"
                    onAdd={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        ncBoards: [...p.ncBoards, item],
                      }))
                    }
                    onRemove={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        ncBoards: p.ncBoards.filter((b) => b !== item),
                      }))
                    }
                  />
                )}

                {localPrefs.states.includes("VA") && (
                  <StateAreaSection
                    stateCode="VA"
                    label="Cities"
                    subLabel="VA cities"
                    options={vaCityOptions}
                    selected={localPrefs.vaCities}
                    placeholder="Search VA cities…"
                    onAdd={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        vaCities: [...p.vaCities, item],
                      }))
                    }
                    onRemove={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        vaCities: p.vaCities.filter((c) => c !== item),
                      }))
                    }
                  >
                    {/* Store list per selected VA city */}
                    {localPrefs.vaCities.length > 0 && stores.length > 0 &&
                      localPrefs.vaCities.map((city) => {
                        const cityStores = vaStoresByCity[city] ?? [];
                        if (cityStores.length === 0) return null;
                        return (
                          <div key={city} style={{ marginTop: "10px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(196,148,58,0.08)", borderRadius: "6px" }}>
                            <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                              {city} — {cityStores.length} store{cityStores.length !== 1 ? "s" : ""}
                            </p>
                            {cityStores.map((s) => (
                              <p key={s.id} style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)", marginBottom: "3px" }}>
                                · {s.address || `Store #${s.id}`}{s.district ? ` (${s.district})` : ""}
                              </p>
                            ))}
                          </div>
                        );
                      })}
                  </StateAreaSection>
                )}

                {localPrefs.states.includes("PA") && (
                  <StateAreaSection
                    stateCode="PA"
                    label="Counties"
                    subLabel="PA counties"
                    options={PA_COUNTIES}
                    selected={localPrefs.paCounties}
                    placeholder="Search PA counties…"
                    onAdd={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        paCounties: [...p.paCounties, item],
                      }))
                    }
                    onRemove={(item) =>
                      setLocalPrefs((p) => ({
                        ...p,
                        paCounties: p.paCounties.filter((c) => c !== item),
                        // Also remove stores from that county
                        paStores: p.paStores.filter(
                          (id) =>
                            !(paStoresByCounty[item] ?? []).some((s) => s.id === id)
                        ),
                      }))
                    }
                  >
                    {/* Store-level pickers for each selected PA county */}
                    {localPrefs.paCounties.length > 0 && stores.length > 0 &&
                      localPrefs.paCounties.map((county) => {
                        const countyStores = paStoresByCounty[county] ?? [];
                        if (countyStores.length === 0) return null;
                        return (
                          <PAStorePicker
                            key={county}
                            county={county}
                            stores={countyStores}
                            paStores={localPrefs.paStores}
                            onAddStore={(id) =>
                              setLocalPrefs((p) => ({
                                ...p,
                                paStores: [...p.paStores, id],
                              }))
                            }
                            onRemoveStore={(id) =>
                              setLocalPrefs((p) => ({
                                ...p,
                                paStores: p.paStores.filter((s) => s !== id),
                              }))
                            }
                          />
                        );
                      })
                    }
                  </StateAreaSection>
                )}

                {/* Save button */}
                <div style={{ marginTop: "28px" }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "12px 28px",
                      borderRadius: "8px",
                      background: saved
                        ? "rgba(45,106,79,0.6)"
                        : "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                      border: saved
                        ? "1px solid rgba(45,106,79,0.8)"
                        : "none",
                      color: saved ? "#A8D5BC" : "#0D0B07",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.7 : 1,
                      transition: "all 200ms ease",
                      minWidth: "160px",
                    }}
                  >
                    {saving ? "Saving…" : saved ? "Saved ✓" : "Save Preferences"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* My Watchlist */}
        {showWatchlistSection && (
          <section
            style={{
              padding: "0 0 24px",
            }}
          >
            <div
              style={{
                maxWidth: 1200,
                margin: "0 auto",
                padding: "0 clamp(20px, 5vw, 48px)",
              }}
            >
              <ScrollReveal delay={300}>
                <div
                  className="flex items-center gap-3"
                  style={{ marginBottom: "16px" }}
                >
                  <h2
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "var(--color-cream)",
                    }}
                  >
                    My Watchlist
                  </h2>
                  {watchedBottlesList.length > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--color-accent-amber)",
                        background: "rgba(196, 148, 58, 0.12)",
                        border: "1px solid rgba(196, 148, 58, 0.25)",
                        borderRadius: "12px",
                        padding: "2px 10px",
                      }}
                    >
                      {watchedBottlesList.length}
                    </span>
                  )}
                </div>

                {watchedBottlesList.length === 0 ? (
                  <div
                    style={{
                      padding: "32px 24px",
                      background: "var(--color-card-bg)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      Add bottles below to start tracking your watchlist
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex gap-4"
                    style={{
                      overflowX: "auto",
                      paddingBottom: "8px",
                      scrollSnapType: "x mandatory",
                    }}
                  >
                    {watchedBottlesList.map((bottle) => (
                      <WatchlistCard
                        key={bottle.id}
                        bottle={bottle}
                        onRemove={() => removeBottle(bottle.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollReveal>
            </div>
          </section>
        )}

        {/* Bottle Grid — auto-filtered by hunting area states */}
        <BottleGrid bottles={filteredBottles} loading={loading} />
      </motion.div>

      <Footer />
    </div>
  );
}
