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
import type { AlertMode, AreaPreferences, UserAlertPreferences } from "@/app/api/user/preferences/route";
import { canonicalBottleKey, dropMatchesBottle } from "@/lib/bottleIdentity";
import { getDisplayName, isRealDropEvent, type DropEvent } from "@/lib/drops";
import { LiquidToggle } from "@/components/LiquidToggle";
import { getDefaultNotificationPreferences, type NotificationPreferences } from "@/lib/notification-preferences";
import { getPopularBottlePool } from "@/lib/bottleSuggestions";
import { ENGINE_COVERED_STATE_CODES } from "@/lib/statePreferences";
import { buildUserTasteProfile, createBourbonDnaProfile, scoreBourbonDnaMatch } from "@/lib/bourbon-dna";

const EMPTY_PREFS: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  ohCities: [],
  iaCities: [],
  paCounties: [],
  paStores: [],
};

const SIMPLE_STATE_CODES = ENGINE_COVERED_STATE_CODES;

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

interface BibleBottleSuggestion {
  id: string;
  canonicalName: string;
  brand: string;
  producer?: string;
  category?: "bourbon" | "rye" | "american_whiskey";
  proof?: number;
  ageStatement?: string | null;
  msrp?: number | null;
  availability?: string;
  buyerVerdict?: string;
  aliases?: string[];
  isAlertEligible?: boolean;
  summary?: string;
  guidance?: string;
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

interface RecommendedBottleInsight {
  option: BottleOption;
  score: number;
  matchedFlavors: string[];
  recentSightings: Array<{ location: string; state: string; timestamp: string; href: string }>;
  reason: string;
  proofMatchLabel: string;
  proofMatchExplanation: string;
}

interface BourbonDnaSummary {
  favoriteTags: string[];
  preferredProof?: number;
  preferredProofRange?: { min: number; max: number };
  basedOnCount: number;
  proofBottleCount: number;
  summary: string;
}

type DashboardSection = "alerts" | "collection" | "recommendations";

const TASTE_TAG_OPTIONS = ["Caramel", "Vanilla", "Oak", "Cherry", "Spice", "Proof heat", "Sweet", "Dark fruit", "Nutty", "Smoky", "Dessert", "Balanced"];

function tasteScoreLabel(score: number) {
  if (score >= 95) return "All-time favorite";
  if (score >= 85) return "Love it";
  if (score >= 70) return "Like it";
  if (score >= 50) return "Occasional pour";
  return "Not for me";
}

function tasteScoreDescription(score: number) {
  if (score >= 95) return "A bottle you would actively hunt, bunker, or recommend.";
  if (score >= 85) return "Strong positive signal for your recommendation profile.";
  if (score >= 70) return "Good fit, but not a must-chase bottle.";
  if (score >= 50) return "Useful context, but weaker recommendation signal.";
  return "Negative signal so we can avoid similar bottles later.";
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

function normalizePreferenceBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLocationText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeNcBoardLabel(value: string) {
  return value
    .replace(/abc/gi, "")
    .replace(/board/gi, "")
    .replace(/county/gi, "")
    .replace(/\bstores?\b/gi, "")
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
  if (/warehouse|statewide|north carolina|county boards|\+/i.test(value)) return false;
  return value.length >= 3;
}

function ncBoardSourceLabel(store: { name?: string | null; county?: string | null; district?: string | null; displayLabel?: string | null; locationType?: string | null; precision?: string | null; hasSignals?: boolean }) {
  const isStoreRecord = store.locationType === "store" || store.precision === "store";
  if (isStoreRecord) {
    if (!store.hasSignals) return null;
    return store.county || store.district || null;
  }
  const isBoardRecord = store.locationType === "county_board" || store.precision === "county_board";
  if (!isBoardRecord) return null;
  return store.district || store.county || store.name || store.displayLabel || null;
}

function isSelectableStoreLocation(store: { id?: string | null; name?: string | null; state?: string | null; city?: string | null; county?: string | null; precision?: string | null }) {
  return Boolean(store.id && store.name && store.precision === "store" && store.state && (store.city || store.county));
}

function storePhysicalKey(store: { id?: string | null; name?: string | null; state?: string | null; city?: string | null; county?: string | null; address?: string | null }) {
  return [store.state, store.name, store.address, store.city, store.county]
    .map((part) => String(part || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim())
    .join("|");
}

function formatStoreLabel(store: { name?: string | null; city?: string | null; address?: string | null }) {
  const trimmedName = (store.name || "Unnamed store").trim();
  const trimmedAddress = store.address?.trim();
  const trimmedCity = store.city?.trim();
  if (trimmedAddress) return `${trimmedName} · ${trimmedAddress}`;
  return trimmedCity ? `${trimmedName} · ${trimmedCity}` : trimmedName;
}

function formatShortDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(time));
}

function dropLocationLabel(drop: DropEvent) {
  const firstStore = drop.stores?.[0] || drop.store_details?.[0];
  const storeLabel = firstStore ? [
    "name" in firstStore ? firstStore.name : undefined,
    "store_address" in firstStore ? firstStore.store_address : undefined,
    firstStore.city,
    "county" in firstStore ? firstStore.county : undefined,
  ].filter(Boolean).join(" · ") : "";
  return drop.display_location || drop.store_name || drop.store_address || storeLabel || drop.board_name || drop.store_city || drop.store_county || "Recent sighting";
}

function dropStateLabel(drop: DropEvent) {
  return (drop.state_code || drop.state || drop.display_state || "").toUpperCase();
}

function finderSignalHref(bottleName: string, state?: string) {
  const params = new URLSearchParams({ bottle: bottleName });
  if (state) params.set("state", state);
  return `/finder?${params.toString()}#drops`;
}

function dropMatchesAreaPreferences(drop: DropEvent, areaPrefs: AreaPreferences) {
  const state = dropStateLabel(drop);
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;

  const location = normalizeLocationText([
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ].filter(Boolean).join(" "));

  if (state === "NC" && areaPrefs.ncBoards.length) return areaPrefs.ncBoards.some((board) => location.includes(normalizeLocationText(board)));
  if (state === "VA" && areaPrefs.vaCities.length) return areaPrefs.vaCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "OH" && areaPrefs.ohCities.length) return areaPrefs.ohCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "PA" && areaPrefs.paCounties.length) return areaPrefs.paCounties.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "PA" && areaPrefs.paStores.length) return areaPrefs.paStores.some((storeId) => location.includes(normalizeLocationText(storeId)));
  return true;
}


function makeStateLabel(code: string) {
  const labels: Record<string, string> = {
    NC: "North Carolina",
    VA: "Virginia",
    OH: "Ohio",
    IA: "Iowa",
    PA: "Pennsylvania",
    AL: "Alabama",
    IN: "Indiana",
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
  sectionLabel = "Alert setup",
  title,
  subtitle,
  hideHeader = false,
  attached = false,
  children,
}: {
  step: string;
  sectionLabel?: string;
  title: string;
  subtitle: string;
  hideHeader?: boolean;
  attached?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="dashboard-drawer-shell"
      data-attached={attached}
      style={{
        border: "1px solid rgba(196,148,58,0.12)",
        background: "linear-gradient(180deg, rgba(17,13,10,0.92) 0%, rgba(11,9,7,0.96) 100%)",
        padding: "clamp(18px, 3vw, 28px)",
        boxShadow: "inset 0 1px 0 rgba(245,237,214,0.03)",
      }}
    >
      <div style={{ display: "grid", gap: hideHeader ? "0" : "20px" }}>
        {!hideHeader ? (
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
              <span>{sectionLabel}</span>
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
        ) : null}
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

function HubCard({
  eyebrow,
  title,
  body,
  status,
  href,
  onClick,
  accent = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  status: string;
  href?: string;
  onClick?: () => void;
  accent?: boolean;
}) {
  const content = (
    <div
      style={{
        minHeight: "100%",
        borderRadius: "22px",
        border: accent ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)",
        background: accent
          ? "linear-gradient(180deg, rgba(47,33,17,0.74) 0%, rgba(18,15,11,0.94) 100%)"
          : "rgba(255,255,255,0.03)",
        padding: "22px",
        boxShadow: accent ? "0 0 44px rgba(196,148,58,0.08)" : "none",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {eyebrow}
        </p>
        <h2 style={{ margin: "10px 0 0", fontFamily: "var(--font-playfair)", fontSize: "28px", color: "var(--color-cream)", lineHeight: 1.08 }}>
          {title}
        </h2>
      </div>
      <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: 1.75 }}>
        {body}
      </p>
      <div style={{ alignSelf: "end", display: "inline-flex", width: "fit-content", borderRadius: "999px", border: "1px solid rgba(196,148,58,0.20)", background: "rgba(196,148,58,0.08)", padding: "7px 11px", fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {status}
      </div>
    </div>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} style={{ color: "inherit", textDecoration: "none", border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}>{content}</button>;
  }
  if (!href) return content;
  return <a href={href} style={{ color: "inherit", textDecoration: "none" }}>{content}</a>;
}

export default function DashboardPage() {
  const { bottles, loading } = useBottles();
  const { stores } = useStores();
  const { drops: recentDrops } = useDrops({ limit: 120 });
  const { drops: ncDrops } = useDrops({ limit: 500, state: "NC" });
  const { stats: engineStats } = useStats();
  const { isSignedIn, signIn } = useAuth();
  const { prefs, loading: prefsLoading, savePreferences } = useAreaPreferences();
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();

  const [mounted, setMounted] = useState(false);
  const [bottleQuery, setBottleQuery] = useState("");
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>(EMPTY_PREFS);
  const [savingLocations, setSavingLocations] = useState(false);
  const [savedLocations, setSavedLocations] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [alertMode, setAlertMode] = useState<AlertMode>("anything_notable");
  const [alertPreview, setAlertPreview] = useState<AlertPreviewState>({
    sending: false,
    success: false,
    error: null,
  });
  const [savedNotifications, setSavedNotifications] = useState(false);
  const [collapsedStates, setCollapsedStates] = useState<Record<string, boolean>>({});
  const [storeSelections, setStoreSelections] = useState<Record<string, StoreSelectionState>>({});
  const [loadedSignedOutDefaults, setLoadedSignedOutDefaults] = useState(false);

  const [territoryDropdown, setTerritoryDropdown] = useState<TerritoryDropdownState | null>(null);
  const [territorySearch, setTerritorySearch] = useState("");
  const [activeTerritoryState, setActiveTerritoryState] = useState<string>("NC");
  const [activeDashboardSection, setActiveDashboardSection] = useState<DashboardSection | null>(null);
  const territoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const hydratedBottlePrefsKeyRef = useRef("");
  const [collectionBottleQuery, setCollectionBottleQuery] = useState("");
  const [selectedCollectionBottle, setSelectedCollectionBottle] = useState<BottleOption | null>(null);
  const [collectionBibleSuggestions, setCollectionBibleSuggestions] = useState<BibleBottleSuggestion[]>([]);
  const [broadBottleCatalog, setBroadBottleCatalog] = useState<BibleBottleSuggestion[]>([]);
  const [loadingCollectionSuggestions, setLoadingCollectionSuggestions] = useState(false);
  const [collectionRating, setCollectionRating] = useState(85);
  const [collectionTasteTags, setCollectionTasteTags] = useState<string[]>([]);
  const [collectionNotes, setCollectionNotes] = useState("");
  const [savingCollection, setSavingCollection] = useState(false);
  const [savedCollection, setSavedCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionRatingDrafts, setCollectionRatingDrafts] = useState<Record<string, number>>({});
  const [editingCollectionKey, setEditingCollectionKey] = useState<string | null>(null);
  const [dnaFeedbackState, setDnaFeedbackState] = useState<Record<string, string>>({});

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
    if (isSignedIn) {
      setLoadedSignedOutDefaults(false);
      setLocalPrefs(prefs.areaPreferences);
      setNotificationPrefs(prefs.notificationPreferences);
      setAlertMode(prefs.alertMode ?? "anything_notable");
      return;
    }
    if (!loadedSignedOutDefaults) {
      setLocalPrefs(EMPTY_PREFS);
      setNotificationPrefs(getDefaultNotificationPreferences());
      setAlertMode("anything_notable");
      setLoadedSignedOutDefaults(true);
    }
  }, [prefs, isSignedIn, mounted, loadedSignedOutDefaults]);

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

  const collectionEntries = prefs.collectionPreferences?.bottles ?? [];
  const collectionKeys = useMemo(() => new Set(collectionEntries.map((entry) => entry.canonicalKey)), [collectionEntries]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bottle-catalog")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled || !payload) return;
        setBroadBottleCatalog(Array.isArray(payload.bottles) ? payload.bottles : []);
      })
      .catch(() => {
        if (!cancelled) setBroadBottleCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = collectionBottleQuery.trim();
    if (query.length < 2 || selectedCollectionBottle) {
      setCollectionBibleSuggestions([]);
      setLoadingCollectionSuggestions(false);
      return;
    }

    const controller = new AbortController();
    setLoadingCollectionSuggestions(true);
    const timeout = window.setTimeout(() => {
      fetch(`/api/bottle-check?q=${encodeURIComponent(query)}&state=${encodeURIComponent(localPrefs.states[0] || "NC")}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!payload) return;
          const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
          const bottle = payload.bottle ? [payload.bottle] : [];
          setCollectionBibleSuggestions([...bottle, ...suggestions].filter((item): item is BibleBottleSuggestion => Boolean(item?.id && item?.canonicalName)));
        })
        .catch((error) => {
          if (error?.name !== "AbortError") setCollectionBibleSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingCollectionSuggestions(false);
        });
    }, 140);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [collectionBottleQuery, localPrefs.states, selectedCollectionBottle]);

  const bibleSuggestionOptions = useMemo<BottleOption[]>(() => {
    return collectionBibleSuggestions.map((suggestion) => {
      const canonicalKey = canonicalBottleKey(suggestion.canonicalName);
      const bottle: Bottle = {
        id: `bible-${suggestion.id}`,
        name: suggestion.canonicalName,
        canonical_id: suggestion.id,
        canonical_name: suggestion.canonicalName,
        canonical_key: canonicalKey,
        aliases: suggestion.aliases || [],
        states: [],
        state_ids: {},
        state_aliases: {},
        search_aliases: [suggestion.canonicalName, suggestion.brand, ...(suggestion.aliases || [])],
        distillery: suggestion.brand || "Bourbon Bible",
        tier: suggestion.availability === "unicorn" ? "unicorn" : suggestion.isAlertEligible ? "limited" : "limited",
        msrp: typeof suggestion.msrp === "number" ? suggestion.msrp : 0,
        proof: suggestion.proof,
        ageStatement: suggestion.ageStatement || undefined,
        flavor: createBourbonDnaProfile({ name: suggestion.canonicalName, brand: suggestion.brand, producer: suggestion.producer, proof: suggestion.proof, category: suggestion.category, aliases: suggestion.aliases }).tags,
        has_inventory: false,
      };
      return {
        canonicalKey,
        label: suggestion.canonicalName,
        bottleIds: [bottle.id],
        bottle,
      };
    });
  }, [collectionBibleSuggestions]);

  const broadCatalogBottleOptions = useMemo<BottleOption[]>(() => {
    return broadBottleCatalog.map((suggestion) => {
      const canonicalKey = canonicalBottleKey(suggestion.canonicalName);
      const bottle: Bottle = {
        id: `catalog-${suggestion.id}`,
        name: suggestion.canonicalName,
        canonical_id: suggestion.id,
        canonical_name: suggestion.canonicalName,
        canonical_key: canonicalKey,
        aliases: suggestion.aliases || [],
        states: [],
        state_ids: {},
        state_aliases: {},
        search_aliases: [suggestion.canonicalName, suggestion.brand, ...(suggestion.aliases || [])],
        distillery: suggestion.brand || suggestion.producer || "Bourbon Bible",
        tier: suggestion.availability === "unicorn" ? "unicorn" : suggestion.isAlertEligible ? "limited" : "limited",
        msrp: typeof suggestion.msrp === "number" ? suggestion.msrp : 0,
        proof: suggestion.proof,
        ageStatement: suggestion.ageStatement || undefined,
        flavor: createBourbonDnaProfile({ name: suggestion.canonicalName, brand: suggestion.brand, producer: suggestion.producer, proof: suggestion.proof, category: suggestion.category, aliases: suggestion.aliases }).tags,
        has_inventory: false,
      };
      return { canonicalKey, label: suggestion.canonicalName, bottleIds: [bottle.id], bottle };
    });
  }, [broadBottleCatalog]);

  const filteredCollectionBottleOptions = useMemo(() => {
    const query = collectionBottleQuery.trim().toLowerCase();
    if (!query) return [];
    const localMatches = bottleOptions.filter((option) => {
      if (collectionKeys.has(option.canonicalKey)) return false;
      return [
        option.label,
        option.bottle.distillery,
        ...(option.bottle.flavor || []),
        ...(option.bottle.search_aliases || []),
        ...Object.values(option.bottle.state_aliases || {}).flat(),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    const merged = new Map<string, BottleOption>();
    for (const option of [...localMatches, ...bibleSuggestionOptions]) {
      if (collectionKeys.has(option.canonicalKey)) continue;
      if (!merged.has(option.canonicalKey)) merged.set(option.canonicalKey, option);
    }
    return Array.from(merged.values()).slice(0, 10);
  }, [bibleSuggestionOptions, bottleOptions, collectionBottleQuery, collectionKeys]);

  const collectionTasteProfile = useMemo(() => {
    const bottleLookup = new Map<string, BottleOption>();
    for (const option of broadCatalogBottleOptions) bottleLookup.set(option.canonicalKey, option);
    for (const option of bottleOptions) bottleLookup.set(option.canonicalKey, option);
    return buildUserTasteProfile(collectionEntries.map((entry) => ({
      canonicalKey: entry.canonicalKey,
      bottleName: entry.bottleName,
      rating: entry.rating,
      tasteTags: entry.tasteTags,
      proof: bottleLookup.get(entry.canonicalKey)?.bottle.proof,
      wouldBuyAgain: entry.wouldBuyAgain,
    })));
  }, [bottleOptions, broadCatalogBottleOptions, collectionEntries]);

  const bourbonDnaSummary = useMemo<BourbonDnaSummary>(() => {
    const proofText = collectionTasteProfile.preferredProofRange
      ? `${collectionTasteProfile.preferredProofRange.min}-${collectionTasteProfile.preferredProofRange.max} proof`
      : "rate more bottles with known proof to learn your proof range";
    const tagText = collectionTasteProfile.favoriteTags.length
      ? collectionTasteProfile.favoriteTags.slice(0, 4).join(", ")
      : "rate bottles and pick taste cues to build this profile";
    return {
      favoriteTags: collectionTasteProfile.favoriteTags,
      preferredProof: collectionTasteProfile.preferredProof,
      preferredProofRange: collectionTasteProfile.preferredProofRange,
      basedOnCount: collectionEntries.filter((entry) => entry.rating >= 80).length,
      proofBottleCount: collectionTasteProfile.proofBottleCount,
      summary: collectionTasteProfile.favoriteTags.length
        ? `Your Bourbon DNA currently leans toward ${tagText}. Your strongest proof signal is ${proofText}.`
        : "Rate a few bottles 80+ and choose taste cues to build your Bourbon DNA profile.",
    };
  }, [collectionEntries, collectionTasteProfile]);

  const collectionRecommendationInsights = useMemo<RecommendedBottleInsight[]>(() => {
    const ownedKeys = new Set(collectionEntries.map((entry) => entry.canonicalKey));
    const recommendationOptionsMap = new Map<string, BottleOption>();
    for (const option of broadCatalogBottleOptions) recommendationOptionsMap.set(option.canonicalKey, option);
    for (const option of bottleOptions) recommendationOptionsMap.set(option.canonicalKey, option);
    const recommendationOptions = Array.from(recommendationOptionsMap.values());

    if (!collectionTasteProfile.favoriteTags.length) return [];
    return recommendationOptions
      .filter((option) => !ownedKeys.has(option.canonicalKey) && !selectedCanonicalKeys.has(option.canonicalKey))
      .map((option) => {
        const dnaProfile = createBourbonDnaProfile({
          name: option.bottle.canonical_name || option.bottle.name,
          brand: option.bottle.distillery,
          proof: option.bottle.proof,
          aliases: [...(option.bottle.aliases || []), ...(option.bottle.search_aliases || [])],
          userTags: option.bottle.flavor,
        });
        const dnaMatch = scoreBourbonDnaMatch(collectionTasteProfile, dnaProfile, option.bottle.proof);
        return {
          option,
          matchedFlavors: dnaMatch.matchedTags,
          dnaScore: dnaMatch.score,
          dnaReason: dnaMatch.explanation,
          proofMatchLabel: dnaMatch.proofMatch.label,
          proofMatchExplanation: dnaMatch.proofMatch.explanation,
          recentSightings: recentDrops
          .filter((drop) => isRealDropEvent(drop))
          .filter((drop) => dropMatchesBottle(drop, option.bottle))
          .filter((drop) => dropMatchesAreaPreferences(drop, localPrefs))
          .slice(0, 3)
          .map((drop) => {
            const state = dropStateLabel(drop);
            return {
              location: dropLocationLabel(drop),
              state,
              timestamp: drop.timestamp || drop.observed_at || drop.event_at || drop.first_seen_at || "",
              href: finderSignalHref(option.label, state),
            };
          }),
        };
      })
      .map((item) => ({
        ...item,
        score: item.dnaScore + item.recentSightings.length * 2 + (item.option.bottle.tier === "allocated" ? 1 : 0),
      }))
      .filter((item) => item.score > 0 && (item.matchedFlavors.length > 0 || item.proofMatchLabel !== "Proof unavailable"))
      .sort((a, b) => b.score - a.score || b.recentSightings.length - a.recentSightings.length || a.option.label.localeCompare(b.option.label))
      .slice(0, 4)
      .map((item) => ({
        option: item.option,
        score: item.score,
        matchedFlavors: item.matchedFlavors,
        recentSightings: item.recentSightings,
        proofMatchLabel: item.proofMatchLabel,
        proofMatchExplanation: item.proofMatchExplanation,
        reason: item.recentSightings.length
          ? `${item.dnaReason} Recent market signal found.`
          : item.dnaReason,
      }));
  }, [bottleOptions, broadCatalogBottleOptions, collectionEntries, collectionTasteProfile, localPrefs, recentDrops, selectedCanonicalKeys]);

  const suggestedBottleOptions = useMemo(() => {
    const pool = getPopularBottlePool(bottleOptions.map((option) => option.bottle)).slice(0, 5);
    const ids = new Set(pool.map((bottle) => bottle.id));
    return bottleOptions.filter((option) => ids.has(option.bottle.id) && !selectedCanonicalKeys.has(option.canonicalKey));
  }, [bottleOptions, selectedCanonicalKeys]);

  useEffect(() => {
    if (!mounted || !isSignedIn || bottleOptions.length === 0) return;
    const savedNames = prefs.bottleAlertPreferences.bottleNames.map(normalizePreferenceBottleKey).filter(Boolean);
    const savedKeys = prefs.bottleAlertPreferences.bottleKeys.map(normalizePreferenceBottleKey).filter(Boolean);
    const savedSignature = [...savedNames, ...savedKeys].sort().join("|");
    if (!savedSignature || hydratedBottlePrefsKeyRef.current === savedSignature) return;

    const savedSet = new Set([...savedNames, ...savedKeys]);
    const matchingOptions = bottleOptions.filter((option) => {
      const optionKeys = [option.canonicalKey, option.label, option.bottle.name, ...(option.bottle.search_aliases || [])]
        .filter(Boolean)
        .map((value) => normalizePreferenceBottleKey(String(value)));
      return optionKeys.some((key) => savedSet.has(key));
    });

    matchingOptions.forEach((option) => option.bottleIds.forEach((id) => addBottle(id)));
    hydratedBottlePrefsKeyRef.current = savedSignature;
  }, [addBottle, bottleOptions, isSignedIn, mounted, prefs.bottleAlertPreferences.bottleKeys, prefs.bottleAlertPreferences.bottleNames]);

  const ncBoards = useMemo(() => {
    const boardNames = new Set<string>();

    const addBoard = (raw?: string | null) => {
      if (!raw) return;
      const label = normalizeNcBoardLabel(raw);
      if (isLikelyNcBoardLabel(label)) boardNames.add(label);
    };

    for (const store of stores) {
      if (store.state !== "NC" && store.state !== "North Carolina") continue;
      addBoard(ncBoardSourceLabel(store));
    }

    for (const drop of ncDrops) {
      addBoard(drop.board_name || drop.store_county);
    }

    return Array.from(boardNames).sort();
  }, [stores, ncDrops]);

  const citiesByState = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const state of ["VA", "OH", "PA"] as const) {
      grouped[state] = Array.from(
        new Set(
          stores.flatMap((store) => {
            if (store.state !== state || !store.city || !isSelectableStoreLocation(store)) return [];
            return [titleCase(store.city)];
          })
        )
      ).sort();
    }
    return grouped;
  }, [stores]);

  const storesByStateCity = useMemo(() => {
    const grouped = new Map<string, typeof stores>();
    for (const store of stores) {
      if (!isSelectableStoreLocation(store)) continue;
      if (["VA", "OH"].includes(store.state) && store.city) {
        const city = titleCase(store.city);
        const key = `${store.state}:${city}`;
        if (!(grouped.get(key) ?? []).some((existing) => existing.id === store.id || storePhysicalKey(existing) === storePhysicalKey(store))) {
          const existing = grouped.get(key) ?? [];
          grouped.set(key, [...existing, store]);
        }
      }
      if (store.state === "PA" && store.city) {
        const city = titleCase(store.city);
        const key = `PA:${city}`;
        if (!(grouped.get(key) ?? []).some((existing) => existing.id === store.id || storePhysicalKey(existing) === storePhysicalKey(store))) {
          const existing = grouped.get(key) ?? [];
          grouped.set(key, [...existing, store]);
        }
      }
    }
    for (const [key, storeList] of grouped) {
      grouped.set(key, [...storeList].sort((a, b) => formatStoreLabel(a).localeCompare(formatStoreLabel(b))));
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
      location: drop.store_address || drop.board_name || drop.store_city || "Drop location",
      timestamp: drop.timestamp,
      state: drop.state || drop.state_code || "NC",
    }));
  }, [mounted, watchedBottleOptions, recentDrops, bottles]);

  const recommendationMarketSummary = useMemo(() => {
    const recommendedCount = collectionRecommendationInsights.length;
    const sightedCount = collectionRecommendationInsights.filter((insight) => insight.recentSightings.length > 0).length;
    const totalSightings = collectionRecommendationInsights.reduce((sum, insight) => sum + insight.recentSightings.length, 0);
    return {
      recommendedCount,
      sightedCount,
      totalSightings,
      summary: recommendedCount
        ? `${sightedCount}/${recommendedCount} suggestions have recent sightings in your selected markets.`
        : "Rate bottles 80+ to build your recommendation graph.",
    };
  }, [collectionRecommendationInsights]);


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
      totalCount: citiesByState.VA?.length ?? 0,
    },
    {
      stateCode: "OH",
      label: "Ohio",
      detailLabel: "cities",
      summary: "Ohio has store-level OHLQ coverage. Choose the cities you realistically chase.",
      selectedCount: localPrefs.ohCities.length,
      totalCount: citiesByState.OH?.length ?? 0,
    },
    {
      stateCode: "PA",
      label: "Pennsylvania",
      detailLabel: "cities",
      summary: "FWGS pickup inventory is now available by store. Start with the cities you actually hunt.",
      selectedCount: localPrefs.paCounties.length,
      totalCount: citiesByState.PA?.length ?? 0,
    },
  ]), [citiesByState, localPrefs.ncBoards.length, localPrefs.ohCities.length, localPrefs.paCounties.length, localPrefs.vaCities.length, ncBoards.length]);

  const addBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => addBottle(id));
    setBottleQuery("");
  };

  const removeBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => removeBottle(id));
  };

  const saveCollectionEntries = async (entries: UserAlertPreferences["collectionPreferences"]["bottles"]) => {
    if (!isSignedIn) {
      signIn();
      return false;
    }
    if (prefsLoading) {
      setCollectionError("Loading your saved preferences. Try again in a second.");
      return false;
    }
    setSavingCollection(true);
    setSavedCollection(false);
    setCollectionError(null);
    try {
      await savePreferences({
        areaPreferences: localPrefs,
        notificationPreferences: notificationPrefs,
        alertMode,
        bottleAlertPreferences: {
          bottleNames: watchedBottleOptions.map((option) => option.label),
          bottleKeys: Array.from(selectedCanonicalKeys),
        },
        collectionPreferences: { bottles: entries },
      });
      setSavedCollection(true);
      setTimeout(() => setSavedCollection(false), 2200);
      return true;
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Could not save your collection yet.");
      return false;
    } finally {
      setSavingCollection(false);
    }
  };

  const stageCollectionBottle = (option: BottleOption) => {
    setSelectedCollectionBottle(option);
    setCollectionBottleQuery(option.label);
    setCollectionError(null);
  };

  const saveStagedCollectionBottle = async () => {
    if (!selectedCollectionBottle) {
      setCollectionError("Choose a bottle from the suggestions before saving.");
      return;
    }
    await addCollectionBottle(selectedCollectionBottle);
  };

  const addCollectionBottle = async (option: BottleOption) => {
    const now = new Date().toISOString();
    const nextEntries = [
      ...collectionEntries.filter((entry) => entry.canonicalKey !== option.canonicalKey),
      {
        bottleId: option.bottle.id,
        bottleName: option.label,
        canonicalKey: option.canonicalKey,
        rating: collectionRating,
        tasteTags: collectionTasteTags,
        wouldBuyAgain: collectionRating >= 80,
        notes: collectionNotes.trim(),
        addedAt: now,
        updatedAt: now,
      },
    ].sort((a, b) => b.rating - a.rating || a.bottleName.localeCompare(b.bottleName));
    const saved = await saveCollectionEntries(nextEntries);
    if (saved) {
      setSelectedCollectionBottle(null);
      setCollectionBottleQuery("");
      setCollectionRating(85);
      setCollectionTasteTags([]);
      setCollectionNotes("");
    }
  };

  const updateCollectionBottle = async (canonicalKey: string, patch: Partial<UserAlertPreferences["collectionPreferences"]["bottles"][number]>) => {
    const now = new Date().toISOString();
    await saveCollectionEntries(collectionEntries.map((entry) =>
      entry.canonicalKey === canonicalKey ? { ...entry, ...patch, updatedAt: now } : entry
    ));
  };

  const removeCollectionBottle = async (canonicalKey: string) => {
    await saveCollectionEntries(collectionEntries.filter((entry) => entry.canonicalKey !== canonicalKey));
  };

  const commitCollectionRating = async (canonicalKey: string) => {
    const rating = collectionRatingDrafts[canonicalKey];
    if (rating === undefined) return;
    await updateCollectionBottle(canonicalKey, { rating });
    setCollectionRatingDrafts((prev) => {
      const next = { ...prev };
      delete next[canonicalKey];
      return next;
    });
  };

  const trackCollectionSuggestion = async (option: BottleOption) => {
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (prefsLoading) {
      setCollectionError("Loading your saved preferences. Try again in a second.");
      return;
    }
    addBottleOption(option);
    setAlertMode("specific_bottles");
    setCollectionError(null);
    try {
      await savePreferences({
        areaPreferences: localPrefs,
        notificationPreferences: notificationPrefs,
        alertMode: "specific_bottles",
        bottleAlertPreferences: {
          bottleNames: Array.from(new Set([...watchedBottleOptions.map((watched) => watched.label), option.label])),
          bottleKeys: Array.from(new Set([...Array.from(selectedCanonicalKeys), option.canonicalKey])),
        },
        collectionPreferences: prefs.collectionPreferences,
      });
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Could not track that suggestion yet.");
    }
  };

  const submitDnaFeedback = async (insight: RecommendedBottleInsight, signal: "useful" | "not_for_me" | "already_own") => {
    if (!isSignedIn) {
      signIn();
      return;
    }
    const stateKey = `${insight.option.canonicalKey}:${signal}`;
    setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "saving" }));
    setCollectionError(null);
    try {
      const response = await fetch("/api/bourbon-dna/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bottleId: insight.option.bottle.canonical_id || insight.option.bottle.id,
          bottleName: insight.option.label,
          signal,
          matchedTags: insight.matchedFlavors,
          score: insight.score,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not save DNA feedback.");
      setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "saved" }));
    } catch (error) {
      setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "error" }));
      setCollectionError(error instanceof Error ? error.message : "Could not save DNA feedback.");
    }
  };

  const toggleState = (state: string) => {
    setLocalPrefs((prev) => {
      const removing = prev.states.includes(state);
      return {
        ...prev,
        states: removing ? prev.states.filter((item) => item !== state) : [...prev.states, state],
        ncBoards: state === "NC" && removing ? [] : prev.ncBoards,
        vaCities: state === "VA" && removing ? [] : prev.vaCities,
        ohCities: state === "OH" && removing ? [] : prev.ohCities,
        iaCities: [],
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
      if (state === "OH") {
        const has = prev.ohCities.includes(value);
        return {
          ...prev,
          ohCities: has ? prev.ohCities.filter((item) => item !== value) : [...prev.ohCities, value],
        };
      }
      if (state === "PA") {
        const has = prev.paCounties.includes(value);
        return {
          ...prev,
          paCounties: has ? prev.paCounties.filter((item) => item !== value) : [...prev.paCounties, value],
          paStores: has ? prev.paStores.filter((storeId) => !(storesByStateCity.get(`PA:${value}`) ?? []).some((store) => store.id === storeId)) : prev.paStores,
        };
      }
      return prev;
    });
  };

  const getStoreSelectionKey = (state: string, city: string) => `${state}:${city}`;

  const updateStoreSelectionMode = (state: string, city: string, mode: "all" | "custom") => {
    const selectionKey = getStoreSelectionKey(state, city);
    const cityStores = (storesByStateCity.get(selectionKey) ?? []).map((store) => store.id);
    if (state === "PA") {
      setLocalPrefs((prev) => ({
        ...prev,
        paStores: mode === "all"
          ? prev.paStores.filter((storeId) => !cityStores.includes(storeId))
          : Array.from(new Set([...prev.paStores, ...(prev.paStores.filter((storeId) => cityStores.includes(storeId)))])),
      }));
    }
    setStoreSelections((prev) => ({
      ...prev,
      [selectionKey]: {
        mode,
        storeIds: mode === "all" ? cityStores : prev[selectionKey]?.storeIds ?? [],
      },
    }));
  };

  const toggleStore = (state: string, city: string, storeId: string) => {
    const selectionKey = getStoreSelectionKey(state, city);
    setStoreSelections((prev) => {
      const current = prev[selectionKey] ?? { mode: "custom" as const, storeIds: [] };
      const has = current.storeIds.includes(storeId);
      const nextStoreIds = has
        ? current.storeIds.filter((id) => id !== storeId)
        : [...current.storeIds, storeId];
      if (state === "PA") {
        setLocalPrefs((prefs) => ({
          ...prefs,
          paStores: has
            ? prefs.paStores.filter((id) => id !== storeId)
            : Array.from(new Set([...prefs.paStores, storeId])),
        }));
      }
      return {
        ...prev,
        [selectionKey]: {
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
    if (!isSignedIn) {
      signIn();
      return;
    }
    setSavingLocations(true);
    try {
      const nextPrefs: UserAlertPreferences = {
        areaPreferences: localPrefs,
        notificationPreferences: notificationPrefs,
        alertMode,
        bottleAlertPreferences: {
          bottleNames: watchedBottleOptions.map((option) => option.label),
          bottleKeys: Array.from(selectedCanonicalKeys),
        },
        collectionPreferences: prefs.collectionPreferences,
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

  const dashboardSections = useMemo<Array<{ key: DashboardSection; label: string; eyebrow: string; summary: string; status: string }>>(() => ([
    { key: "alerts", label: "Alerts", eyebrow: "Alert setup", summary: "Manage your markets, bottle watchlist, and delivery preferences.", status: localPrefs.states.length ? `${localPrefs.states.length} markets` : "Not set" },
    { key: "collection", label: "My Collection", eyebrow: "Taste profile", summary: "Keep track of bottles you own, ratings, tasting cues, and notes.", status: `${collectionEntries.length} owned` },
    { key: "recommendations", label: "Recommendations", eyebrow: "Bottle matches", summary: "See bottle ideas shaped by your collection and local signal context.", status: collectionRecommendationInsights.length ? `${collectionRecommendationInsights.length} ideas` : "Needs ratings" },
  ]), [collectionEntries.length, collectionRecommendationInsights.length, localPrefs.states.length]);

  const toggleDashboardSection = (section: DashboardSection) => {
    setActiveDashboardSection((current) => current === section ? null : section);
  };

  const renderSectionButton = (sectionKey: DashboardSection) => {
    const section = dashboardSections.find((item) => item.key === sectionKey);
    if (!section) return null;
    const active = activeDashboardSection === sectionKey;
    return (
      <button key={`section-${section.key}`} type="button" className="dashboard-section-button" data-active={active} onClick={() => toggleDashboardSection(section.key)}>
        <span className="section-copy">
          <span className="section-eyebrow">{section.eyebrow}</span>
          <span className="section-title-row">
            <span className="section-title">{section.label}</span>
            <span className="section-status">{section.status}</span>
          </span>
          <span className="section-summary">{section.summary}</span>
        </span>
        <span className="section-arrow" aria-hidden="true">
          <span className="section-chevron-stack">
            <span />
            <span />
            <span />
          </span>
        </span>
      </button>
    );
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
                Member Dashboard
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
                Your home base for alerts, tracked bottles, collection notes, and the personalized features coming next.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <style>{`
          .dashboard-shell {
            max-width: 820px;
            margin: 0 auto;
            padding: 0 clamp(16px, 5vw, 36px) 82px;
          }
          .dashboard-workspace {
            display: grid;
            gap: 0;
            min-width: 0;
          }
          .dashboard-section-button {
            width: 100%;
            min-width: 0;
            border: 1px solid rgba(245,237,214,0.09);
            border-radius: 22px;
            background:
              linear-gradient(145deg, rgba(245,237,214,0.052), rgba(245,237,214,0.018)),
              rgba(13,10,7,0.78);
            color: var(--color-text-secondary);
            padding: 18px 18px 17px;
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            box-shadow: 0 18px 44px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.035);
            margin-bottom: 14px;
            position: relative;
            z-index: 2;
            transition: border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease, border-radius 180ms ease, margin-bottom 180ms ease;
          }
          .dashboard-section-button:hover {
            transform: translateY(-1px);
            border-color: rgba(196,148,58,0.22);
            background:
              linear-gradient(145deg, rgba(196,148,58,0.075), rgba(245,237,214,0.022)),
              rgba(16,12,8,0.84);
          }
          .dashboard-section-button[data-active="true"] {
            border-color: rgba(196,148,58,0.42);
            border-bottom-color: rgba(196,148,58,0.18);
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            margin-bottom: 0;
            background:
              radial-gradient(circle at 18% 0%, rgba(196,148,58,0.16), transparent 42%),
              linear-gradient(145deg, rgba(36,25,13,0.92), rgba(13,10,7,0.96));
            color: var(--color-cream);
            box-shadow: 0 22px 58px rgba(0,0,0,0.28), 0 0 0 1px rgba(196,148,58,0.05), inset 0 1px 0 rgba(255,255,255,0.05);
          }
          .dashboard-section-button[data-active="true"]::after {
            content: "";
            position: absolute;
            left: 1px;
            right: 1px;
            bottom: -1px;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(196,148,58,0.20), transparent);
          }
          .section-copy {
            min-width: 0;
            display: grid;
            gap: 7px;
          }
          .section-eyebrow {
            font-family: var(--font-jetbrains);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.13em;
            text-transform: uppercase;
            color: rgba(196,148,58,0.82);
          }
          .section-title-row {
            display: flex;
            align-items: baseline;
            gap: 10px;
            flex-wrap: wrap;
          }
          .section-title {
            font-family: var(--font-playfair);
            font-size: clamp(24px, 3vw, 31px);
            font-weight: 700;
            line-height: 1.02;
            color: var(--color-cream);
            letter-spacing: -0.015em;
          }
          .section-status {
            width: fit-content;
            border-radius: 999px;
            border: 1px solid rgba(196,148,58,0.22);
            background: rgba(196,148,58,0.075);
            padding: 4px 8px 3px;
            font-family: var(--font-jetbrains);
            font-size: 9px;
            font-weight: 800;
            color: var(--color-accent-amber);
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .section-summary {
            max-width: 58ch;
            font-family: var(--font-dm-sans);
            font-size: 13px;
            line-height: 1.55;
            color: rgba(245,237,214,0.56);
          }
          .section-arrow {
            width: 40px;
            height: 40px;
            display: grid;
            place-items: center;
            flex: 0 0 auto;
          }
          .section-chevron-stack {
            position: relative;
            width: 17px;
            height: 18px;
            display: block;
            transform-origin: 50% 50%;
            transition: transform 220ms ease;
          }
          .section-chevron-stack span {
            position: absolute;
            left: 50%;
            width: 12px;
            height: 12px;
            border-right: 2px solid rgba(245,237,214,0.9);
            border-bottom: 2px solid rgba(245,237,214,0.9);
            transform: translateX(-50%) rotate(45deg);
            filter: drop-shadow(0 0 6px rgba(196,148,58,0.18));
          }
          .section-chevron-stack span:nth-child(1) { top: -1px; opacity: 0.42; }
          .section-chevron-stack span:nth-child(2) { top: 5px; opacity: 0.72; }
          .section-chevron-stack span:nth-child(3) { top: 11px; opacity: 1; }
          .dashboard-section-button[data-active="true"] .section-chevron-stack {
            transform: rotate(180deg);
          }
          .dashboard-drawer-shell {
            margin-top: 0;
            margin-bottom: 14px;
            border-radius: 22px;
            box-shadow: 0 18px 52px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.035);
          }
          .dashboard-drawer-shell[data-attached="true"] {
            margin-top: -1px;
            border-top-color: rgba(196,148,58,0.18) !important;
            border-radius: 0 0 22px 22px;
          }
          @media (max-width: 860px) {
            .dashboard-shell { margin-top: -6px; padding-left: 14px; padding-right: 14px; }
            .dashboard-section-button { border-radius: 18px; padding: 15px 14px; gap: 12px; margin-bottom: 12px; }
            .dashboard-section-button[data-active="true"] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; margin-bottom: 0; }
            .dashboard-drawer-shell { border-radius: 18px; margin-bottom: 12px; }
            .dashboard-drawer-shell[data-attached="true"] { border-radius: 0 0 18px 18px; }
            .section-eyebrow { font-size: 9px; }
            .section-title { font-size: 19px; font-family: var(--font-dm-sans); font-weight: 850; letter-spacing: -0.01em; }
            .section-summary { font-size: 12px; line-height: 1.45; }
            .section-arrow { width: 32px; height: 32px; }
            .section-status { font-size: 9px; }
          }
        `}</style>

        <div id="dashboard-workspace" className="dashboard-shell">
          <div className="dashboard-workspace">

          {renderSectionButton("alerts")}

          {activeDashboardSection === "alerts" ? (
          <StepShell
            step="01"
            sectionLabel="Area setup"
            title="Choose your area"
            subtitle="Choose the state first, then refine to the board, city, or store level in the same place. Your current selections stay visible below."
            attached
          >
            {(() => {
              const selectedStates = localPrefs.states;
              const activeState = selectedStates.includes(activeTerritoryState) ? activeTerritoryState : selectedStates[0] || activeTerritoryState;
              const stateLabel = makeStateLabel(activeState);
              const selectedDetails = activeState === "NC"
                ? localPrefs.ncBoards
                : activeState === "VA"
                  ? localPrefs.vaCities
                  : activeState === "OH"
                    ? localPrefs.ohCities
                    : activeState === "PA"
                      ? localPrefs.paCounties
                      : localPrefs.states.includes(activeState) ? ["Statewide coverage"] : [];
              const detailLabel = activeState === "NC" ? "boards" : activeState === "PA" ? "cities / stores" : ["VA", "OH"].includes(activeState) ? "cities" : "coverage";
              const cityOptions = citiesByState[activeState] ?? [];
              const cityPrefs = activeState === "VA" ? localPrefs.vaCities : activeState === "OH" ? localPrefs.ohCities : activeState === "PA" ? localPrefs.paCounties : [];
              const filteredNcBoards = ncBoards.filter((board) => !territorySearch.trim() || board.toLowerCase().includes(territorySearch.toLowerCase()));
              const filteredCities = cityOptions.filter((city) => !territorySearch.trim() || city.toLowerCase().includes(territorySearch.toLowerCase()));

              return (
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      1. Select state
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {SIMPLE_STATE_CODES.map((stateCode) => {
                        const active = selectedStates.includes(stateCode);
                        const focused = activeState === stateCode;
                        return (
                          <button
                            key={stateCode}
                            onClick={() => {
                              const wasActive = localPrefs.states.includes(stateCode);
                              toggleState(stateCode);
                              setTerritorySearch("");
                              setTerritoryDropdown(null);
                              if (!wasActive) setActiveTerritoryState(stateCode);
                              else if (activeState === stateCode) setActiveTerritoryState(localPrefs.states.filter((item) => item !== stateCode)[0] || "NC");
                              else setActiveTerritoryState(stateCode);
                            }}
                            style={{
                              padding: "12px 16px",
                              borderRadius: "999px",
                              border: focused ? "1px solid rgba(196,148,58,0.48)" : active ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)",
                              background: focused ? "linear-gradient(135deg, rgba(196,148,58,0.22), rgba(196,148,58,0.10))" : active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.03)",
                              color: active ? "var(--color-cream)" : "var(--color-text-secondary)",
                              fontFamily: "var(--font-dm-sans)",
                              fontWeight: 700,
                              fontSize: "13px",
                              cursor: "pointer",
                            }}
                            aria-pressed={active}
                          >
                            {active ? "✓ " : ""}{makeStateLabel(stateCode)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedStates.length > 0 ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ borderRadius: "20px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(255,255,255,0.03)", padding: "16px", display: "grid", gap: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              2. Refine {stateLabel}
                            </div>
                            <h3 style={{ margin: "8px 0 0", fontFamily: "var(--font-playfair)", fontSize: "28px", color: "var(--color-cream)" }}>
                              {stateLabel}
                            </h3>
                            <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                              {activeState === "NC"
                                ? "Pick the ABC boards you actually chase. If you leave this blank, alerts use statewide NC intelligence only after you save the state."
                                : ["VA", "OH", "PA"].includes(activeState)
                                  ? "Pick cities first. For states with reliable store-level data, selected cities can be narrowed to specific stores."
                                  : "This market is currently tracked as statewide engine coverage. City/store refinement can be added once a reliable local source is wired in."}
                            </p>
                          </div>
                          <div style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.10)", padding: "8px 12px", fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-cream)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {selectedDetails.length} selected {detailLabel}
                          </div>
                        </div>

                        {["NC", "VA", "OH", "PA"].includes(activeState) ? (
                          <input
                            value={territorySearch}
                            onChange={(event) => setTerritorySearch(event.target.value)}
                            placeholder={activeState === "NC" ? "Search boards like Wake, Mecklenburg, Greensboro…" : "Search cities…"}
                            style={{
                              width: "100%",
                              borderRadius: "14px",
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.035)",
                              color: "var(--color-text-primary)",
                              padding: "12px 14px",
                              fontFamily: "var(--font-dm-sans)",
                              fontSize: "13px",
                              outline: "none",
                            }}
                          />
                        ) : null}

                        {activeState === "NC" ? (
                          <div style={{ maxHeight: "360px", overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "8px" }}>
                            {filteredNcBoards.length > 0 ? filteredNcBoards.map((board) => {
                              const active = localPrefs.ncBoards.includes(board);
                              return (
                                <button key={board} onClick={() => updateStateDetail("NC", board)} style={{ padding: "12px 14px", minHeight: "48px", borderRadius: "14px", border: active ? "1px solid rgba(196,148,58,0.32)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.10)" : "rgba(255,255,255,0.02)", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: "13px" }}>
                                  {active ? "✓ " : ""}{board}
                                </button>
                              );
                            }) : (
                              <div style={{ borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                                No matching North Carolina boards found.
                              </div>
                            )}
                          </div>
                        ) : null}

                        {["VA", "OH", "PA"].includes(activeState) ? (
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ maxHeight: "360px", overflowY: "auto", display: "grid", gap: "8px" }}>
                              {filteredCities.map((city) => {
                                const active = cityPrefs.includes(city);
                                const selectionKey = getStoreSelectionKey(activeState, city);
                                const selection = storeSelections[selectionKey];
                                const cityStores = storesByStateCity.get(selectionKey) ?? [];
                                return (
                                  <div key={city} style={{ borderRadius: "16px", border: active ? "1px solid rgba(196,148,58,0.24)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.07)" : "rgba(255,255,255,0.02)", padding: "10px", display: "grid", gap: "8px" }}>
                                    <button onClick={() => updateStateDetail(activeState, city)} style={{ width: "100%", padding: "10px 12px", borderRadius: "12px", border: "none", background: "transparent", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 700 }}>
                                      {active ? "✓ " : ""}{city}
                                    </button>
                                    {active && cityStores.length > 0 ? (
                                      <div style={{ display: "grid", gap: "8px", padding: "0 4px 4px" }}>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                          <button onClick={() => updateStoreSelectionMode(activeState, city, "all")} style={{ padding: "7px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: selection?.mode !== "custom" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: selection?.mode !== "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer", fontSize: "12px" }}>All stores in {city}</button>
                                          <button onClick={() => updateStoreSelectionMode(activeState, city, "custom")} style={{ padding: "7px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: selection?.mode === "custom" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: selection?.mode === "custom" ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: "pointer", fontSize: "12px" }}>Pick stores</button>
                                        </div>
                                        {selection?.mode === "custom" ? (
                                          <div style={{ display: "grid", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                                            {cityStores.map((store) => {
                                              const storeId = store.id || store.name || city + "-store";
                                              const selected = selection.storeIds.includes(storeId);
                                              return (
                                                <button key={storeId} onClick={() => toggleStore(activeState, city, storeId)} style={{ padding: "10px 12px", borderRadius: "12px", border: selected ? "1px solid rgba(196,148,58,0.28)" : "1px solid rgba(255,255,255,0.08)", background: selected ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.02)", color: selected ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: "12px" }}>
                                                  {selected ? "✓ " : ""}{formatStoreLabel(store)}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {!(["NC", "VA", "OH", "PA"].includes(activeState)) ? (
                          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                            {makeStateLabel(activeState)} is currently one statewide engine coverage area. No city/store selector is shown until a clean local source is wired in.
                          </div>
                        ) : null}
                      </div>

                      <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", padding: "14px", display: "grid", gap: "10px" }}>
                        <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                          Current area selections
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {selectedStates.map((state) => (
                            <button key={state} onClick={() => { setActiveTerritoryState(state); setTerritorySearch(""); }} style={{ border: activeState === state ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)", background: activeState === state ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: "var(--color-cream)", borderRadius: "999px", padding: "8px 10px", cursor: "pointer", fontSize: "12px" }}>
                              {makeStateLabel(state)}
                            </button>
                          ))}
                          {selectedStates.length === 0 ? <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>No states selected yet.</span> : null}
                        </div>
                        {selectedDetails.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {selectedDetails.slice(0, 12).map((item) => (
                              <span key={item} style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", color: "var(--color-text-secondary)", padding: "7px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px" }}>{item}</span>
                            ))}
                            {selectedDetails.length > 12 ? <span style={{ color: "var(--color-text-tertiary)", fontSize: "12px", alignSelf: "center" }}>+{selectedDetails.length - 12} more</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                      Select at least one state to unlock board, city, and store choices.
                    </div>
                  )}
                </div>
              );
            })()}
          </StepShell>
          ) : null}

          {activeDashboardSection === "alerts" ? (
          <StepShell
            step="02"
            title="Choose what to watch"
            subtitle="Start broad with anything notable nearby, or narrow alerts to bottles you pick yourself."
          >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Alert me about
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "12px" }}>
                  {[
                    {
                      value: "anything_notable" as AlertMode,
                      label: "Anything notable in my area",
                      note: "Best when you care about your local board, city, or store. Alerts can fire for allocated, limited, unicorn, shipment, or verified inventory hits nearby.",
                    },
                    {
                      value: "specific_bottles" as AlertMode,
                      label: "Specific bottles I choose",
                      note: "Best when you know exactly what you're chasing. Alerts require a watchlist match in your selected area.",
                    },
                  ].map((option) => {
                    const selected = alertMode === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setAlertMode(option.value)}
                        style={{
                          textAlign: "left",
                          borderRadius: "18px",
                          border: selected ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)",
                          background: selected
                            ? "linear-gradient(180deg, rgba(47,33,18,0.98) 0%, rgba(24,18,12,0.98) 100%)"
                            : "linear-gradient(180deg, rgba(20,16,12,0.92) 0%, rgba(14,11,8,0.92) 100%)",
                          boxShadow: selected ? "inset 0 1px 0 rgba(239,192,80,0.12), 0 0 28px rgba(212,146,11,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
                          padding: "18px",
                          cursor: "pointer",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>{option.label}</span>
                        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{option.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
          </StepShell>
          ) : null}

          {activeDashboardSection === "alerts" ? (
          alertMode === "specific_bottles" ? (
          <StepShell
            step="03"
            title="Bottle watchlist"
            subtitle="Add bottles only when you want alerts limited to specific names in your selected area."
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
          ) : (
            <StepShell step="Bottle watchlist" title="Bottle watchlist" subtitle="Switch alert mode to specific bottles before managing a bottle-only watchlist.">
              <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                Your current alert mode is anything notable nearby. Open Alert mode if you want to limit alerts to specific bottles.
              </div>
            </StepShell>
          )
          ) : null}

          {activeDashboardSection === "alerts" ? (
          <StepShell
            step={alertMode === "specific_bottles" ? "04" : "03"}
            title="Notification preferences"
            subtitle="Choose where Bourbon Signal should send matching alerts, and how loud email should be."
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "grid",
                gridTemplateColumns: "1fr",
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
                            Get email alerts when a signal matches your watchlist.
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
                    Alert setup snapshot
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
                    { label: "Alert type", value: alertMode === "anything_notable" ? "Notable" : "Bottles" },
                    { label: "Watched bottles", value: String(watchedBottleOptions.length) },
                    { label: "Recent matched drops", value: String(watchlistSignals.length) },
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

              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button
                  onClick={handleSaveAlertSetup}
                  disabled={savingLocations}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    border: savedNotifications ? "1px solid rgba(82, 180, 126, 0.45)" : "none",
                    background: savedNotifications ? "rgba(82,180,126,0.15)" : "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: savedNotifications ? "#9AD4B1" : "#0D0B07",
                    fontFamily: "var(--font-dm-sans)",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: savingLocations ? "progress" : "pointer",
                    opacity: savingLocations ? 0.7 : 1,
                  }}
                >
                  {!isSignedIn ? "Sign in to save your alert setup" : savingLocations ? "Saving…" : savedNotifications ? "Saved ✓" : "Save alert setup"}
                </button>
              </div>
            </div>
          </StepShell>
          ) : null}

          {renderSectionButton("collection")}

          {activeDashboardSection === "collection" ? (
          <StepShell
            step="Collection"
            title="My Collection"
            subtitle="Add bottles you own, rate them 0-100, and start building a taste profile. Regular shelf bottles belong here without becoming noisy alert targets."
            hideHeader
            attached
          >
            <div id="my-collection" style={{ display: "grid", gap: "18px" }}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "12px", position: "relative", zIndex: 30 }}>
                  <input
                    value={collectionBottleQuery}
                    onChange={(event) => {
                      setCollectionBottleQuery(event.target.value);
                      if (selectedCollectionBottle && event.target.value !== selectedCollectionBottle.label) setSelectedCollectionBottle(null);
                    }}
                    placeholder="Search a bottle you own..."
                    style={{ width: "100%", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "var(--color-text-primary)", padding: "13px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "14px", outline: "none" }}
                  />
                  {filteredCollectionBottleOptions.length > 0 && collectionBottleQuery.trim() && !selectedCollectionBottle ? (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, display: "grid", gap: "7px", maxHeight: "310px", overflowY: "auto", borderRadius: "16px", border: "1px solid rgba(196,148,58,0.24)", background: "linear-gradient(180deg, rgba(18,14,10,0.98), rgba(9,7,5,0.98))", boxShadow: "0 18px 48px rgba(0,0,0,0.45), 0 0 34px rgba(196,148,58,0.10)", padding: "8px" }}>
                      {filteredCollectionBottleOptions.map((option) => (
                        <button
                          key={option.canonicalKey}
                          type="button"
                          onClick={() => stageCollectionBottle(option)}
                          disabled={savingCollection}
                          style={{ width: "100%", textAlign: "left", padding: "12px 13px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "var(--color-cream)", cursor: savingCollection ? "progress" : "pointer", fontFamily: "var(--font-dm-sans)" }}
                        >
                          <strong>{option.label}</strong>
                          <span style={{ display: "block", marginTop: 4, color: "var(--color-text-tertiary)", fontSize: 12 }}>
                            {option.bottle.distillery} {option.bottle.flavor?.length ? `· ${option.bottle.flavor.slice(0, 3).join(", ")}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : collectionBottleQuery.trim() && !selectedCollectionBottle ? (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(12,9,7,0.98)", boxShadow: "0 18px 42px rgba(0,0,0,0.36)", padding: "14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                      {loadingCollectionSuggestions ? "Searching the broader bourbon catalog…" : "No matching bottle found yet. Try the brand, expression, or a shorter spelling."}
                    </div>
                  ) : null}
                </div>
                {selectedCollectionBottle ? (
                  <div style={{ borderRadius: "14px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.07)", padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Selected bottle</div>
                      <div style={{ marginTop: 4, fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 800, color: "var(--color-cream)" }}>{selectedCollectionBottle.label}</div>
                    </div>
                    <button type="button" onClick={() => { setSelectedCollectionBottle(null); setCollectionBottleQuery(""); }} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: "999px", background: "rgba(255,255,255,0.04)", color: "var(--color-text-secondary)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", cursor: "pointer" }}>Change</button>
                  </div>
                ) : null}
                <div style={{ borderRadius: "18px", border: "1px solid rgba(196,148,58,0.16)", background: "linear-gradient(180deg, rgba(45,31,16,0.42), rgba(255,255,255,0.025))", padding: "15px", display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Taste score</div>
                      <div style={{ marginTop: 5, fontFamily: "var(--font-playfair)", fontSize: "26px", color: "var(--color-cream)" }}>{tasteScoreLabel(collectionRating)}</div>
                      <p style={{ margin: "4px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.55 }}>{tasteScoreDescription(collectionRating)}</p>
                    </div>
                    <div style={{ fontFamily: "var(--font-playfair)", fontSize: "42px", color: "var(--color-accent-amber)", lineHeight: 1 }}>{collectionRating}</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={collectionRating}
                    onChange={(event) => setCollectionRating(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
                  />
                </div>
                <div style={{ display: "grid", gap: "9px" }}>
                  <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Taste cues</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {TASTE_TAG_OPTIONS.map((tag) => {
                      const active = collectionTasteTags.includes(tag);
                      return (
                        <button key={tag} type="button" onClick={() => setCollectionTasteTags((prev) => active ? prev.filter((item) => item !== tag) : [...prev, tag])} style={{ borderRadius: "999px", border: active ? "1px solid rgba(196,148,58,0.42)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.13)" : "rgba(255,255,255,0.03)", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", cursor: "pointer" }}>
                          {active ? "✓ " : ""}{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <textarea
                  value={collectionNotes}
                  onChange={(event) => setCollectionNotes(event.target.value)}
                  placeholder="Optional notes: batch, store pick, why you like it, what you want more/less of..."
                  rows={2}
                  style={{ width: "100%", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "var(--color-text-primary)", padding: "13px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "14px", outline: "none", resize: "vertical" }}
                />

                <button
                  type="button"
                  onClick={saveStagedCollectionBottle}
                  disabled={savingCollection || !selectedCollectionBottle}
                  style={{ border: "1px solid rgba(196,148,58,0.30)", borderRadius: "14px", background: selectedCollectionBottle ? "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)" : "rgba(255,255,255,0.045)", color: selectedCollectionBottle ? "#0D0B07" : "var(--color-text-tertiary)", padding: "13px 16px", fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 800, cursor: savingCollection ? "progress" : selectedCollectionBottle ? "pointer" : "not-allowed", opacity: savingCollection ? 0.75 : 1 }}
                >
                  {savingCollection ? "Saving bottle…" : selectedCollectionBottle ? "Save bottle to collection" : "Select a suggested bottle to save"}
                </button>
              </div>

              {collectionEntries.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {collectionEntries.map((entry) => {
                    const editing = editingCollectionKey === entry.canonicalKey;
                    return (
                      <div key={entry.canonicalKey} style={{ borderRadius: "15px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.028)", padding: "13px 14px", display: "grid", gap: editing ? "10px" : "6px", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
                          <div style={{ minWidth: 0, paddingRight: "44px" }}>
                            <h3 style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-cream)", fontSize: "15px", lineHeight: 1.35, fontWeight: 800 }}>{entry.bottleName}</h3>
                            <div style={{ marginTop: 5, fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                              {tasteScoreLabel(entry.rating)} · {entry.rating}/100
                            </div>
                          </div>
                          <button type="button" onClick={() => setEditingCollectionKey(editing ? null : entry.canonicalKey)} style={{ position: "absolute", right: "10px", bottom: "10px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "999px", background: editing ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.035)", color: editing ? "var(--color-accent-amber)" : "var(--color-text-tertiary)", padding: "6px 9px", fontFamily: "var(--font-dm-sans)", fontSize: "11px", cursor: "pointer" }}>
                            {editing ? "Done" : "Edit"}
                          </button>
                        </div>
                        {editing ? (
                          <div style={{ display: "grid", gap: "9px", paddingRight: "52px" }}>
                            {entry.tasteTags?.length ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {entry.tasteTags.map((tag) => (
                                  <span key={tag} style={{ borderRadius: "999px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "var(--color-text-secondary)", padding: "5px 8px", fontFamily: "var(--font-dm-sans)", fontSize: "11px" }}>{tag}</span>
                                ))}
                              </div>
                            ) : null}
                            {entry.notes ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", fontSize: "12px", lineHeight: 1.55 }}>{entry.notes}</p> : null}
                            <button type="button" onClick={() => removeCollectionBottle(entry.canonicalKey)} style={{ justifySelf: "start", border: "1px solid rgba(215,122,97,0.30)", borderRadius: "999px", background: "rgba(215,122,97,0.08)", color: "#D77A61", padding: "7px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", cursor: "pointer" }}>
                              Delete bottle
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  Your collection is empty. Add a few bottles you own and rate highly; Barrel Proof recommendations will start from those signals.
                </div>
              )}

              {collectionError ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#D77A61" }}>{collectionError}</p> : null}
              {savedCollection ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#9AD4B1" }}>Collection saved.</p> : null}
            </div>
          </StepShell>
          ) : null}

          {renderSectionButton("recommendations")}

          {activeDashboardSection === "recommendations" ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles"
            subtitle="A first pass at matching bottles you rate highly with flavor overlap and recent local sighting context."
            hideHeader
            attached
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ borderRadius: "18px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(196,148,58,0.055)", padding: "16px", display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontFamily: "var(--font-playfair)", color: "var(--color-cream)", fontSize: "24px" }}>Your Bourbon DNA</h3>
                  <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: 1.6 }}>
                    {bourbonDnaSummary.favoriteTags.length
                      ? `${bourbonDnaSummary.favoriteTags.slice(0, 3).join(", ")} profile${bourbonDnaSummary.preferredProofRange ? ` · ${bourbonDnaSummary.preferredProofRange.min}-${bourbonDnaSummary.preferredProofRange.max} proof` : ""}${recommendationMarketSummary.sightedCount ? ` · ${recommendationMarketSummary.sightedCount} with recent signals` : ""}`
                      : "Rate a few bottles and add taste cues to build your recommendation profile."}
                  </p>
                </div>
                {collectionRecommendationInsights.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "10px" }}>
                    {collectionRecommendationInsights.map((insight) => (
                      <div key={insight.option.canonicalKey} style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.12)", padding: "13px", display: "grid", gap: "10px" }}>
                        <div>
                          <strong style={{ fontFamily: "var(--font-dm-sans)", color: "var(--color-cream)", fontSize: "13px" }}>{insight.option.label}</strong>
                          <span style={{ display: "block", marginTop: 4, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-tertiary)", fontSize: "12px", lineHeight: 1.5 }}>{insight.reason}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {typeof insight.option.bottle.proof === "number" ? (
                            <span style={{ borderRadius: "999px", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.035)", color: "var(--color-text-secondary)", padding: "4px 7px", fontFamily: "var(--font-dm-sans)", fontSize: "11px" }}>{insight.option.bottle.proof} proof</span>
                          ) : null}
                          {insight.proofMatchLabel !== "Proof unavailable" ? (
                            <span title={insight.proofMatchExplanation} style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", color: "var(--color-accent-amber)", padding: "4px 7px", fontFamily: "var(--font-dm-sans)", fontSize: "11px" }}>{insight.proofMatchLabel}</span>
                          ) : null}
                          {insight.matchedFlavors.slice(0, 3).map((flavor) => (
                            <span key={flavor} style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", color: "var(--color-accent-amber)", padding: "4px 7px", fontFamily: "var(--font-dm-sans)", fontSize: "11px" }}>{flavor}</span>
                          ))}
                        </div>
                        {insight.recentSightings.length > 0 ? (
                          <div style={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)", padding: "9px", display: "grid", gap: "5px" }}>
                            <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent signals</span>
                            {insight.recentSightings.slice(0, 2).map((sighting) => (
                              <Link key={`${sighting.location}-${sighting.timestamp}`} href={sighting.href} style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.45, textDecoration: "none" }}>
                                {sighting.state ? `${sighting.state} · ` : ""}{sighting.location} {sighting.timestamp ? `· ${formatShortDate(sighting.timestamp)}` : ""}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                        <button onClick={() => trackCollectionSuggestion(insight.option)} style={{ border: "1px solid rgba(196,148,58,0.28)", borderRadius: "999px", background: "rgba(196,148,58,0.12)", color: "var(--color-accent-amber)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Track bottle</button>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {([
                            ["useful", "Useful"],
                            ["not_for_me", "Not for me"],
                            ["already_own", "Already own"],
                          ] as const).map(([signal, label]) => {
                            const status = dnaFeedbackState[`${insight.option.canonicalKey}:${signal}`];
                            return (
                              <button key={signal} type="button" onClick={() => submitDnaFeedback(insight, signal)} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "999px", background: status === "saved" ? "rgba(82,180,126,0.12)" : "rgba(255,255,255,0.025)", color: status === "saved" ? "#9AD4B1" : "var(--color-text-tertiary)", padding: "6px 8px", fontFamily: "var(--font-dm-sans)", fontSize: "11px", cursor: status === "saving" ? "progress" : "pointer" }}>
                                {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: 1.7 }}>
                    Add and rate a few bottles 80+ to unlock lightweight flavor-overlap suggestions. This is the first pass before deeper Bourbon DNA logic.
                  </p>
                )}
              </div>

              {collectionError ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#D77A61" }}>{collectionError}</p> : null}
            </div>
          </StepShell>
          ) : null}

          </div>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
}

