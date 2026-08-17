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
import type { AlertMode, AreaPreferences, UserAlertPreferencePatch, UserAlertPreferences } from "@/app/api/user/preferences/route";
import { canonicalBottleKey, dropMatchesBottle } from "@/lib/bottleIdentity";
import { getDisplayName, isRealDropEvent, type DropEvent } from "@/lib/drops";
import { LiquidToggle } from "@/components/LiquidToggle";
import { NotificationChannelCard } from "@/components/dashboard/NotificationChannelCard";
import { CoverageRequestsCard } from "@/components/dashboard/CoverageRequestsCard";
import SignalPointsPanel from "@/components/SignalPointsPanel";
import {
  getDefaultNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { getPopularBottlePool } from "@/lib/bottleSuggestions";
import { ENGINE_COVERED_STATE_CODES } from "@/lib/statePreferences";
import { getActiveEngineStateAreaLabel, getActiveEngineStateAreaOptions, getActiveEngineStateName } from "@/lib/activeStates";
import { buildUserTasteProfile, createBourbonDnaProfile, scoreBourbonDnaMatch } from "@/lib/bourbon-dna";
import {
  buildRecommendationFeedbackModel,
  rankRecommendationCandidates,
  recommendationReadiness,
  type RecommendationFeedbackEntry,
} from "@/lib/bourbon-recommendations";
import { applyTrackedRecommendation, createSerialFeedbackMutationQueue, shouldApplyFeedbackLoad, shouldRunFeedbackMutation } from "@/lib/recommendation-feedback-client";
import { californiaAreaMatchesFields } from "@/lib/california-area";
import { nevadaAreaMatchesFields, SUPPORTED_NEVADA_AREAS } from "@/lib/nevada-area";
import { newYorkAreaMatchesFields, SUPPORTED_NEW_YORK_AREAS } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields, SUPPORTED_COLORADO_AREAS } from "@/lib/colorado-area";
import {
  CHARLOTTE_METRO_BOARD_GROUP,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
} from "@/lib/demand-metro-areas";
import { NC_ABC_BOARD_OPTIONS, ncAbcBoardPreferencesMatch } from "@/lib/nc-abc-boards";
import { coverageAreaOption } from "@/lib/coverage-location-aliases";

const EMPTY_PREFS: AreaPreferences = {
  states: [],
  ncBoards: [],
  gaAreas: [],
  tnAreas: [],
  vaCities: [],
  ohCities: [],
  iaCities: [],
  idCities: [],
  scAreas: [],
  caAreas: [],
  nvAreas: [],
  nyAreas: [],
  coAreas: [],
  paCounties: [],
  paStores: [],
};

const SIMPLE_STATE_CODES = ENGINE_COVERED_STATE_CODES;
const CITY_REFINABLE_STATE_CODES = new Set<string>(["IA", "ID", "VA", "OH", "PA", "SC", "CA", "NV", "NY", "CO", "GA", "TN"]);
const STORE_REFINABLE_STATE_CODES = new Set<string>(["PA"]);
const SC_ALERT_AREA_SEEDS = [
  "Myrtle Beach",
  "North Myrtle Beach",
  "Conway",
  "Carolina Forest",
  "Surfside Beach",
  "Murrells Inlet",
  "Columbia",
  "Greenville",
  "Mauldin",
  "Simpsonville",
  "Taylors",
  "Landrum",
  "Spartanburg",
  "Charleston",
  "Mount Pleasant",
  "North Charleston",
  "Summerville",
  "Hilton Head Island",
  "Bluffton",
  "Indian Land",
  "Rock Hill",
] as const;

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
  laneLabel: string;
  proofMatchLabel: string;
  proofMatchExplanation: string;
  mashBillMatch?: string;
}

interface BourbonDnaSummary {
  favoriteTags: string[];
  preferredProof?: number;
  preferredProofRange?: { min: number; max: number };
  basedOnCount: number;
  proofBottleCount: number;
  confidence: "early" | "learning" | "strong";
  favoriteMashBills: string[];
  nextLearningPrompt?: string;
  summary: string;
}

type DashboardSection = "alerts" | "collection" | "recommendations";

function countAlertAreas(areaPrefs: AreaPreferences) {
  return areaPrefs.states.reduce((count, state) => {
    const detailCount = state === "NC"
      ? areaPrefs.ncBoards.length
      : state === "GA"
        ? areaPrefs.gaAreas.length
        : state === "TN"
          ? areaPrefs.tnAreas.length
          : state === "VA"
            ? areaPrefs.vaCities.length
            : state === "OH"
              ? areaPrefs.ohCities.length
              : state === "IA"
                ? areaPrefs.iaCities.length
                : state === "ID"
                  ? areaPrefs.idCities.length
                  : state === "SC"
                    ? areaPrefs.scAreas.length
                    : state === "CA"
                      ? areaPrefs.caAreas.length
                      : state === "NV"
                        ? areaPrefs.nvAreas.length
                        : state === "NY"
                          ? areaPrefs.nyAreas.length
                          : state === "CO"
                            ? areaPrefs.coAreas.length
                            : state === "PA"
                              ? areaPrefs.paCounties.length + areaPrefs.paStores.length
                              : 0;
    return count + Math.max(1, detailCount);
  }, 0);
}

interface AlertSetupCardProps {
  marketCount: number;
  trackedBottleCount: number;
  alertMode: AlertMode;
  deliveryChannelCount: number;
  onManageAlerts: () => void;
}

function AlertSetupCard({ marketCount, trackedBottleCount, alertMode, deliveryChannelCount, onManageAlerts }: AlertSetupCardProps) {
  const marketSummary = marketCount ? `${marketCount} market${marketCount === 1 ? "" : "s"}` : "No markets";
  const bottleSummary = alertMode === "anything_notable"
    ? "Anything notable"
    : trackedBottleCount
      ? `${trackedBottleCount} bottle${trackedBottleCount === 1 ? "" : "s"}`
      : "No bottles";
  const deliverySummary = deliveryChannelCount
    ? `${deliveryChannelCount} channel${deliveryChannelCount === 1 ? "" : "s"}`
    : "No delivery";

  return (
    <section className="alert-setup-card" aria-labelledby="alert-setup-title">
      <div className="alert-setup-copy">
        <span className="alert-setup-eyebrow">Alert setup</span>
        <h2 id="alert-setup-title">Your alerts, at a glance</h2>
        <p>Choose the markets, bottles, and delivery channels Bourbon Signal should watch for you.</p>
        <button type="button" className="alert-setup-cta" onClick={onManageAlerts}>Manage alerts</button>
      </div>
      <dl className="alert-setup-summary" aria-label="Current alert setup">
        <div><dt>Markets</dt><dd>{marketSummary}</dd></div>
        <div><dt>Bottles</dt><dd>{bottleSummary}</dd></div>
        <div><dt>Delivery</dt><dd>{deliverySummary}</dd></div>
      </dl>
    </section>
  );
}

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

function formatTasteScore(score: number) {
  return (Math.max(10, Math.min(100, score)) / 10).toFixed(1);
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
  return `/?${params.toString()}#drops`;
}

function dropMatchesAreaPreferences(drop: DropEvent, areaPrefs: AreaPreferences) {
  const state = dropStateLabel(drop);
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;

  const locationFields = [
    drop.locationName,
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ];
  const location = normalizeLocationText(locationFields.filter(Boolean).join(" "));

  if (state === "NC" && areaPrefs.ncBoards.length) {
    const ordinaryBoards = areaPrefs.ncBoards.filter((value) => value !== CHARLOTTE_METRO_BOARD_GROUP);
    return demandMetroBoardGroupMatchesFields(locationFields, areaPrefs.ncBoards)
      || ncAbcBoardPreferencesMatch(locationFields, ordinaryBoards);
  }
  if (state === "GA" && areaPrefs.gaAreas.length) return demandMetroAreaMatchesFields(state, locationFields, areaPrefs.gaAreas);
  if (state === "TN" && areaPrefs.tnAreas.length) return demandMetroAreaMatchesFields(state, locationFields, areaPrefs.tnAreas);
  if (state === "VA" && areaPrefs.vaCities.length) return areaPrefs.vaCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "OH" && areaPrefs.ohCities.length) return areaPrefs.ohCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "IA" && areaPrefs.iaCities.length) return areaPrefs.iaCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "ID" && areaPrefs.idCities.length) return areaPrefs.idCities.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "SC" && areaPrefs.scAreas.length) return areaPrefs.scAreas.some((area) => location.includes(normalizeLocationText(area)));
  if (state === "CA" && areaPrefs.caAreas.length) return californiaAreaMatchesFields([
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ], areaPrefs.caAreas);
  if (state === "NV" && areaPrefs.nvAreas.length) return nevadaAreaMatchesFields([
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ], areaPrefs.nvAreas);
  if (state === "NY") return newYorkAreaMatchesFields([
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ], areaPrefs.nyAreas.length ? areaPrefs.nyAreas : SUPPORTED_NEW_YORK_AREAS);
  if (state === "CO") return coloradoAreaMatchesFields([
    dropLocationLabel(drop),
    drop.board_name,
    drop.store_city,
    drop.store_county,
    drop.store_address,
    drop.store_name,
    ...(drop.stores || []).flatMap((store) => [store.store_address, store.city]),
    ...(drop.store_details || []).flatMap((store) => [store.name, store.city, store.county]),
  ], areaPrefs.coAreas.length ? areaPrefs.coAreas : ["Denver Metro"]);
  if (state === "PA" && areaPrefs.paCounties.length) return areaPrefs.paCounties.some((city) => location.includes(normalizeLocationText(city)));
  if (state === "PA" && areaPrefs.paStores.length) return areaPrefs.paStores.some((storeId) => location.includes(normalizeLocationText(storeId)));
  return true;
}


function makeStateLabel(code: string) {
  return getActiveEngineStateName(code);
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
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 34px",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
        <Navigation />
        <main style={{ minHeight: "72vh", display: "grid", placeItems: "center", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)" }}>
          Loading your dashboard…
        </main>
      </div>
    );
  }

  return <PaidMemberDashboard />;
}

function PaidMemberDashboard() {
  const { bottles, loading } = useBottles();
  const { stores } = useStores();
  const { drops: recentDrops } = useDrops({ limit: 120 });
  const { drops: ncDrops } = useDrops({ limit: 500, state: "NC" });
  const { stats: engineStats } = useStats();
  const { isSignedIn, signIn, entitlements, user } = useAuth();
  const isFreeTier = entitlements.tier === "free";
  const canAccessDashboard = entitlements.canAccessDashboard;
  const canUseAdvancedFilters = entitlements.canUseAdvancedFilters;
  const alertAreaLimit = entitlements.alertAreaLimit;
  const canRefineAlertAreas = alertAreaLimit !== 0 || isFreeTier;
  const canUseCollection = entitlements.canUseCollection;
  const canUseRecommendations = entitlements.canUseRecommendations;
  const canReceiveSightingsAlerts = entitlements.canReceiveSightingsAlerts;
  const feedbackUserId = isSignedIn ? user?.id || null : null;
  const { prefs, loading: prefsLoading, savePreferences } = useAreaPreferences();
  const needsHomeStateActivation = isFreeTier && isSignedIn && !prefsLoading && !prefs.memberProfile?.homeState;
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();


  const [mounted, setMounted] = useState(false);
  const [bottleQuery, setBottleQuery] = useState("");
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>(EMPTY_PREFS);
  const [savingLocations, setSavingLocations] = useState(false);
  const [savedLocations, setSavedLocations] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [alertMode, setAlertMode] = useState<AlertMode>("anything_notable");
  const [savedNotifications, setSavedNotifications] = useState(false);
  const [collapsedStates, setCollapsedStates] = useState<Record<string, boolean>>({});
  const [storeSelections, setStoreSelections] = useState<Record<string, StoreSelectionState>>({});
  const [loadedSignedOutDefaults, setLoadedSignedOutDefaults] = useState(false);

  const [territoryDropdown, setTerritoryDropdown] = useState<TerritoryDropdownState | null>(null);
  const [territorySearch, setTerritorySearch] = useState("");
  const [activeTerritoryState, setActiveTerritoryState] = useState<string>("NC");
  const [activeDashboardSection, setActiveDashboardSection] = useState<DashboardSection | null>(() => {
    if (typeof window === "undefined") return null;
    const section = new URLSearchParams(window.location.search).get("section");
    return section === "alerts" || section === "collection" || section === "recommendations" ? section : null;
  });
  const [preparedDashboardSections, setPreparedDashboardSections] = useState<Set<DashboardSection>>(new Set(["alerts"]));
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
  const [collectionSyncPending, setCollectionSyncPending] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [manualCollectionBottleReady, setManualCollectionBottleReady] = useState(false);
  const [collectionRatingDrafts, setCollectionRatingDrafts] = useState<Record<string, number>>({});
  const [editingCollectionKey, setEditingCollectionKey] = useState<string | null>(null);
  const [dnaFeedbackState, setDnaFeedbackState] = useState<Record<string, string>>({});
  const [dnaFeedbackEntries, setDnaFeedbackEntries] = useState<RecommendationFeedbackEntry[]>([]);
  const [dnaFeedbackOwnerId, setDnaFeedbackOwnerId] = useState<string | null>(null);
  const [dnaFeedbackStatus, setDnaFeedbackStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dnaFeedbackError, setDnaFeedbackError] = useState<string | null>(null);
  const [resettingDnaFeedback, setResettingDnaFeedback] = useState(false);
  const dnaFeedbackRequestVersionRef = useRef(0);
  const dnaFeedbackMutationVersionRef = useRef(0);
  const dnaFeedbackMutationQueueRef = useRef(createSerialFeedbackMutationQueue());
  const activeFeedbackUserIdRef = useRef<string | null>(feedbackUserId);
  activeFeedbackUserIdRef.current = feedbackUserId;
  const [recommendationVisibleCount, setRecommendationVisibleCount] = useState(4);

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

  const collectionEntries = prefs.collectionPreferences?.bottles ?? [];
  const collectionKeys = useMemo(() => new Set(collectionEntries.map((entry) => entry.canonicalKey)), [collectionEntries]);
  const shouldPrepareCollection = preparedDashboardSections.has("collection") || preparedDashboardSections.has("recommendations");
  const shouldPrepareRecommendations = preparedDashboardSections.has("recommendations");
  const shouldPrepareWatchlistSearch = activeDashboardSection === "alerts" && alertMode === "specific_bottles";
  const shouldPrepareBottleCatalog = shouldPrepareCollection || shouldPrepareWatchlistSearch;

  useEffect(() => {
    if (activeDashboardSection === "recommendations") setRecommendationVisibleCount(4);
  }, [activeDashboardSection]);

  useEffect(() => {
    dnaFeedbackRequestVersionRef.current += 1;
    dnaFeedbackMutationVersionRef.current = 0;
    dnaFeedbackMutationQueueRef.current = createSerialFeedbackMutationQueue();
    setDnaFeedbackEntries([]);
    setDnaFeedbackState({});
    setDnaFeedbackOwnerId(feedbackUserId);
    setDnaFeedbackStatus("idle");
    setDnaFeedbackError(null);
    setResettingDnaFeedback(false);
  }, [feedbackUserId]);

  useEffect(() => {
    if (!feedbackUserId || !canUseRecommendations || activeDashboardSection !== "recommendations") return;
    const requestedUserId = feedbackUserId;
    const requestVersion = ++dnaFeedbackRequestVersionRef.current;
    const mutationVersionAtStart = dnaFeedbackMutationVersionRef.current;
    let cancelled = false;
    setDnaFeedbackStatus("loading");
    setDnaFeedbackError(null);

    void fetch("/api/bourbon-dna/feedback")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not load recommendation feedback.");
        return payload;
      })
      .then((payload) => {
        if (cancelled || !shouldApplyFeedbackLoad({
          requestedUserId,
          activeUserId: activeFeedbackUserIdRef.current,
          requestVersion,
          currentRequestVersion: dnaFeedbackRequestVersionRef.current,
          mutationVersionAtStart,
          currentMutationVersion: dnaFeedbackMutationVersionRef.current,
        })) return;
        const entries = Array.isArray(payload.bourbonDnaFeedback?.entries) ? payload.bourbonDnaFeedback.entries : [];
        setDnaFeedbackEntries(entries);
        setDnaFeedbackOwnerId(requestedUserId);
        setDnaFeedbackStatus("ready");
      })
      .catch((error) => {
        if (cancelled || !shouldApplyFeedbackLoad({
          requestedUserId,
          activeUserId: activeFeedbackUserIdRef.current,
          requestVersion,
          currentRequestVersion: dnaFeedbackRequestVersionRef.current,
          mutationVersionAtStart,
          currentMutationVersion: dnaFeedbackMutationVersionRef.current,
        })) return;
        setDnaFeedbackEntries([]);
        setDnaFeedbackOwnerId(requestedUserId);
        setDnaFeedbackStatus("error");
        setDnaFeedbackError(error instanceof Error ? error.message : "Could not load recommendation feedback.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeDashboardSection, canUseRecommendations, feedbackUserId]);

  useEffect(() => {
    if (!shouldPrepareBottleCatalog || broadBottleCatalog.length > 0) return;
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
  }, [broadBottleCatalog.length, shouldPrepareBottleCatalog]);

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
    if (!shouldPrepareBottleCatalog) return [];
    return broadBottleCatalog.slice(0, 900).map((suggestion) => {
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
  }, [broadBottleCatalog, shouldPrepareBottleCatalog]);

  const alertBottleLibraryOptions = useMemo<BottleOption[]>(() => {
    const merged = new Map<string, BottleOption>();
    for (const option of bottleOptions) merged.set(option.canonicalKey, option);
    for (const option of broadCatalogBottleOptions) {
      if (!merged.has(option.canonicalKey)) merged.set(option.canonicalKey, option);
    }
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [bottleOptions, broadCatalogBottleOptions]);

  const watchedBottleOptions = useMemo(() => {
    if (!mounted) return [];
    return alertBottleLibraryOptions.filter((option) =>
      option.bottleIds.some((id) => watchedBottles.includes(id))
    );
  }, [alertBottleLibraryOptions, watchedBottles, mounted]);

  const selectedCanonicalKeys = useMemo(
    () => new Set(watchedBottleOptions.map((option) => option.canonicalKey)),
    [watchedBottleOptions]
  );

  const filteredBottleOptions = useMemo(() => {
    const query = bottleQuery.trim().toLowerCase();
    return alertBottleLibraryOptions.filter((option) => {
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
  }, [alertBottleLibraryOptions, bottleQuery, selectedCanonicalKeys]);

  const filteredCollectionBottleOptions = useMemo(() => {
    if (!shouldPrepareCollection) return [];
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
  }, [bibleSuggestionOptions, bottleOptions, collectionBottleQuery, collectionKeys, shouldPrepareCollection]);

  const collectionTasteProfile = useMemo(() => {
    if (!shouldPrepareCollection) return buildUserTasteProfile([]);
    const bottleLookup = new Map<string, BottleOption>();
    for (const option of broadCatalogBottleOptions) bottleLookup.set(option.canonicalKey, option);
    for (const option of bottleOptions) bottleLookup.set(option.canonicalKey, option);
    return buildUserTasteProfile(collectionEntries.map((entry) => {
      const option = bottleLookup.get(entry.canonicalKey);
      return {
        canonicalKey: entry.canonicalKey,
        bottleName: entry.bottleName,
        rating: entry.rating,
        tasteTags: entry.tasteTags,
        proof: option?.bottle.proof,
        wouldBuyAgain: entry.wouldBuyAgain,
        inferredProfile: option ? createBourbonDnaProfile({
          name: option.bottle.canonical_name || option.bottle.name,
          brand: option.bottle.distillery,
          proof: option.bottle.proof,
          aliases: [...(option.bottle.aliases || []), ...(option.bottle.search_aliases || [])],
          userTags: option.bottle.flavor,
        }) : undefined,
      };
    }));
  }, [bottleOptions, broadCatalogBottleOptions, collectionEntries, shouldPrepareCollection]);

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
      confidence: collectionTasteProfile.confidence,
      favoriteMashBills: collectionTasteProfile.favoriteMashBills,
      nextLearningPrompt: collectionTasteProfile.nextLearningPrompt,
      summary: collectionTasteProfile.favoriteTags.length
        ? `Your Bourbon DNA currently leans toward ${tagText}. Your strongest proof signal is ${proofText}${collectionTasteProfile.favoriteMashBills[0] ? `, with ${collectionTasteProfile.favoriteMashBills[0]} emerging as a mash-bill pattern` : ""}.`
        : "Rate a few bottles 80+ and Bourbon DNA will infer flavor, proof, and mash-bill patterns quietly in the background.",
    };
  }, [collectionEntries, collectionTasteProfile]);

  const recommendationFeedbackModel = useMemo(
    () => buildRecommendationFeedbackModel(dnaFeedbackEntries),
    [dnaFeedbackEntries],
  );
  const recommendationQuickStart = useMemo(
    () => recommendationReadiness(collectionEntries.filter((entry) => entry.rating > 0).length),
    [collectionEntries],
  );

  const collectionRecommendationInsights = useMemo<RecommendedBottleInsight[]>(() => {
    if (!shouldPrepareRecommendations) return [];
    if (!feedbackUserId || dnaFeedbackOwnerId !== feedbackUserId || dnaFeedbackStatus !== "ready") return [];
    const ownedKeys = new Set(collectionEntries.map((entry) => entry.canonicalKey));
    const recommendationOptionsMap = new Map<string, BottleOption>();
    for (const option of broadCatalogBottleOptions) recommendationOptionsMap.set(option.canonicalKey, option);
    for (const option of bottleOptions) recommendationOptionsMap.set(option.canonicalKey, option);
    const recommendationOptions = Array.from(recommendationOptionsMap.values());

    if (!collectionTasteProfile.favoriteTags.length) return [];
    const rawItems = recommendationOptions
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
        const matchedDrops = recentDrops
          .filter((drop) => isRealDropEvent(drop))
          .filter((drop) => dropMatchesBottle(drop, option.bottle))
          .filter((drop) => dropMatchesAreaPreferences(drop, localPrefs))
          .slice(0, 3);
        const recentSightings = matchedDrops.map((drop) => {
          const state = dropStateLabel(drop);
          return {
            location: dropLocationLabel(drop),
            state,
            timestamp: drop.timestamp || drop.observed_at || drop.event_at || drop.first_seen_at || "",
            href: finderSignalHref(option.label, state),
          };
        });
        return {
          option,
          dnaProfile,
          matchedFlavors: dnaMatch.matchedTags,
          dnaScore: dnaMatch.score + (option.bottle.tier === "allocated" ? 0.6 : 0),
          dnaReason: dnaMatch.explanation,
          proofMatchLabel: dnaMatch.proofMatch.label,
          proofMatchExplanation: dnaMatch.proofMatch.explanation,
          mashBillMatch: dnaMatch.mashBillMatch,
          recentSightings,
          recentSignals: matchedDrops.map((drop) => ({
            timestamp: drop.timestamp || drop.observed_at || drop.event_at || drop.first_seen_at || undefined,
            exactStore: drop.exact_store === true || drop.confidence_tier === "exact_store",
            alertGrade: drop.can_alert_as_inventory === true || drop.canAlertAsWatch === true,
          })),
        };
      })
      .filter((item) => item.dnaScore > 0 && (item.matchedFlavors.length > 0 || item.proofMatchLabel !== "Proof unavailable"));

    const itemByKey = new Map(rawItems.map((item) => [item.option.canonicalKey, item]));
    const ranked = rankRecommendationCandidates(rawItems.map((item) => ({
      canonicalKey: item.option.canonicalKey,
      bottleName: item.option.label,
      producer: item.option.bottle.distillery,
      baseScore: item.dnaScore,
      matchedTags: item.matchedFlavors,
      profileConfidence: item.dnaProfile.confidence,
      profileMethod: item.dnaProfile.method,
      fallbackOnly: item.dnaProfile.tags.length === 1 && item.dnaProfile.tags[0] === "Balanced" && item.dnaProfile.signals.includes("fallback balanced profile"),
      mashBillFamily: item.dnaProfile.mashBillFamily,
      recentSignals: item.recentSignals,
    })), recommendationFeedbackModel, { limit: 12 });

    return ranked.flatMap((recommendation) => {
      const item = itemByKey.get(recommendation.canonicalKey);
      if (!item) return [];
      return [{
        option: item.option,
        score: recommendation.adjustedScore,
        matchedFlavors: item.matchedFlavors,
        recentSightings: item.recentSightings,
        proofMatchLabel: item.proofMatchLabel,
        proofMatchExplanation: item.proofMatchExplanation,
        mashBillMatch: item.mashBillMatch,
        laneLabel: recommendation.laneLabel,
        reason: recommendation.marketScore > 0
          ? `${item.dnaReason} Fresh signal nearby.`
          : item.dnaReason,
      }];
    });
  }, [bottleOptions, broadCatalogBottleOptions, collectionEntries, collectionTasteProfile, dnaFeedbackOwnerId, dnaFeedbackStatus, feedbackUserId, localPrefs, recentDrops, recommendationFeedbackModel, selectedCanonicalKeys, shouldPrepareRecommendations]);

  const suggestedBottleOptions = useMemo(() => {
    const pool = getPopularBottlePool(alertBottleLibraryOptions.map((option) => option.bottle)).slice(0, 5);
    const ids = new Set(pool.map((bottle) => bottle.id));
    return alertBottleLibraryOptions.filter((option) => ids.has(option.bottle.id) && !selectedCanonicalKeys.has(option.canonicalKey));
  }, [alertBottleLibraryOptions, selectedCanonicalKeys]);

  useEffect(() => {
    if (!mounted || !isSignedIn || alertBottleLibraryOptions.length === 0) return;
    const savedNames = prefs.bottleAlertPreferences.bottleNames.map(normalizePreferenceBottleKey).filter(Boolean);
    const savedKeys = prefs.bottleAlertPreferences.bottleKeys.map(normalizePreferenceBottleKey).filter(Boolean);
    const savedSignature = [...savedNames, ...savedKeys].sort().join("|");
    if (!savedSignature || hydratedBottlePrefsKeyRef.current === savedSignature) return;

    const savedSet = new Set([...savedNames, ...savedKeys]);
    const matchingOptions = alertBottleLibraryOptions.filter((option) => {
      const optionKeys = [option.canonicalKey, option.label, option.bottle.name, ...(option.bottle.search_aliases || [])]
        .filter(Boolean)
        .map((value) => normalizePreferenceBottleKey(String(value)));
      return optionKeys.some((key) => savedSet.has(key));
    });

    matchingOptions.forEach((option) => option.bottleIds.forEach((id) => addBottle(id)));
    hydratedBottlePrefsKeyRef.current = savedSignature;
  }, [addBottle, alertBottleLibraryOptions, isSignedIn, mounted, prefs.bottleAlertPreferences.bottleKeys, prefs.bottleAlertPreferences.bottleNames]);

  const ncBoards = useMemo(() => [
    CHARLOTTE_METRO_BOARD_GROUP,
    ...NC_ABC_BOARD_OPTIONS,
  ].sort(), []);

  const citiesByState = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const state of ["IA", "ID", "VA", "OH", "PA", "SC"] as const) {
      const cityNames = stores.flatMap((store) => {
        if (store.state !== state || !store.city || !isSelectableStoreLocation(store)) return [];
        return [titleCase(store.city)];
      });
      grouped[state] = Array.from(new Set(state === "SC" ? [...SC_ALERT_AREA_SEEDS, ...cityNames] : cityNames)).sort();
    }
    return grouped;
  }, [stores]);

  const storesByStateCity = useMemo(() => {
    const grouped = new Map<string, typeof stores>();
    for (const store of stores) {
      if (!isSelectableStoreLocation(store)) continue;
      if (["IA", "ID", "VA", "OH"].includes(store.state) && store.city) {
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
      stateCode: "GA",
      label: "Georgia",
      detailLabel: "areas",
      summary: "Atlanta Metro uses exact reviewed city and exact-store identities.",
      selectedCount: localPrefs.gaAreas.length,
      totalCount: getActiveEngineStateAreaOptions("GA").length,
    },
    {
      stateCode: "TN",
      label: "Tennessee",
      detailLabel: "areas",
      summary: "Nashville Metro uses exact first-party store identities and current orderability evidence.",
      selectedCount: localPrefs.tnAreas.length,
      totalCount: getActiveEngineStateAreaOptions("TN").length,
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
      stateCode: "IA",
      label: "Iowa",
      detailLabel: "cities",
      summary: "Iowa ABD store-delivery data is available by city.",
      selectedCount: localPrefs.iaCities.length,
      totalCount: citiesByState.IA?.length ?? 0,
    },
    {
      stateCode: "ID",
      label: "Idaho",
      detailLabel: "cities",
      summary: "Idaho Liquor store availability status is available by city with store/as-of details.",
      selectedCount: localPrefs.idCities.length,
      totalCount: citiesByState.ID?.length ?? 0,
    },
    {
      stateCode: "PA",
      label: "Pennsylvania",
      detailLabel: "cities",
      summary: "FWGS pickup inventory is now available by store. Start with the cities you actually hunt.",
      selectedCount: localPrefs.paCounties.length,
      totalCount: citiesByState.PA?.length ?? 0,
    },
    {
      stateCode: "SC",
      label: "South Carolina",
      detailLabel: "areas",
      summary: "South Carolina retailer coverage can be refined by city or Grand Strand area.",
      selectedCount: localPrefs.scAreas.length,
      totalCount: citiesByState.SC?.length ?? 0,
    },
    {
      stateCode: "CA",
      label: "California",
      detailLabel: "areas",
      summary: "California alerts currently focus on verified San Diego store pickup availability.",
      selectedCount: localPrefs.caAreas.length,
      totalCount: citiesByState.CA?.length ?? 0,
    },
    {
      stateCode: "NV",
      label: "Nevada",
      detailLabel: "areas",
      summary: "Nevada alerts cover verified store availability in Las Vegas Valley and Reno–Sparks.",
      selectedCount: localPrefs.nvAreas.length,
      totalCount: SUPPORTED_NEVADA_AREAS.length,
    },
    {
      stateCode: "NY",
      label: "New York",
      detailLabel: "areas",
      summary: "New York alerts cover verified retailer inventory in New York City and at reviewed Nassau County stores.",
      selectedCount: localPrefs.nyAreas.length,
      totalCount: SUPPORTED_NEW_YORK_AREAS.length,
    },
    {
      stateCode: "CO",
      label: "Colorado",
      detailLabel: "areas",
      summary: "Colorado alerts currently cover verified Denver Metro retailer inventory only.",
      selectedCount: localPrefs.coAreas.length,
      totalCount: SUPPORTED_COLORADO_AREAS.length,
    },
  ]), [citiesByState, localPrefs.caAreas.length, localPrefs.coAreas.length, localPrefs.gaAreas.length, localPrefs.nvAreas.length, localPrefs.nyAreas.length, localPrefs.tnAreas.length, localPrefs.iaCities.length, localPrefs.idCities.length, localPrefs.ncBoards.length, localPrefs.ohCities.length, localPrefs.paCounties.length, localPrefs.scAreas.length, localPrefs.vaCities.length, ncBoards.length]);

  const addBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => addBottle(id));
    setBottleQuery("");
  };

  const removeBottleOption = (option: BottleOption) => {
    option.bottleIds.forEach((id) => removeBottle(id));
  };
  const alertAreaCount = (areaPrefs: AreaPreferences) => countAlertAreas(areaPrefs);

  const canAddAlertArea = (areaPrefs: AreaPreferences) => {
    if (isFreeTier) return true;
    return typeof alertAreaLimit !== "number" || alertAreaCount(areaPrefs) < alertAreaLimit;
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
    const nextPrefs = {
      collectionPreferences: {
        bottles: entries,
      },
    };
    try {
      const result = await savePreferences(nextPrefs);
      if (result?.status === "conflict") {
        setCollectionSyncPending(true);
        setSavedCollection(false);
        setCollectionError("Your collection changed on another device. Review this version and save again.");
        return false;
      }
      const pending = result?.status === "pending";
      setCollectionSyncPending(pending);
      setSavedCollection(true);
      if (!pending) setTimeout(() => setSavedCollection(false), 1600);
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
    if (selectedCollectionBottle) {
      await addCollectionBottle(selectedCollectionBottle);
      return;
    }
    if (manualCollectionBottleReady && collectionBottleQuery.trim().length >= 2) {
      await addManualCollectionBottle();
      return;
    }
    setCollectionError("Choose a suggested bottle or use this as a new bottle.");
  };


  const addManualCollectionBottle = async () => {
    const rawName = collectionBottleQuery.trim().replace(/\s+/g, " ");
    if (rawName.length < 2) return;
    if (!isSignedIn) {
      signIn();
      return;
    }
    setSavingCollection(true);
    setCollectionError(null);
    try {
      const res = await fetch("/api/bottle-contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawName,
          source: "collection",
          context: { rating: collectionRating, tasteTags: collectionTasteTags, notes: collectionNotes.trim() },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add that bottle yet.");
      const now = new Date().toISOString();
      const canonicalKey = `pending:${rawName.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()}`;
      const nextEntries = [
        ...collectionEntries.filter((entry) => entry.canonicalKey !== canonicalKey),
        {
          bottleId: data.contribution?.id || canonicalKey,
          bottleName: rawName,
          canonicalKey,
          rating: collectionRating,
          tasteTags: collectionTasteTags,
          wouldBuyAgain: collectionRating >= 80,
          notes: collectionNotes.trim(),
          pendingCanonicalMatch: true,
          bottleContributionId: data.contribution?.id,
          addedAt: now,
          updatedAt: now,
        },
      ].sort((a, b) => b.rating - a.rating || a.bottleName.localeCompare(b.bottleName));
      const saved = await saveCollectionEntries(nextEntries);
      if (saved) {
        setSelectedCollectionBottle(null);
        setManualCollectionBottleReady(false);
        setCollectionBottleQuery("");
        setCollectionRating(85);
        setCollectionTasteTags([]);
        setCollectionNotes("");
      }
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Could not add that bottle yet.");
    } finally {
      setSavingCollection(false);
    }
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

  const trackCollectionSuggestion = async (insight: RecommendedBottleInsight) => {
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (prefsLoading) {
      setCollectionError("Loading your saved preferences. Try again in a second.");
      return;
    }
    const option = insight.option;
    const newlyAddedIds = option.bottleIds.filter((id) => !watchedBottles.includes(id));
    const previousAlertMode = alertMode;
    setCollectionError(null);
    try {
      await applyTrackedRecommendation({
        optimisticallyTrack: () => {
          addBottleOption(option);
          setAlertMode("specific_bottles");
        },
        persistTracking: async () => {
          await savePreferences({
            alertMode: "specific_bottles",
            bottleAlertPreferences: {
              bottleNames: Array.from(new Set([...watchedBottleOptions.map((watched) => watched.label), option.label])),
              bottleKeys: Array.from(new Set([...Array.from(selectedCanonicalKeys), option.canonicalKey])),
            },
          });
        },
        rollbackTracking: () => {
          newlyAddedIds.forEach((id) => removeBottle(id));
          setAlertMode(previousAlertMode);
        },
        writePositiveFeedback: async () => {
          await submitDnaFeedback(insight, "saved");
        },
      });
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Could not track that suggestion yet.");
    }
  };

  const submitDnaFeedback = async (insight: RecommendedBottleInsight, signal: "useful" | "not_for_me" | "already_own" | "saved") => {
    const requestedUserId = feedbackUserId;
    if (!requestedUserId) {
      signIn();
      return false;
    }
    if (activeFeedbackUserIdRef.current !== requestedUserId) return false;
    const stateKey = `${insight.option.canonicalKey}:${signal}`;
    dnaFeedbackMutationVersionRef.current += 1;
    setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "saving" }));
    setCollectionError(null);
    return dnaFeedbackMutationQueueRef.current(async () => {
      if (!shouldRunFeedbackMutation(requestedUserId, activeFeedbackUserIdRef.current)) return false;
      try {
        const response = await fetch("/api/bourbon-dna/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bottleId: insight.option.bottle.canonical_id || insight.option.bottle.id,
            bottleName: insight.option.label,
            canonicalKey: insight.option.canonicalKey,
            signal,
            matchedTags: insight.matchedFlavors,
            score: insight.score,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not save DNA feedback.");
        if (activeFeedbackUserIdRef.current === requestedUserId) {
          const entries = Array.isArray(payload.bourbonDnaFeedback?.entries) ? payload.bourbonDnaFeedback.entries : [];
          setDnaFeedbackEntries(entries);
          setDnaFeedbackOwnerId(requestedUserId);
          setDnaFeedbackStatus("ready");
          setDnaFeedbackError(null);
          setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "saved" }));
        }
        return true;
      } catch (error) {
        if (activeFeedbackUserIdRef.current === requestedUserId) {
          setDnaFeedbackState((prev) => ({ ...prev, [stateKey]: "error" }));
          setCollectionError(error instanceof Error ? error.message : "Could not save DNA feedback.");
        }
        return false;
      }
    });
  };

  const resetDnaFeedback = async () => {
    const requestedUserId = feedbackUserId;
    if (!requestedUserId) {
      signIn();
      return;
    }
    dnaFeedbackMutationVersionRef.current += 1;
    setResettingDnaFeedback(true);
    setCollectionError(null);
    await dnaFeedbackMutationQueueRef.current(async () => {
      if (!shouldRunFeedbackMutation(requestedUserId, activeFeedbackUserIdRef.current)) return;
      try {
        const response = await fetch("/api/bourbon-dna/feedback", { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not reset hidden bottles.");
        if (activeFeedbackUserIdRef.current === requestedUserId) {
          setDnaFeedbackEntries([]);
          setDnaFeedbackState({});
          setDnaFeedbackOwnerId(requestedUserId);
          setDnaFeedbackStatus("ready");
          setDnaFeedbackError(null);
        }
      } catch (error) {
        if (activeFeedbackUserIdRef.current === requestedUserId) {
          setCollectionError(error instanceof Error ? error.message : "Could not reset hidden bottles.");
        }
      } finally {
        if (activeFeedbackUserIdRef.current === requestedUserId) setResettingDnaFeedback(false);
      }
    });
  };

  const toggleState = (state: string) => {
    setLocalPrefs((prev) => {
      const removing = prev.states.includes(state);
      if (!removing && !canAddAlertArea(prev)) return prev;
      if (isFreeTier && !removing) {
        return {
          ...prev,
          states: [state],
          ncBoards: state === "NC" ? prev.ncBoards : [],
          gaAreas: state === "GA" ? prev.gaAreas : [],
          tnAreas: state === "TN" ? prev.tnAreas : [],
          vaCities: state === "VA" ? prev.vaCities : [],
          ohCities: state === "OH" ? prev.ohCities : [],
          iaCities: state === "IA" ? prev.iaCities : [],
          idCities: state === "ID" ? prev.idCities : [],
          scAreas: state === "SC" ? prev.scAreas : [],
          caAreas: state === "CA" ? prev.caAreas : [],
          nvAreas: state === "NV" ? prev.nvAreas : [],
          nyAreas: state === "NY" ? prev.nyAreas : [],
          coAreas: state === "CO" ? prev.coAreas : [],
          paCounties: state === "PA" ? prev.paCounties : [],
          paStores: state === "PA" ? prev.paStores : [],
        };
      }
      return {
        ...prev,
        states: removing ? prev.states.filter((item) => item !== state) : [...prev.states, state],
        ncBoards: state === "NC" && removing ? [] : prev.ncBoards,
        gaAreas: state === "GA" && removing ? [] : prev.gaAreas,
        tnAreas: state === "TN" && removing ? [] : prev.tnAreas,
        vaCities: state === "VA" && removing ? [] : prev.vaCities,
        ohCities: state === "OH" && removing ? [] : prev.ohCities,
        iaCities: state === "IA" && removing ? [] : prev.iaCities,
        idCities: state === "ID" && removing ? [] : prev.idCities,
        scAreas: state === "SC" && removing ? [] : prev.scAreas,
        caAreas: state === "CA" && removing ? [] : prev.caAreas,
        nvAreas: state === "NV" && removing ? [] : prev.nvAreas,
        nyAreas: state === "NY" && removing ? [] : prev.nyAreas,
        coAreas: state === "CO" && removing ? [] : prev.coAreas,
        paCounties: state === "PA" && removing ? [] : prev.paCounties,
        paStores: state === "PA" && removing ? [] : prev.paStores,
      };
    });
  };

  const updateStateDetail = (state: string, value: string) => {
    setLocalPrefs((prev) => {
      if (state === "NC") {
        const has = prev.ncBoards.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          ncBoards: has ? prev.ncBoards.filter((item) => item !== value) : [...prev.ncBoards, value],
        };
      }
      if (state === "GA") {
        const has = prev.gaAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          gaAreas: has ? prev.gaAreas.filter((item) => item !== value) : [...prev.gaAreas, value],
        };
      }
      if (state === "TN") {
        const has = prev.tnAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          tnAreas: has ? prev.tnAreas.filter((item) => item !== value) : [...prev.tnAreas, value],
        };
      }
      if (state === "VA") {
        const has = prev.vaCities.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          vaCities: has ? prev.vaCities.filter((item) => item !== value) : [...prev.vaCities, value],
        };
      }
      if (state === "OH") {
        const has = prev.ohCities.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          ohCities: has ? prev.ohCities.filter((item) => item !== value) : [...prev.ohCities, value],
        };
      }
      if (state === "IA") {
        const has = prev.iaCities.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          iaCities: has ? prev.iaCities.filter((item) => item !== value) : [...prev.iaCities, value],
        };
      }
      if (state === "ID") {
        const has = prev.idCities.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          idCities: has ? prev.idCities.filter((item) => item !== value) : [...prev.idCities, value],
        };
      }
      if (state === "SC") {
        const has = prev.scAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          scAreas: has ? prev.scAreas.filter((item) => item !== value) : [...prev.scAreas, value],
        };
      }
      if (state === "CA") {
        const has = prev.caAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          caAreas: has ? prev.caAreas.filter((item) => item !== value) : [...prev.caAreas, value],
        };
      }
      if (state === "NV") {
        const has = prev.nvAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          nvAreas: has ? prev.nvAreas.filter((item) => item !== value) : [...prev.nvAreas, value],
        };
      }
      if (state === "NY") {
        const has = prev.nyAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          nyAreas: has ? prev.nyAreas.filter((item) => item !== value) : [...prev.nyAreas, value],
        };
      }
      if (state === "CO") {
        const has = prev.coAreas.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
        return {
          ...prev,
          coAreas: has ? prev.coAreas.filter((item) => item !== value) : [...prev.coAreas, value],
        };
      }
      if (state === "PA") {
        const has = prev.paCounties.includes(value);
        if (!has && !canAddAlertArea(prev)) return prev;
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
    const currentStoreSelection = storeSelections[selectionKey] ?? { mode: "custom" as const, storeIds: [] };
    if (!currentStoreSelection.storeIds.includes(storeId) && !canAddAlertArea(localPrefs)) return;
    setStoreSelections((prev) => {
      const current = prev[selectionKey] ?? { mode: "custom" as const, storeIds: [] };
      const has = current.storeIds.includes(storeId);
      const nextStoreIds = has
        ? current.storeIds.filter((id) => id !== storeId)
        : [...current.storeIds, storeId];
      if (state === "PA") {
        setLocalPrefs((prefs) => {
          if (!has && !canAddAlertArea(prefs)) return prefs;
          return {
            ...prefs,
            paStores: has
              ? prefs.paStores.filter((id) => id !== storeId)
              : Array.from(new Set([...prefs.paStores, storeId])),
          };
        });
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
    if (typeof alertAreaLimit === "number" && alertAreaCount(localPrefs) > alertAreaLimit) {
      setCollectionError(`Standard Proof includes up to ${alertAreaLimit} alert areas. Remove one area before saving.`);
      return;
    }
    if (!isSignedIn) {
      signIn();
      return;
    }
    if (entitlements.tier === "free") {
      window.location.href = "/pricing";
      return;
    }
    setSavingLocations(true);
    setCollectionError(null);
    const nextPrefs: UserAlertPreferencePatch = {
      areaPreferences: localPrefs,
      notificationPreferences: {
        onSite: notificationPrefs.onSite,
        email: notificationPrefs.email,
        sms: notificationPrefs.sms,
        sightings: notificationPrefs.sightings,
      },
      alertMode,
      bottleAlertPreferences: {
        bottleNames: watchedBottleOptions.map((option) => option.label),
        bottleKeys: Array.from(selectedCanonicalKeys),
      },
    };
    void savePreferences(nextPrefs)
      .then(() => {
        setSavedLocations(true);
        setSavedNotifications(true);
        setTimeout(() => setSavedLocations(false), 1600);
        setTimeout(() => setSavedNotifications(false), 1600);
      })
      .catch((error) => {
        setCollectionError(error instanceof Error ? error.message : "Could not save alert setup yet.");
        setSavedLocations(false);
        setSavedNotifications(false);
      })
      .finally(() => setSavingLocations(false));
  };

  const alertDeliveryChannelCount = useMemo(() => [
    notificationPrefs.onSite.enabled,
    notificationPrefs.email.enabled,
    notificationPrefs.sms.enabled,
    notificationPrefs.sightings?.enabled,
  ].filter(Boolean).length, [notificationPrefs]);

  const dashboardSections = useMemo<Array<{ key: DashboardSection; label: string; eyebrow: string; summary: string; status: string | null }>>(() => ([
    { key: "alerts", label: "Alerts", eyebrow: "Alert setup", summary: "Choose what Bourbon Signal should notify you about.", status: localPrefs.states.length ? `${localPrefs.states.length} markets` : "Not set" },
    { key: "collection", label: "My Collection", eyebrow: "Taste profile", summary: "Keep track of bottles you own or have tasted, ratings, tasting cues, and notes.", status: canUseCollection ? (prefsLoading ? "Loading" : `${collectionEntries.length} saved`) : "Demo" },
    { key: "recommendations", label: "Recommended Bottles", eyebrow: "Bourbon DNA", summary: "See bottle ideas shaped by your collection and local signal context.", status: canUseRecommendations ? (!collectionEntries.length ? "Needs ratings" : preparedDashboardSections.has("recommendations") && collectionRecommendationInsights.length ? `${collectionRecommendationInsights.length} ideas` : "Ready") : "Demo" },
  ]), [canUseCollection, canUseRecommendations, collectionEntries.length, collectionRecommendationInsights.length, localPrefs.states.length, prefsLoading, preparedDashboardSections]);

  const prepareDashboardSection = (section: DashboardSection) => {
    if (section === "alerts") return;
    setPreparedDashboardSections((current) => {
      if (current.has(section)) return current;
      const next = new Set(current);
      next.add(section);
      return next;
    });
  };

  const openDashboardSection = (section: DashboardSection) => {
    prepareDashboardSection(section);
    setActiveDashboardSection(section);
    window.setTimeout(() => {
      const sectionButton = document.getElementById(`dashboard-section-${section}`);
      sectionButton?.scrollIntoView({ behavior: "smooth", block: "start" });
      sectionButton?.focus({ preventScroll: true });
    }, 40);
  };

  const toggleDashboardSection = (section: DashboardSection) => {
    setActiveDashboardSection((current) => {
      const next = current === section ? null : section;
      if (next) prepareDashboardSection(next);
      return next;
    });
  };

  const renderSectionButton = (sectionKey: DashboardSection) => {
    const section = dashboardSections.find((item) => item.key === sectionKey);
    if (!section) return null;
    const active = activeDashboardSection === sectionKey;
    return (
      <button id={`dashboard-section-${section.key}`} key={`section-${section.key}`} type="button" className="dashboard-section-button" data-active={active} onClick={() => toggleDashboardSection(section.key)}>
        <span className="section-copy">
          <span className="section-eyebrow">{section.eyebrow}</span>
          <span className="section-title-row">
            <span className="section-title">{section.label}</span>
            {section.status ? <span className="section-status">{section.status}</span> : null}
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

  if (!canAccessDashboard) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
        <Navigation />
        <main style={{ minHeight: "78vh", padding: "132px 18px 80px" }}>
          <div style={{ width: "min(720px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
            <section style={{ border: "1px solid rgba(196,148,58,0.22)", borderRadius: 28, padding: "32px", background: "linear-gradient(180deg, rgba(24,18,12,0.92), rgba(11,8,6,0.96))", textAlign: "center", boxShadow: "0 24px 70px rgba(0,0,0,0.34)" }}>
              <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-amber)", marginBottom: 12 }}>Upgrade required</div>
              <h1 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "clamp(38px, 7vw, 58px)", color: "var(--color-cream)", lineHeight: 1 }}>Dashboard starts with Standard Proof.</h1>
              <p style={{ margin: "18px auto 0", maxWidth: 540, fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>Free access gets a limited Drop Feed and 3 Bottle Checks. Upgrade for alert setup, member sightings, and dashboard tools.</p>
              <a href="/pricing" style={{ display: "inline-flex", marginTop: 22, borderRadius: 999, padding: "12px 18px", background: "linear-gradient(135deg, #C4943A, #E8C97A)", color: "#0D0B07", fontFamily: "var(--font-dm-sans)", fontWeight: 800, textDecoration: "none" }}>View memberships</a>
            </section>
            {isSignedIn ? <CoverageRequestsCard emptyMode="compact" /> : null}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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
                {isFreeTier
                  ? "Explore the real member workspace. Free access includes 7 recent signals, 3 Bottle Checks, and Member Sightings; upgrade when you want saved alerts, the full feed, and advanced hunting tools."
                  : "Set your alerts, rate bottles you own or have tasted, and get recommendations based on what you like."}
              </p>
            </ScrollReveal>
            {isFreeTier ? (
              <ScrollReveal delay={180}>
                <Link href={needsHomeStateActivation ? "/welcome" : "/pricing?source=dashboard"} className="dashboard-hero-upgrade">
                  {needsHomeStateActivation ? "See signals near you" : "Upgrade membership"}
                </Link>
              </ScrollReveal>
            ) : null}
          </div>
        </section>

        <style>{`
          .dashboard-shell {
            max-width: 820px;
            margin: 0 auto;
            padding: 0 clamp(16px, 5vw, 36px) 82px;
          }
          .personal-signal-stat {
            min-width: 0;
            padding: 8px 14px;
            border-left: 1px solid var(--boundary-subtle);
          }
          .personal-signal-stat:first-child {
            border-left: 0;
            padding-left: 2px;
          }
          .dashboard-hero-upgrade {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            margin-top: 18px;
            border: 1px solid rgba(232,201,122,0.44);
            border-radius: 999px;
            padding: 11px 17px;
            color: #100c08;
            background: linear-gradient(135deg, rgba(196,148,58,0.98), rgba(232,201,122,0.94));
            box-shadow: 0 12px 34px rgba(196,148,58,0.2), 0 0 28px rgba(232,201,122,0.08);
            font-family: var(--font-dm-sans);
            font-size: 13px;
            font-weight: 900;
            text-decoration: none;
            transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
          }
          .dashboard-hero-upgrade:hover,
          .dashboard-hero-upgrade:focus-visible {
            transform: translateY(-1px);
            filter: brightness(1.05);
            box-shadow: 0 16px 40px rgba(196,148,58,0.28), 0 0 34px rgba(232,201,122,0.12);
            outline: none;
          }
          .dashboard-workspace {
            display: grid;
            gap: 0;
            min-width: 0;
          }

          .alert-setup-card {
            position: relative;
            overflow: hidden;
            margin-bottom: 12px;
            border: 1px solid rgba(196,148,58,0.16);
            border-radius: var(--radius-feature);
            background: radial-gradient(circle at 82% 10%, rgba(196,148,58,0.12), transparent 42%), linear-gradient(145deg, rgba(24,17,11,0.96), rgba(8,7,5,0.98));
            box-shadow: 0 24px 64px rgba(0,0,0,0.26), inset 0 1px 0 rgba(245,237,214,0.04);
            padding: clamp(20px, 3.2vw, 28px);
            display: grid;
            grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
            align-items: center;
            gap: clamp(22px, 4vw, 44px);
          }
          .alert-setup-copy { display: grid; justify-items: start; gap: 10px; min-width: 0; }
          .alert-setup-eyebrow { font-family: var(--font-jetbrains); font-size: 10px; font-weight: 850; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(232,201,122,0.78); }
          .alert-setup-copy h2 { margin: 0; font-family: var(--font-playfair); font-size: clamp(30px, 4vw, 44px); line-height: 0.98; letter-spacing: -0.025em; color: var(--color-cream); }
          .alert-setup-copy p { max-width: 48ch; margin: 0; font-family: var(--font-dm-sans); font-size: 14px; line-height: 1.6; color: rgba(245,237,214,0.62); }
          .alert-setup-cta { min-height: 42px; margin-top: 3px; border: 1px solid rgba(232,201,122,0.42); border-radius: 999px; background: linear-gradient(135deg, rgba(196,148,58,0.95), rgba(232,201,122,0.92)); color: #100c08; padding: 11px 16px; font-family: var(--font-dm-sans); font-size: 13px; font-weight: 900; cursor: pointer; box-shadow: 0 12px 30px rgba(196,148,58,0.16), inset 0 1px 0 rgba(255,255,255,0.22); transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease; }
          .alert-setup-cta:hover,
          .alert-setup-cta:focus-visible { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 16px 38px rgba(196,148,58,0.22), inset 0 1px 0 rgba(255,255,255,0.26); outline: none; }
          .alert-setup-summary { display: grid; gap: 0; margin: 0; }
          .alert-setup-summary div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--boundary-subtle); padding: 12px 2px; }
          .alert-setup-summary div:last-child { border-bottom: 0; }
          .alert-setup-summary dt { font-family: var(--font-jetbrains); font-size: 9px; font-weight: 850; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(245,237,214,0.44); }
          .alert-setup-summary dd { margin: 0; font-family: var(--font-dm-sans); font-size: 13px; font-weight: 800; color: var(--color-cream); text-align: right; }

          .dashboard-section-button {
            width: 100%;
            min-width: 0;
            appearance: none;
            border: 0;
            border-bottom: 1px solid var(--boundary-subtle);
            border-radius: 0;
            background: transparent;
            color: var(--color-text-secondary);
            padding: 18px 18px 17px;
            text-align: left;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            box-shadow: none;
            margin-bottom: 0;
            position: relative;
            z-index: 2;
            transition: border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease, border-radius 180ms ease, margin-bottom 180ms ease;
          }
          .dashboard-section-button:hover {
            transform: translateY(-1px);
            border-bottom-color: var(--boundary-accent);
            background: var(--surface-soft);
          }
          .dashboard-section-button[data-active="true"] {
            border-bottom-color: var(--boundary-accent);
            border-radius: var(--radius-feature) var(--radius-feature) 0 0;
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
            background: rgba(196,148,58,0.11);
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
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
            overflow: hidden;
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
          .dashboard-loading-panel {
            min-height: 132px;
            display: grid;
            place-content: center;
            gap: 8px;
            text-align: center;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.07);
            background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.018));
            padding: 22px;
            contain: content;
          }
          .dashboard-loading-panel strong {
            font-family: var(--font-dm-sans);
            font-size: 14px;
            color: var(--color-cream);
          }
          .dashboard-loading-panel span {
            max-width: 42ch;
            font-family: var(--font-dm-sans);
            font-size: 12px;
            line-height: 1.55;
            color: var(--color-text-tertiary);
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
            .alert-setup-card { grid-template-columns: 1fr; border-radius: 22px; padding: 18px 16px; gap: 16px; }
            .alert-setup-copy h2 { font-size: 30px; }
            .alert-setup-copy p { font-size: 13px; line-height: 1.5; }
            .alert-setup-cta { width: 100%; }
            .alert-setup-summary div { padding: 10px 2px; }
          }
        `}</style>

        <div id="dashboard-workspace" className="dashboard-shell">
          <div className="dashboard-workspace">

          <AlertSetupCard
            marketCount={localPrefs.states.length}
            trackedBottleCount={watchedBottleOptions.length}
            alertMode={alertMode}
            deliveryChannelCount={alertDeliveryChannelCount}
            onManageAlerts={() => openDashboardSection("alerts")}
          />
          <div className="personal-signal-brief" aria-label="Personal signal brief" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", margin: "12px 0 18px" }}>
            {[{ label: "Saved markets", value: localPrefs.states.length ? `${localPrefs.states.length}` : "0" }, { label: "Tracked bottles", value: watchedBottleOptions.length ? `${watchedBottleOptions.length}` : "0" }, { label: "Recent matching drops", value: watchlistSignals.length ? `${watchlistSignals.length}` : "0" }].map((item) => (
              <div key={item.label} className="personal-signal-stat">
                <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,237,214,0.48)" }}>{item.label}</div>
                <strong style={{ display: "block", marginTop: "5px", fontFamily: "var(--font-playfair)", color: "var(--color-cream)", fontSize: "22px" }}>{item.value}</strong>
              </div>
            ))}
          </div>

          <section id="signal-points" style={{ margin: "0 0 18px" }}>
            <SignalPointsPanel preview />
          </section>

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
              const customerAreaLabel = getActiveEngineStateAreaLabel(activeState);
              const selectedDetails = activeState === "NC"
                ? localPrefs.ncBoards
                : activeState === "GA"
                  ? localPrefs.gaAreas
                  : activeState === "TN"
                    ? localPrefs.tnAreas
                : activeState === "IA"
                  ? localPrefs.iaCities
                  : activeState === "ID"
                    ? localPrefs.idCities
                    : activeState === "VA"
                    ? localPrefs.vaCities
                    : activeState === "OH"
                      ? localPrefs.ohCities
                      : activeState === "SC"
                        ? localPrefs.scAreas
                        : activeState === "CA"
                          ? localPrefs.caAreas
                          : activeState === "NV"
                            ? localPrefs.nvAreas
                            : activeState === "NY"
                              ? localPrefs.nyAreas
                              : activeState === "CO"
                                ? localPrefs.coAreas
                                : activeState === "PA"
                                  ? localPrefs.paCounties
                                  : customerAreaLabel
                                    ? [customerAreaLabel]
                                    : localPrefs.states.includes(activeState) ? ["Statewide coverage"] : [];
              const isCityRefinable = CITY_REFINABLE_STATE_CODES.has(activeState);
              const isStoreRefinable = STORE_REFINABLE_STATE_CODES.has(activeState);
              const detailLabel = activeState === "NC" ? "boards" : ["CA", "NV", "NY", "CO", "GA", "TN"].includes(activeState) ? "areas" : isStoreRefinable ? "cities / stores" : isCityRefinable ? "cities" : customerAreaLabel ? "areas" : "coverage";
              const cityOptions = activeState === "NV"
                ? [...SUPPORTED_NEVADA_AREAS]
                : activeState === "NY"
                  ? [...SUPPORTED_NEW_YORK_AREAS]
                  : activeState === "CO"
                    ? [...SUPPORTED_COLORADO_AREAS]
                    : activeState === "GA" || activeState === "TN"
                      ? getActiveEngineStateAreaOptions(activeState)
                    : citiesByState[activeState] ?? [];
              const cityPrefs = activeState === "GA" ? localPrefs.gaAreas : activeState === "TN" ? localPrefs.tnAreas : activeState === "IA" ? localPrefs.iaCities : activeState === "ID" ? localPrefs.idCities : activeState === "VA" ? localPrefs.vaCities : activeState === "OH" ? localPrefs.ohCities : activeState === "SC" ? localPrefs.scAreas : activeState === "CA" ? localPrefs.caAreas : activeState === "NV" ? localPrefs.nvAreas : activeState === "NY" ? localPrefs.nyAreas : activeState === "CO" ? localPrefs.coAreas : activeState === "PA" ? localPrefs.paCounties : [];
              const filteredNcBoards = ncBoards.filter((board) => !territorySearch.trim() || board.toLowerCase().includes(territorySearch.toLowerCase()));
              const filteredCities = cityOptions
                .map((city) => coverageAreaOption(activeState, city))
                .filter((option) => !territorySearch.trim() || option.searchText.toLowerCase().includes(territorySearch.toLowerCase()));

              return (
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      Select state
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
                    canRefineAlertAreas ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ borderRadius: "20px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(255,255,255,0.03)", padding: "16px", display: "grid", gap: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              Refine {stateLabel}
                            </div>
                            <h3 style={{ margin: "8px 0 0", fontFamily: "var(--font-playfair)", fontSize: "28px", color: "var(--color-cream)" }}>
                              {stateLabel}
                            </h3>
                            <p style={{ margin: "6px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                              {activeState === "NC"
                                ? "Pick the ABC boards you actually chase. If you leave this blank, alerts use statewide NC intelligence only after you save the state."
                                : isCityRefinable
                                  ? activeState === "NY"
                                    ? "New York coverage is limited to New York City and reviewed Nassau County stores. Select the areas you want; this does not imply statewide New York coverage."
                                    : activeState === "CO"
                                      ? "Colorado coverage is limited to Denver Metro: Denver, Lakeside, Westminster, and Greenwood Village. It does not imply statewide Colorado coverage."
                                      : activeState === "GA"
                                        ? "Atlanta Metro is an exact reviewed grouping. Select it to scope alerts without implying statewide Georgia coverage."
                                        : activeState === "TN"
                                          ? "Nashville Metro is an exact reviewed grouping. Current alerts still require qualified first-party store orderability evidence."
                                      : activeState === "IA"
                                    ? "Pick Iowa cities from ABD store-delivery data. Leave cities blank to keep statewide Iowa coverage."
                                    : activeState === "ID"
                                      ? "Pick Idaho cities from official Idaho Liquor store availability status. Store rows include as-of dates and should be verified before driving."
                                      : "Pick cities first. Store-level narrowing is available where Bourbon Signal has durable store identifiers."
                                  : customerAreaLabel
                                    ? `${stateLabel} coverage currently starts with ${customerAreaLabel}. We’ll add more areas as durable public data supports them.`
                                    : "This market is currently tracked as statewide engine coverage. City/store refinement can be added once a reliable local source is wired in."}
                            </p>
                          </div>
                          <div style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.10)", padding: "8px 12px", fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-cream)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {isFreeTier ? "Free access" : canUseAdvancedFilters || typeof alertAreaLimit !== "number" ? selectedDetails.length : `${alertAreaCount(localPrefs)}/${alertAreaLimit}`} selected {detailLabel}
                          </div>
                        </div>

                        {(activeState === "NC" || isCityRefinable) ? (
                          <input
                            value={territorySearch}
                            onChange={(event) => setTerritorySearch(event.target.value)}
                            placeholder={activeState === "NC" ? "Search boards like Wake, Mecklenburg, Greensboro…" : ["GA", "TN"].includes(activeState) ? "Search metro areas…" : "Search cities…"}
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

                        {isCityRefinable ? (
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ maxHeight: "360px", overflowY: "auto", display: "grid", gap: "8px" }}>
                              {filteredCities.map((areaOption) => {
                                const city = areaOption.value;
                                const active = cityPrefs.includes(city);
                                const selectionKey = getStoreSelectionKey(activeState, city);
                                const selection = storeSelections[selectionKey];
                                const cityStores = storesByStateCity.get(selectionKey) ?? [];
                                return (
                                  <div key={city} style={{ borderRadius: "16px", border: active ? "1px solid rgba(196,148,58,0.24)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(196,148,58,0.07)" : "rgba(255,255,255,0.02)", padding: "10px", display: "grid", gap: "8px" }}>
                                    <button onClick={() => updateStateDetail(activeState, city)} style={{ width: "100%", padding: "10px 12px", borderRadius: "12px", border: "none", background: "transparent", color: active ? "var(--color-cream)" : "var(--color-text-secondary)", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: "13px", fontWeight: 700 }}>
                                      {active ? "✓ " : ""}{areaOption.label}
                                    </button>
                                    {active && isStoreRefinable && cityStores.length > 0 ? (
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

                        {!(activeState === "NC" || isCityRefinable) ? (
                          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                            {customerAreaLabel
                              ? `${makeStateLabel(activeState)} currently includes ${customerAreaLabel}. No narrower city/store selector is shown until a clean per-store source is wired in.`
                              : `${makeStateLabel(activeState)} is currently one statewide engine coverage area. No city/store selector is shown until a clean local source is wired in.`}
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
                              <span key={item} style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", color: "var(--color-text-secondary)", padding: "7px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px" }}>{coverageAreaOption(activeState, item).label}</span>
                            ))}
                            {selectedDetails.length > 12 ? <span style={{ color: "var(--color-text-tertiary)", fontSize: "12px", alignSelf: "center" }}>+{selectedDetails.length - 12} more</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    ) : (
                    <div style={{ borderRadius: "18px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(196,148,58,0.055)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                      Upgrade to use alert setup. Standard Proof includes up to 5 specific alert areas; Barrel Proof removes the limit.
                    </div>
                    )
                  ) : (
                    <div style={{ borderRadius: "18px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                      Select one state to see board, city, and store choices.
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
            sectionLabel="Watchlist"
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
            step="02"
            sectionLabel="Watchlist"
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
                    minWidth: 0,
                    boxSizing: "border-box",
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: "12px", width: "100%", maxWidth: "100%", minWidth: 0 }}>
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
                <div style={{ display: "grid", gap: "10px", width: "100%", maxWidth: "100%", minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Popular right now
                  </div>
                  {suggestedBottleOptions.map((option) => (
                    <button
                      key={`suggested-${option.canonicalKey}`}
                      onClick={() => addBottleOption(option)}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(196,148,58,0.24)",
                        background: "linear-gradient(180deg, rgba(55,39,21,0.66) 0%, rgba(22,18,14,0.94) 100%)",
                        boxShadow: "0 0 22px rgba(196,148,58,0.10)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0, overflowWrap: "anywhere", fontFamily: "var(--font-playfair)", fontSize: "20px", color: "var(--color-cream)", lineHeight: 1.15 }}>{option.label}</div>
                      <div style={{ marginTop: "4px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)" }}>{option.bottle.distillery}</div>
                    </button>
                  ))}
                </div>
              ) : null}

              {bottleQuery.trim() ? (
                <div style={{ display: "grid", gap: "10px", width: "100%", maxWidth: "100%", minWidth: 0 }}>
                  {filteredBottleOptions.slice(0, 10).map((option) => (
                  <button
                    key={option.canonicalKey}
                    onClick={() => addBottleOption(option)}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      textAlign: "left",
                      padding: "16px 18px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0, overflowWrap: "anywhere", fontFamily: "var(--font-playfair)", fontSize: "22px", color: "var(--color-cream)", lineHeight: 1.15 }}>{option.label}</div>
                    <div style={{ marginTop: "6px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)" }}>{option.bottle.distillery}</div>
                  </button>
                  ))}
                </div>
              ) : null}
            </div>
          </StepShell>
          ) : null
          ) : null}

          {activeDashboardSection === "alerts" ? (
          <StepShell
            step="03"
            sectionLabel="Delivery Preferences"
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
                  const smsActive = notificationPrefs.sms.enabled;
                  const sightingsActive = notificationPrefs.sightings?.enabled === true;

                  return (
                    <>
                      <NotificationChannelCard
                        title="On-site alerts"
                        description="See matching alerts in your Bourbon Signal inbox from anywhere on the site."
                        checked={onSiteActive}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs((prev) => ({
                            ...prev,
                            onSite: { enabled: checked },
                          }))
                        }
                      />

                      <NotificationChannelCard
                        title="Email alerts"
                        description="Get email alerts when a signal matches your watchlist."
                        checked={emailActive}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs((prev) => ({
                            ...prev,
                            email: { ...prev.email, enabled: checked },
                          }))
                        }
                      />

                      <div style={{ width: "100%", borderRadius: "18px", border: smsActive ? "1px solid rgba(196,148,58,0.34)" : "1px solid rgba(255,255,255,0.08)", background: smsActive ? "linear-gradient(180deg, rgba(47,33,18,0.98) 0%, rgba(24,18,12,0.98) 100%)" : "linear-gradient(180deg, rgba(20,16,12,0.92) 0%, rgba(14,11,8,0.92) 100%)", boxShadow: smsActive ? "inset 0 1px 0 rgba(239,192,80,0.12), 0 0 28px rgba(212,146,11,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.03)", padding: "18px", display: "grid", gap: "12px", position: "relative", overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, flex: 1 }}>
                            <span style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", color: "var(--color-cream)" }}>SMS alerts</span>
                            <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, maxWidth: "38ch" }}>
                              Text alerts for high-priority bottle matches. {entitlements.canReceiveSmsAlerts ? `${entitlements.smsDailyLimit}/day cap during rollout.` : "Upgrade to activate SMS delivery."}
                            </span>
                          </div>
                          <LiquidToggle
                            checked={smsActive}
                            onCheckedChange={(checked) => setNotificationPrefs((prev) => ({ ...prev, sms: { ...prev.sms, enabled: checked && entitlements.canReceiveSmsAlerts } }))}
                          />
                        </div>
                        <div style={{ display: "grid", gap: "8px" }}>
                          <label htmlFor="sms-phone" style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Phone number</label>
                          <input
                            id="sms-phone"
                            value={notificationPrefs.sms.phone || ""}
                            onChange={(event) => setNotificationPrefs((prev) => ({ ...prev, sms: { ...prev.sms, phone: event.target.value, verified: false } }))}
                            placeholder="(555) 123-4567"
                            inputMode="tel"
                            disabled={!entitlements.canReceiveSmsAlerts}
                            style={{ width: "100%", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "var(--color-text-primary)", padding: "12px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", outline: "none", opacity: entitlements.canReceiveSmsAlerts ? 1 : 0.55 }}
                          />
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                            {[{ value: "major_only", label: "Major only" }, { value: "specific_bottles", label: "Watchlist only" }].map((option) => (
                              <button key={option.value} type="button" onClick={() => setNotificationPrefs((prev) => ({ ...prev, sms: { ...prev.sms, mode: option.value as typeof prev.sms.mode } }))} disabled={!entitlements.canReceiveSmsAlerts} style={{ padding: "7px 10px", borderRadius: "999px", border: notificationPrefs.sms.mode === option.value ? "1px solid rgba(196,148,58,0.32)" : "1px solid rgba(255,255,255,0.08)", background: notificationPrefs.sms.mode === option.value ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: notificationPrefs.sms.mode === option.value ? "var(--color-cream)" : "var(--color-text-secondary)", cursor: entitlements.canReceiveSmsAlerts ? "pointer" : "not-allowed", fontSize: "12px" }}>{option.label}</button>
                            ))}
                            <span style={{ color: notificationPrefs.sms.verified ? "#9AD4B1" : "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)", fontSize: "12px" }}>{notificationPrefs.sms.verified ? "Verified" : entitlements.canReceiveSmsAlerts ? "Verification will be required before live SMS sends." : "SMS unlocks with Standard Proof."}</span>
                          </div>
                        </div>
                      </div>

                      {canReceiveSightingsAlerts ? (
                        <NotificationChannelCard
                          title="Member Sighting alerts"
                          description="Get notified when member-submitted sightings match your watchlist and markets. Included with Barrel Proof and Bottled in Bond."
                          checked={sightingsActive}
                          onCheckedChange={(checked) =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              sightings: { enabled: checked },
                            }))
                          }
                        />
                      ) : null}


                    </>
                  );
                })()}
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
                  {!isSignedIn ? "Sign in to save your alert setup" : isFreeTier ? "Upgrade to save alerts" : savingLocations ? "Saving…" : savedNotifications ? "Saved ✓" : "Save alert setup"}
                </button>
              </div>
            </div>
          </StepShell>
          ) : null}

          {renderSectionButton("collection")}

          {activeDashboardSection === "collection" && !canUseCollection ? (
          <StepShell
            step="Collection"
            title="My Collection demo"
            subtitle="Free access can view this surface. Upgrade to save bottles you own or have tasted, ratings, notes, and taste cues."
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Upgrade to use My Collection</strong>
              <span>Free accounts can view this demo, but saving bottles and ratings starts with Barrel Proof or Bottled in Bond.</span>
              <a href="/pricing" style={{ justifySelf: "center", marginTop: 4, borderRadius: 999, padding: "10px 14px", background: "linear-gradient(135deg, #C4943A, #E8C97A)", color: "#0D0B07", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>Upgrade to use</a>
            </div>
          </StepShell>
          ) : activeDashboardSection === "collection" && canUseCollection && !preparedDashboardSections.has("collection") ? (
          <StepShell
            step="Collection"
            title="My Collection"
            subtitle="Loading your saved bottles…"
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Loading your collection</strong>
              <span>We’re pulling your saved bottles and taste profile without blocking the dashboard.</span>
            </div>
          </StepShell>
          ) : activeDashboardSection === "collection" && canUseCollection ? (
          <StepShell
            step="Collection"
            title="My Collection"
            subtitle="Add bottles you own or have tasted, rate them 1.0-10.0, and start building a taste profile. Regular shelf bottles belong here without becoming noisy alert targets."
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
                      setManualCollectionBottleReady(false);
                      if (selectedCollectionBottle && event.target.value !== selectedCollectionBottle.label) setSelectedCollectionBottle(null);
                    }}
                    placeholder="Search a bottle you own or have tasted..."
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
                      <button
                        type="button"
                        onClick={() => { setSelectedCollectionBottle(null); setManualCollectionBottleReady(true); setCollectionError(null); setCollectionBibleSuggestions([]); }}
                        disabled={savingCollection}
                        style={{ width: "100%", textAlign: "left", padding: "12px 13px", borderRadius: "12px", border: "1px solid rgba(196,148,58,0.30)", background: "rgba(196,148,58,0.10)", color: "var(--color-cream)", cursor: savingCollection ? "progress" : "pointer", fontFamily: "var(--font-dm-sans)" }}
                      >
                        <strong>Can’t find it? Add “{collectionBottleQuery.trim()}”</strong>
                        <span style={{ display: "block", marginTop: 4, color: "var(--color-accent-amber)", fontSize: 12 }}>Save now and we’ll match it to an official bottle record later.</span>
                      </button>
                    </div>
                  ) : collectionBottleQuery.trim() && !selectedCollectionBottle ? (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, borderRadius: "14px", border: "1px solid rgba(196,148,58,0.20)", background: "rgba(12,9,7,0.98)", boxShadow: "0 18px 42px rgba(0,0,0,0.36)", padding: "14px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", display: "grid", gap: "10px" }}>
                      <span>{loadingCollectionSuggestions ? "Searching the broader bourbon catalog…" : "No matching bottle found yet. Save it now and we’ll match it to an official bottle record later."}</span>
                      {!loadingCollectionSuggestions ? <button type="button" onClick={() => { setManualCollectionBottleReady(true); setCollectionError(null); }} style={{ justifySelf: "start", border: "1px solid rgba(196,148,58,0.32)", borderRadius: "999px", background: "rgba(196,148,58,0.12)", color: "var(--color-cream)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 850, cursor: "pointer" }}>Use “{collectionBottleQuery.trim()}” as a new bottle</button> : null}
                    </div>
                  ) : null}
                </div>
                {manualCollectionBottleReady && !selectedCollectionBottle ? (
                  <div style={{ borderRadius: "14px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.07)", padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "var(--color-accent-amber)", letterSpacing: "0.1em", textTransform: "uppercase" }}>New bottle ready</div>
                      <div style={{ marginTop: 4, fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 800, color: "var(--color-cream)" }}>{collectionBottleQuery.trim()}</div>
                      <div style={{ marginTop: 3, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)" }}>Saved to your collection now; Bourbon Signal will match it to an official record later.</div>
                    </div>
                    <button type="button" onClick={() => setManualCollectionBottleReady(false)} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: "999px", background: "rgba(255,255,255,0.04)", color: "var(--color-text-secondary)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", cursor: "pointer" }}>Change</button>
                  </div>
                ) : null}
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
                    <div style={{ fontFamily: "var(--font-playfair)", fontSize: "42px", color: "var(--color-accent-amber)", lineHeight: 1 }}>{formatTasteScore(collectionRating)}</div>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={1}
                    value={collectionRating}
                    onChange={(event) => setCollectionRating(Math.max(10, Math.min(100, Number(event.target.value) || 10)))}
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
                  disabled={savingCollection || (!selectedCollectionBottle && !manualCollectionBottleReady)}
                  style={{ border: "1px solid rgba(196,148,58,0.30)", borderRadius: "14px", background: (selectedCollectionBottle || manualCollectionBottleReady) ? "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)" : "rgba(255,255,255,0.045)", color: (selectedCollectionBottle || manualCollectionBottleReady) ? "#0D0B07" : "var(--color-text-tertiary)", padding: "13px 16px", fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 800, cursor: savingCollection ? "progress" : (selectedCollectionBottle || manualCollectionBottleReady) ? "pointer" : "not-allowed", opacity: savingCollection ? 0.75 : 1 }}
                >
                  {savingCollection ? "Saving bottle…" : selectedCollectionBottle ? "Save bottle to collection" : manualCollectionBottleReady ? "Save new bottle to collection" : "Select or add a bottle to save"}
                </button>
                <p style={{ margin: "-4px 0 0", fontFamily: "var(--font-dm-sans)", color: "var(--color-text-tertiary)", fontSize: "12px", lineHeight: 1.5 }}>
                  Every rating sharpens your recommendations.
                </p>
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
                              {entry.pendingCanonicalMatch ? "Pending match" : tasteScoreLabel(entry.rating)} · {formatTasteScore(entry.rating)}/10
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
                  Your collection is empty. Add a few bottles you own or have tasted and rate highly; Barrel Proof recommendations will start from those signals.
                </div>
              )}

              {collectionError ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#D77A61" }}>{collectionError}</p> : null}
              {savedCollection ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#9AD4B1" }}>{collectionSyncPending ? "Saved on this device; sync pending." : "Collection saved."}</p> : null}
            </div>
          </StepShell>
          ) : null}

          {renderSectionButton("recommendations")}

          {activeDashboardSection === "recommendations" && !canUseRecommendations ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles demo"
            subtitle="Free access can view this surface. Upgrade to generate recommendations from your saved bottles and local signals."
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Upgrade to use recommendations</strong>
              <span>Free accounts can view this demo, but personalized recommendations start with Barrel Proof or Bottled in Bond.</span>
              <a href="/pricing" style={{ justifySelf: "center", marginTop: 4, borderRadius: 999, padding: "10px 14px", background: "linear-gradient(135deg, #C4943A, #E8C97A)", color: "#0D0B07", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>Upgrade to use</a>
            </div>
          </StepShell>
          ) : activeDashboardSection === "recommendations" && canUseRecommendations && !preparedDashboardSections.has("recommendations") ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles"
            subtitle="Loading your bottle matches…"
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Preparing recommendations</strong>
              <span>We’re matching your collection against the bottle catalog and recent local signal.</span>
            </div>
          </StepShell>
          ) : activeDashboardSection === "recommendations" && canUseRecommendations && (dnaFeedbackOwnerId !== feedbackUserId || dnaFeedbackStatus === "idle" || dnaFeedbackStatus === "loading") ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles"
            subtitle="Loading your hidden bottle preferences…"
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Loading recommendations</strong>
              <span>We’re applying your saved bottle feedback before ranking matches.</span>
            </div>
          </StepShell>
          ) : activeDashboardSection === "recommendations" && canUseRecommendations && dnaFeedbackStatus === "error" ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles"
            subtitle="Your saved bottle feedback could not be loaded."
            hideHeader
            attached
          >
            <div className="dashboard-loading-panel">
              <strong>Recommendations unavailable</strong>
              <span>{dnaFeedbackError || "Could not load recommendation feedback."}</span>
            </div>
          </StepShell>
          ) : activeDashboardSection === "recommendations" && canUseRecommendations ? (
          <StepShell
            step="Recommendations"
            title="Recommended bottles"
            subtitle="Personalized matches from bottles you rate, feedback you give, and fresh local signal."
            hideHeader
            attached
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ borderRadius: "18px", border: "1px solid rgba(196,148,58,0.16)", background: "rgba(196,148,58,0.055)", padding: "16px", display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontFamily: "var(--font-playfair)", color: "var(--color-cream)", fontSize: "24px" }}>Your Bourbon DNA gets smarter with every bottle you rate.</h3>
                    <span style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.08)", color: "var(--color-accent-amber)", padding: "5px 8px", fontFamily: "var(--font-jetbrains)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {bourbonDnaSummary.confidence === "strong" ? "Strong read" : bourbonDnaSummary.confidence === "learning" ? "Learning" : "Early read"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: 1.6 }}>
                    {bourbonDnaSummary.favoriteTags.length
                      ? `${bourbonDnaSummary.favoriteTags.slice(0, 3).join(" · ")}${bourbonDnaSummary.preferredProofRange ? ` · ${bourbonDnaSummary.preferredProofRange.min}-${bourbonDnaSummary.preferredProofRange.max} proof` : ""}`
                      : "Add 3 bottles you’ve tried to unlock your first matches."}
                  </p>
                  {!recommendationQuickStart.ready ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-dm-sans)", color: "var(--color-text-tertiary)", fontSize: "12px" }}>
                        {recommendationQuickStart.ratedBottleCount}/{recommendationQuickStart.target} bottles added
                      </span>
                      <button type="button" onClick={() => { prepareDashboardSection("collection"); setActiveDashboardSection("collection"); }} style={{ border: "1px solid rgba(196,148,58,0.26)", borderRadius: "999px", background: "rgba(196,148,58,0.10)", color: "var(--color-accent-amber)", padding: "7px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                        Add bottles
                      </button>
                    </div>
                  ) : null}
                  {bourbonDnaSummary.favoriteTags.length ? (
                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-tertiary)", fontSize: "12px", lineHeight: 1.5 }}>
                      {bourbonDnaSummary.confidence === "strong"
                        ? "Based on your rated bottles, preferred proof, and flavor patterns."
                        : "Learning your proof, flavor, and mash-bill patterns."}
                    </p>
                  ) : null}
                </div>

                {collectionRecommendationInsights.length > 0 ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "10px" }}>
                      {collectionRecommendationInsights.slice(0, recommendationVisibleCount).map((insight) => (
                      <div key={insight.option.canonicalKey} style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.12)", padding: "13px", display: "grid", gap: "10px" }}>
                        <div>
                          <span style={{ display: "inline-block", marginBottom: 5, borderRadius: "999px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", color: "var(--color-accent-amber)", padding: "3px 6px", fontFamily: "var(--font-jetbrains)", fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{insight.laneLabel}</span>
                          <strong style={{ display: "block", fontFamily: "var(--font-dm-sans)", color: "var(--color-cream)", fontSize: "13px" }}>{insight.option.label}</strong>
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
                          <Link href={insight.recentSightings[0].href} style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.45, textDecoration: "none" }}>
                            {insight.recentSightings.length > 1 ? `${insight.recentSightings.length} recent signals` : "Recent signal"} · {insight.recentSightings[0].state ? `${insight.recentSightings[0].state} · ` : ""}{insight.recentSightings[0].location}{insight.recentSightings[0].timestamp ? ` · ${formatShortDate(insight.recentSightings[0].timestamp)}` : ""}
                          </Link>
                        ) : null}
                        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                          <button onClick={() => { void trackCollectionSuggestion(insight); }} style={{ flex: "1 1 120px", border: "1px solid rgba(196,148,58,0.28)", borderRadius: "999px", background: "rgba(196,148,58,0.12)", color: "var(--color-accent-amber)", padding: "8px 10px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Track bottle</button>
                          {(["not_for_me", "already_own"] as const).map((signal) => {
                            const status = dnaFeedbackState[`${insight.option.canonicalKey}:${signal}`];
                            const label = signal === "not_for_me" ? "Not for me" : "Rate it";
                            const handleFeedback = () => {
                              void submitDnaFeedback(insight, signal);
                              if (signal === "already_own") {
                                stageCollectionBottle(insight.option);
                                prepareDashboardSection("collection");
                                setActiveDashboardSection("collection");
                              }
                            };
                            return (
                              <button key={signal} type="button" disabled={status === "saving"} onClick={handleFeedback} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "999px", background: status === "saved" ? "rgba(82,180,126,0.12)" : "rgba(255,255,255,0.025)", color: status === "saved" ? "#9AD4B1" : "var(--color-text-tertiary)", padding: "8px 9px", fontFamily: "var(--font-dm-sans)", fontSize: "11px", cursor: status === "saving" ? "progress" : "pointer" }}>
                                {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {collectionRecommendationInsights.length > recommendationVisibleCount ? (
                        <button type="button" onClick={() => setRecommendationVisibleCount((count) => Math.min(collectionRecommendationInsights.length, count + 4))} style={{ border: "1px solid rgba(196,148,58,0.26)", borderRadius: "999px", background: "rgba(196,148,58,0.10)", color: "var(--color-accent-amber)", padding: "9px 12px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>Show more recommendations</button>
                      ) : recommendationVisibleCount > 4 ? (
                        <button type="button" onClick={() => setRecommendationVisibleCount(4)} style={{ border: "1px solid rgba(255,255,255,0.09)", borderRadius: "999px", background: "rgba(255,255,255,0.025)", color: "var(--color-text-secondary)", padding: "9px 12px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>Show fewer</button>
                      ) : null}

                      <button type="button" onClick={() => { prepareDashboardSection("collection"); setActiveDashboardSection("collection"); }} style={{ border: "1px solid rgba(255,255,255,0.09)", borderRadius: "999px", background: "rgba(255,255,255,0.025)", color: "var(--color-text-secondary)", padding: "9px 12px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>Add more bottles</button>
                      {dnaFeedbackEntries.length > 0 ? (
                        <button type="button" disabled={resettingDnaFeedback} onClick={() => { void resetDnaFeedback(); }} style={{ border: 0, background: "transparent", color: "var(--color-text-tertiary)", padding: "9px 4px", fontFamily: "var(--font-dm-sans)", fontSize: "11px", cursor: resettingDnaFeedback ? "progress" : "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>{resettingDnaFeedback ? "Resetting…" : "Reset hidden bottles"}</button>
                      ) : null}
                    </div>
                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-tertiary)", fontSize: "12px", lineHeight: 1.55 }}>
                      Want better matches? Add or rate more bottles in My Collection.
                    </p>
                  </div>
                  </>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: 1.7 }}>
                      Add 3–5 bottles you’ve tried to unlock better recommendations.
                    </p>
                    {dnaFeedbackEntries.length > 0 ? (
                      <button type="button" disabled={resettingDnaFeedback} onClick={() => { void resetDnaFeedback(); }} style={{ justifySelf: "start", border: 0, background: "transparent", color: "var(--color-text-tertiary)", padding: "5px 0", fontFamily: "var(--font-dm-sans)", fontSize: "11px", cursor: resettingDnaFeedback ? "progress" : "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}>{resettingDnaFeedback ? "Resetting…" : "Reset hidden bottles"}</button>
                    ) : null}
                  </div>
                )}
              </div>

              {collectionError ? <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "#D77A61" }}>{collectionError}</p> : null}
            </div>
          </StepShell>
          ) : null}

          <CoverageRequestsCard emptyMode="compact" />
          </div>
        </div>
      </motion.main>
      <Footer />
    </div>
  );
}

