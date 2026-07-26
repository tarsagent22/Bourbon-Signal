"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Camera, Lock, MapPin, Navigation as NavigationIcon, Search, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Bottle } from "@/data/bottles";
import { useBottles } from "@/hooks/useBottles";
import { useStores, type Store } from "@/hooks/useStores";
import { buildSightingStoreSearchIndex, searchSightingStoreIndex } from "@/lib/sighting-store-search";
import { useSightings } from "@/hooks/useSightings";
import { formatStoreAddress, makeSightingId, normalizeBottleKey, sightingTypeLabel, type MemberSighting, type SightingType } from "@/lib/sightings";


function norm(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const BOTTLE_QUERY_ALIASES: Record<string, string[]> = {
  eht: ["e h taylor", "colonel e h taylor", "eh taylor"],
  btac: ["george t stagg", "william larue weller", "thomas h handy", "eagle rare 17", "sazerac 18"],
  wfp: ["weller full proof"],
  rr13: ["russell reserve 13"],
  rr15: ["russell reserve 15"],
  ofbb: ["old forester birthday bourbon"],
  ehtbp: ["e h taylor barrel proof", "colonel e h taylor barrel proof"],
  blantons: ["blanton", "blanton's"],
};

function expandQuery(value: string, aliases: Record<string, string[]>) {
  const base = norm(value);
  if (!base) return [];
  const compact = base.replace(/\s+/g, "");
  return Array.from(new Set([base, compact, ...(aliases[base] || []), ...(aliases[compact] || [])].map(norm).filter(Boolean)));
}

function tokenScore(searchable: string, queryTerms: string[]) {
  if (!queryTerms.length) return 0;
  const haystack = norm(searchable);
  const compactHaystack = haystack.replace(/\s+/g, "");
  let best = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    const compactTerm = term.replace(/\s+/g, "");
    if (haystack === term || compactHaystack === compactTerm) best = Math.max(best, 120);
    else if (haystack.startsWith(term) || compactHaystack.startsWith(compactTerm)) best = Math.max(best, 95);
    else if (haystack.includes(term) || compactHaystack.includes(compactTerm)) best = Math.max(best, 76);
    else {
      const words = term.split(" ").filter(Boolean);
      const matchedWords = words.filter((word) => haystack.includes(word)).length;
      if (words.length) best = Math.max(best, Math.round((matchedWords / words.length) * 62));
    }
  }
  return best;
}

function storeDisplay(store: Store) {
  return store.displayLabel || store.name || store.address || [store.city, store.state].filter(Boolean).join(", ");
}

function asBottleCheckBottle(value: unknown): Bottle | null {
  if (!value || typeof value !== "object") return null;
  const bottle = value as Record<string, unknown>;
  const id = String(bottle.id || bottle.canonicalName || bottle.name || "");
  const name = String(bottle.canonicalName || bottle.name || "");
  if (!id || !name) return null;
  const availability = String(bottle.availability || "");
  const tier: Bottle["tier"] = availability === "unicorn" ? "unicorn" : availability === "allocated" || availability === "highly_allocated" ? "allocated" : "limited";
  return { id, name, canonical_id: id, canonical_name: name, aliases: Array.isArray(bottle.aliases) ? bottle.aliases.map(String) : [], distillery: String(bottle.producer || bottle.brand || "Bottle Check index"), tier, msrp: typeof bottle.msrp === "number" ? bottle.msrp : 0 };
}

function formatAgo(value: string) {
  const ms = Date.now() - +new Date(value);
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function tierLabel(tier?: MemberSighting["rarityTier"]) {
  if (tier === "unicorn") return "Unicorn";
  if (tier === "allocated") return "Allocated";
  return "Limited";
}

function formatPrice(value?: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function sightingLocationLine(sighting: MemberSighting) {
  return [sighting.storeCity, sighting.storeState].filter(Boolean).join(", ") || sighting.storeState || "Location unknown";
}

type SightingDropdownOption = { value: string; label: string };

function SightingDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SightingDropdownOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="sighting-menu">
      <span>{label}</span>
      <button type="button" className="sighting-menu-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>{selected?.label || "Select"}</span>
        <span aria-hidden style={{ opacity: 0.55 }}>▾</span>
      </button>
      {open ? (
        <div className="sighting-menu-panel" role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`sighting-menu-option ${active ? "active" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function SightingsClient() {
  const shouldReduceMotion = useReducedMotion();
  const { isLoaded: authLoaded, isSignedIn, signIn, entitlements } = useAuth();
  const canReadSightings = entitlements.canReadSightings;
  const canSubmitSightings = entitlements.canSubmitSightings;
  const isLimitedFeedPreview = authLoaded && isSignedIn && entitlements.tier === "free" && entitlements.sightingsPreviewLimit !== null;
  const optimisticMemberAccess = !authLoaded || canReadSightings;
  const canEditSightings = authLoaded && isSignedIn && canSubmitSightings;
  const { bottles } = useBottles(optimisticMemberAccess);
  const { stores, loading: storesLoading, error: storesError, reload: reloadStores } = useStores(authLoaded && isSignedIn && canSubmitSightings);
  const { sightings, states, addSighting, voteSighting, uploadSightingPhoto, saving, loading, previewLimit, totalSightings } = useSightings(authLoaded && isSignedIn && canReadSightings);

  const [activeTab, setActiveTab] = useState<"submit" | "feed">("submit");
  const [sightingType, setSightingType] = useState<SightingType>("seen_in_store");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [bottleQuery, setBottleQuery] = useState("");
  const [selectedBottleId, setSelectedBottleId] = useState("");
  const [manualBottleConfirmed, setManualBottleConfirmed] = useState(false);
  const [selectedBottleTier, setSelectedBottleTier] = useState<MemberSighting["rarityTier"]>("limited");
  const [storeQuery, setStoreQuery] = useState("");
  const [storeSuggestionsOpen, setStoreSuggestionsOpen] = useState(true);
  const [activeStoreIndex, setActiveStoreIndex] = useState(-1);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [manualStoreMode, setManualStoreMode] = useState(false);
  const [manualStoreAddress, setManualStoreAddress] = useState("");
  const [manualStoreCity, setManualStoreCity] = useState("");
  const [manualStoreState, setManualStoreState] = useState("");
  const [manualStoreZip, setManualStoreZip] = useState("");
  const [quantityEstimate, setQuantityEstimate] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [proofPhoto, setProofPhoto] = useState<File | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<MemberSighting | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bottleCheckMatches, setBottleCheckMatches] = useState<Bottle[]>([]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const bottle = searchParams.get("bottle");
    if (bottle) setBottleQuery(bottle);
    const bottleId = searchParams.get("bottleId");
    if (bottleId) setSelectedBottleId(bottleId);
    const store = searchParams.get("store");
    if (store) setStoreQuery(store);
  }, []);

  useEffect(() => {
    const query = bottleQuery.trim();
    if (query.length < 2) return setBottleCheckMatches([]);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/bottle-check?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const suggestions = [data?.bottle, ...(Array.isArray(data?.suggestions) ? data.suggestions : [])].filter(Boolean);
          setBottleCheckMatches(suggestions.map(asBottleCheckBottle).filter((bottle): bottle is Bottle => Boolean(bottle)));
        })
        .catch((err) => { if (err?.name !== "AbortError") setBottleCheckMatches([]); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [bottleQuery]);

  const bottleMatches = useMemo(() => {
    const queryTerms = expandQuery(bottleQuery, BOTTLE_QUERY_ALIASES);
    if (!queryTerms.length) return [];
    const byId = new Map<string, { bottle: Bottle; score: number }>();
    [...bottles, ...bottleCheckMatches].forEach((bottle) => {
      const searchable = [bottle.name, bottle.canonical_name, bottle.canonical_id, bottle.distillery, ...(bottle.aliases || []), ...(bottle.search_aliases || [])].filter(Boolean).join(" ");
      const score = tokenScore(searchable, queryTerms) + (bottleCheckMatches.some((match) => (match.id || match.name) === (bottle.id || bottle.name)) ? 8 : 0);
      if (score < 38) return;
      const key = bottle.id || bottle.canonical_id || bottle.name;
      const existing = byId.get(key);
      if (key && (!existing || score > existing.score)) byId.set(key, { bottle, score });
    });
    return Array.from(byId.values()).sort((a, b) => b.score - a.score || a.bottle.name.localeCompare(b.bottle.name)).slice(0, 8).map(({ bottle }) => bottle);
  }, [bottleQuery, bottles, bottleCheckMatches]);

  const deferredStoreQuery = useDeferredValue(storeQuery);
  const storeSearchIndex = useMemo(() => buildSightingStoreSearchIndex(stores), [stores]);
  const searchableStoreCount = storeSearchIndex.length;
  const storeMatches = useMemo(
    () => searchSightingStoreIndex(storeSearchIndex, deferredStoreQuery, { origin: geo, limit: 8 }),
    [storeSearchIndex, deferredStoreQuery, geo],
  );

  useEffect(() => {
    setActiveStoreIndex((current) => current >= storeMatches.length ? -1 : current);
  }, [storeMatches]);

  useEffect(() => {
    setActiveStoreIndex(-1);
  }, [geo]);

  const selectStore = (store: Store) => {
    setSelectedStore(store);
    setManualStoreMode(false);
    setStoreQuery(storeDisplay(store));
    setStoreSuggestionsOpen(false);
    setActiveStoreIndex(-1);
  };

  const handleStoreSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setStoreSuggestionsOpen(false);
      setActiveStoreIndex(-1);
      return;
    }
    if (!storeMatches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setStoreSuggestionsOpen(true);
      setActiveStoreIndex((current) => Math.min(current + 1, storeMatches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setStoreSuggestionsOpen(true);
      setActiveStoreIndex((current) => current <= 0 ? storeMatches.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeStoreIndex >= 0) {
      event.preventDefault();
      const activeStore = storeMatches[activeStoreIndex];
      if (activeStore) selectStore(activeStore);
    }
  };

  const exactAddress = selectedStore ? formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip]) : "Select an exact store to show the address on the sighting card.";
  const manualStoreName = storeQuery.trim();
  const manualStoreLine = formatStoreAddress([manualStoreAddress, manualStoreCity, manualStoreState.toUpperCase(), manualStoreZip]);
  const isManualBottle = Boolean(bottleQuery.trim() && !selectedBottleId);
  const isManualStore = manualStoreMode && !selectedStore;
  const stateOptions = useMemo(() => Array.from(new Set([...states, ...sightings.map((s) => s.storeState).filter(Boolean) as string[]])).sort(), [states, sightings]);
  const sightingStateOptions = useMemo(() => [
    { value: "ALL", label: "All states" },
    ...stateOptions.map((state) => ({ value: state, label: state })),
  ], [stateOptions]);
  const filteredSightings = useMemo(() => sightings.filter((sighting) => stateFilter === "ALL" || sighting.storeState === stateFilter), [sightings, stateFilter]);

  const requestLocation = () => {
    if (!navigator.geolocation) return setGeoStatus("Location is not available in this browser.");
    setGeoStatus("Finding nearby stores…");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("Nearby stores sorted by your current location. Select the exact store before submitting."); },
      () => setGeoStatus("Could not use location. Search by city, ZIP, street, or store name instead."),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const submit = async () => {
    setSubmitError(null);
    if (!authLoaded || !isSignedIn) return signIn();
    if (!canSubmitSightings) return setSubmitError("Sign in to submit sightings.");
    const bottleName = bottleQuery.trim();
    if (!bottleName) return setSubmitError("Choose or enter a bottle.");
    if (isManualBottle && !manualBottleConfirmed) return setSubmitError("Tap “Use as new bottle” so we know to add this bottle with your sighting.");
    if (!selectedStore && !isManualStore) return setSubmitError("Choose a store or add the missing store details.");
    if (isManualStore && (!manualStoreName || !manualStoreCity.trim() || !manualStoreState.trim())) return setSubmitError("Add the store name, city, and state so other members can use it too.");
    const storeName = selectedStore ? storeDisplay(selectedStore) : manualStoreName;
    const storeAddress = selectedStore ? exactAddress : manualStoreLine;
    const storeCity = selectedStore ? selectedStore.city : manualStoreCity.trim();
    const storeState = selectedStore ? selectedStore.state : manualStoreState.trim().toUpperCase();
    const storeZip = selectedStore ? selectedStore.zip : manualStoreZip.trim();
    const sighting: MemberSighting = {
      id: makeSightingId(),
      bottleName,
      bottleId: selectedBottleId || normalizeBottleKey(bottleName),
      rarityTier: selectedBottleTier || "limited",
      storeId: selectedStore?.id || `manual-store-${normalizeBottleKey([manualStoreName, manualStoreCity, manualStoreState].filter(Boolean).join(" "))}`,
      storeName,
      storeAddress,
      storeCity,
      storeState,
      storeZip,
      quantityEstimate: quantityEstimate.trim() || undefined,
      price: price.trim() ? Number(price) : null,
      notes: notes.trim() || undefined,
      source: "custom",
      sightingType,
      reviewState: (isManualBottle || isManualStore) ? {
        needsBottleReview: isManualBottle,
        needsStoreReview: isManualStore,
        manualBottleName: isManualBottle ? bottleName : undefined,
        manualBottleRarityTier: undefined,
        manualStoreName: isManualStore ? manualStoreName : undefined,
        manualStoreAddress: isManualStore ? manualStoreAddress.trim() || undefined : undefined,
        manualStoreCity: isManualStore ? manualStoreCity.trim() : undefined,
        manualStoreState: isManualStore ? manualStoreState.trim().toUpperCase() : undefined,
        manualStoreZip: isManualStore ? manualStoreZip.trim() || undefined : undefined,
      } : undefined,
      createdAt: new Date().toISOString(),
    };
    try {
      const { sighting: savedSighting, created } = await addSighting(sighting);
      setSaved(savedSighting);
      if (proofPhoto) {
        try {
          await uploadSightingPhoto(savedSighting.id, proofPhoto);
        } catch (error) {
          setSubmitError(error instanceof Error ? `Sighting saved, but the photo was not attached: ${error.message}` : "Sighting saved, but the photo was not attached.");
          return;
        }
      }
      if (!created && !proofPhoto) setSubmitError("This sighting was already reported recently, so no duplicate was created.");
      setQuantityEstimate("");
      setPrice("");
      setNotes("");
      setProofPhoto(null);
      setManualStoreMode(false);
      setManualStoreAddress("");
      setManualStoreCity("");
      setManualStoreState("");
      setManualStoreZip("");
      setManualBottleConfirmed(false);
      setActiveTab("feed");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save sighting. Please try again.");
    }
  };

  if (authLoaded && !isSignedIn) {
    return (
      <main style={{ minHeight: "100vh", padding: "112px 18px 80px", background: "linear-gradient(180deg, #100c08 0%, #1b130c 46%, #100c08 100%)", color: "var(--color-cream)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", border: "1px solid rgba(196,148,58,0.22)", borderRadius: 28, padding: 28, background: "rgba(245,237,214,0.045)", boxShadow: "0 24px 70px rgba(0,0,0,0.34)" }}>
          <Lock size={28} color="var(--color-accent-amber)" />
          <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 8vw, 68px)", margin: "18px 0 10px" }}>Member Sightings</h1>
          <p style={{ color: "rgba(245,237,214,0.68)", fontSize: 16, lineHeight: 1.7 }}>Sightings are members only. Sign in to submit reports and view the member sightings feed.</p>
          <button type="button" onClick={signIn} className="sighting-submit" style={{ marginTop: 18 }}>Sign in to access sightings</button>
        </div>
      </main>
    );
  }


  return (
    <main style={{ minHeight: "100vh", padding: "112px 18px 80px", background: "linear-gradient(180deg, #100c08 0%, #1b130c 46%, #100c08 100%)", color: "var(--color-cream)" }}>
      <style>{`
        .sighting-label{display:block;margin-bottom:7px;font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(245,237,214,.46)}
        .sighting-input-wrap{display:flex;align-items:center;gap:9px;border:1px solid rgba(245,237,214,.12);background:rgba(5,4,3,.36);border-radius:14px;padding:0 12px;color:rgba(245,237,214,.42)}
        .sighting-input-wrap input,.sighting-plain-input{width:100%;border:0;outline:0;background:transparent;color:var(--color-cream);font-family:var(--font-dm-sans);font-size:14px;padding:13px 0}
        .sighting-plain-input{border:1px solid rgba(245,237,214,.12);background:rgba(5,4,3,.36);border-radius:14px;padding:13px 12px}
        .sighting-suggestions{display:grid;gap:8px;margin-top:8px}
        .sighting-suggestions button{border:1px solid rgba(245,237,214,.09);background:rgba(245,237,214,.035);border-radius:12px;padding:10px 12px;color:var(--color-cream);text-align:left;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}
        .sighting-suggestions span{display:block;color:rgba(245,237,214,.44);font-size:12px;margin-top:3px}
        .sighting-suggestions button:hover,.sighting-suggestions button.selected{border-color:rgba(196,148,58,.24);background:rgba(196,148,58,.055);transform:translateY(-1px)}
        .selected-store-card{margin-top:12px;border:1px solid rgba(196,148,58,.18);border-radius:15px;background:linear-gradient(135deg,rgba(196,148,58,.08),rgba(245,237,214,.025));padding:12px 13px;box-shadow:inset 0 1px 0 rgba(245,237,214,.035)}
        .selected-store-card strong{display:block;color:var(--color-cream);font-family:var(--font-dm-sans);font-size:14px;font-weight:850;line-height:1.25}
        .selected-store-card span{display:block;margin-top:4px;color:rgba(245,237,214,.58);font-family:var(--font-dm-sans);font-size:12px;line-height:1.45}
        .selected-store-card button{margin-top:9px;border:0;background:transparent;color:rgba(232,201,122,.82);font-family:var(--font-jetbrains);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;padding:0;cursor:pointer}
        .sighting-submit,.sighting-location-button,.sighting-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:1px solid rgba(245,237,214,.12);background:rgba(245,237,214,.04);color:var(--color-cream);font-family:var(--font-dm-sans);font-size:13px;font-weight:800;padding:11px 15px;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease,color .18s ease}
        .sighting-submit{margin-top:18px;width:100%;border-color:rgba(196,148,58,.24);background:rgba(196,148,58,.09)}
        .sighting-location-button{padding:9px 12px;background:rgba(245,237,214,.035);border-color:rgba(245,237,214,.1);color:rgba(245,237,214,.72)}
        .sighting-location-button:hover,.sighting-submit:hover,.sighting-tab:hover{transform:translateY(-1px);border-color:rgba(245,237,214,.2);background:rgba(245,237,214,.06)}
        .sighting-step-card{position:relative;border:1px solid rgba(245,237,214,.085);border-radius:20px;background:linear-gradient(145deg,rgba(18,13,9,.78),rgba(7,6,5,.54));padding:18px;box-shadow:inset 0 1px 0 rgba(245,237,214,.032)}
        .sighting-step-card[data-complete="true"]{border-color:rgba(196,148,58,.18);background:linear-gradient(145deg,rgba(18,13,9,.84),rgba(7,6,5,.56))}
        .sighting-step-head{display:grid;gap:8px;margin-bottom:14px}
        .sighting-step-number{display:inline-flex;align-items:center;gap:10px;width:fit-content;color:rgba(232,201,122,.78);font-family:var(--font-jetbrains);font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
        .sighting-step-number:after{content:"";display:block;width:38px;height:1px;background:rgba(196,148,58,.32)}
        .sighting-step-head strong{display:block;color:var(--color-cream);font-family:var(--font-playfair);font-size:clamp(24px,5.6vw,30px);font-weight:800;line-height:1.02;letter-spacing:-.015em}
        .sighting-step-head span:last-child{display:block;margin-top:6px;color:rgba(245,237,214,.56);font-family:var(--font-dm-sans);font-size:13px;line-height:1.45}
        .sighting-selected-pill{display:inline-flex;align-items:center;gap:7px;margin-top:9px;border:1px solid rgba(83,211,146,.22);border-radius:999px;background:rgba(83,211,146,.07);padding:7px 10px;color:rgba(203,255,225,.9);font-family:var(--font-dm-sans);font-size:12px;font-weight:800}
        .manual-review-box{margin-top:12px;border:1px dashed rgba(196,148,58,.28);border-radius:16px;background:rgba(196,148,58,.055);padding:12px;display:grid;gap:10px}.manual-review-box[data-confirmed="true"]{border-style:solid;border-color:rgba(83,211,146,.26);background:rgba(83,211,146,.07)}.manual-review-box strong{font-family:var(--font-dm-sans);font-size:13px;color:var(--color-cream)}.manual-review-box p{margin:0;color:rgba(245,237,214,.55);font-size:12px;line-height:1.5}.manual-grid{display:grid;grid-template-columns:1fr 92px;gap:10px}.manual-bottle-action{width:100%;border:1px solid rgba(196,148,58,.32);border-radius:13px;background:linear-gradient(135deg,rgba(196,148,58,.18),rgba(232,201,122,.08));color:var(--color-cream);font-family:var(--font-dm-sans);font-size:13px;font-weight:850;padding:11px 12px;cursor:pointer;text-align:center}.manual-bottle-action.confirmed{border-color:rgba(83,211,146,.28);background:rgba(83,211,146,.1);color:rgba(203,255,225,.92)}
        .sighting-tab{position:relative;border-radius:0;background:transparent;border:0;color:rgba(245,237,214,.48);padding:12px 7px 13px;min-width:86px;letter-spacing:.01em}
        .sighting-tab:after{content:"";position:absolute;left:12px;right:12px;bottom:5px;height:1px;background:transparent;transition:background .18s ease,opacity .18s ease}
        .sighting-tab.active{color:var(--color-cream);background:transparent;box-shadow:none}
        .sighting-tab.active:after{background:rgba(196,148,58,.62)}
        .sighting-empty{color:rgba(245,237,214,.46);font-size:13px}
        .sighting-feed-shell{position:relative;background:linear-gradient(180deg,rgba(16,12,9,.42),transparent 30%);padding:12px 0 0;overflow:visible}
        .sighting-feed-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(245,237,214,.026),transparent 28%);opacity:.8}
        .sighting-mode-shell{position:relative;margin-top:22px;margin-bottom:10px;border:0;border-radius:0;background:transparent;padding:0;display:flex;gap:22px;width:fit-content;max-width:100%}
        .sighting-feed-top{position:relative;display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;padding:0 4px 14px;border-bottom:1px solid var(--boundary-subtle)}
        .sighting-feed-count{display:inline-flex;font-family:var(--font-dm-sans);font-size:13px;font-weight:750;color:rgba(245,237,214,.62)}
        .sighting-menu{position:relative;min-width:172px}
        .sighting-menu > span{display:block;margin-bottom:5px;font-family:var(--font-jetbrains);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(245,237,214,.34)}
        .sighting-menu-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;height:40px;border-radius:12px;border:1px solid rgba(245,237,214,.105);background:rgba(12,9,7,.7);color:rgba(245,237,214,.88);font-family:var(--font-dm-sans);font-size:13px;font-weight:750;padding:9px 11px;outline:none;text-align:left;cursor:pointer;box-shadow:inset 0 1px 0 rgba(245,237,214,.025)}
        .sighting-menu-trigger:hover,.sighting-menu-trigger[aria-expanded="true"]{border-color:rgba(196,148,58,.26);background:rgba(18,13,10,.92);box-shadow:inset 0 1px 0 rgba(245,237,214,.035)}
        .sighting-menu-trigger span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sighting-menu-panel{position:absolute;z-index:40;top:calc(100% + 7px);left:0;right:0;max-height:286px;overflow-y:auto;display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border-radius:15px;border:1px solid rgba(245,237,214,.11);background:rgba(13,10,8,.98);box-shadow:0 18px 40px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.035);scrollbar-color:rgba(245,237,214,.42) rgba(245,237,214,.08);scrollbar-width:thin}
        .sighting-menu-option{min-height:42px;border-radius:11px;border:1px solid rgba(245,237,214,.06);background:rgba(245,237,214,.022);color:rgba(245,237,214,.68);font-family:var(--font-dm-sans);font-size:13px;font-weight:650;text-align:left;padding:9px 11px;cursor:pointer}
        .sighting-menu-option:hover,.sighting-menu-option.active{border-color:rgba(196,148,58,.24);background:rgba(196,148,58,.075);color:var(--color-cream)}
        .sighting-card-list{position:relative;display:grid;gap:0;padding:0 4px}
        .sighting-card{position:relative;overflow:hidden;border-bottom:1px solid var(--boundary-subtle);padding:22px 4px;background:transparent}
        .sighting-card:before{content:none}
        .sighting-card:after{content:none}
        .sighting-card-kicker{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .sighting-eyebrow{font-family:var(--font-jetbrains);font-size:9px;text-transform:uppercase;letter-spacing:.11em;color:rgba(206,169,91,.72);font-weight:800}
        .sighting-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.38);white-space:nowrap}
        .sighting-title{position:relative;margin:0;font-family:var(--font-playfair);font-size:clamp(25px,6.4vw,33px);line-height:1.02;letter-spacing:-.012em;color:var(--color-cream);padding-right:4px}
        .sighting-store-line{position:relative;display:flex;align-items:flex-start;gap:8px;margin-top:11px;color:rgba(245,237,214,.78);font-size:14px;line-height:1.35;font-weight:800}
        .sighting-store-line svg{flex:0 0 auto;margin-top:1px;color:rgba(206,169,91,.54)}
        .sighting-address{position:relative;margin:4px 0 0 23px;color:rgba(245,237,214,.43);font-size:12px;line-height:1.45}
        .sighting-detail-row{position:relative;display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;align-items:center}
        .sighting-detail-pill{border-radius:999px;background:rgba(245,237,214,.055);padding:6px 9px;color:rgba(245,237,214,.58);font-family:var(--font-dm-sans);font-size:11px;font-weight:760;line-height:1;max-width:100%}
        .sighting-detail-pill.verified{border-color:rgba(83,211,146,.24);background:rgba(83,211,146,.08);color:rgba(198,255,222,.88)}
        .sighting-detail-pill.tier{font-family:var(--font-jetbrains);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
        .sighting-detail-pill.tier-limited{border-color:rgba(138,138,138,.28);background:rgba(138,138,138,.08);color:rgba(245,237,214,.72)}
        .sighting-detail-pill.tier-allocated{border-color:rgba(184,115,51,.36);background:rgba(184,115,51,.1);color:rgba(244,190,129,.9)}
        .sighting-detail-pill.tier-unicorn{border-color:rgba(196,148,58,.42);background:rgba(196,148,58,.12);color:rgba(232,201,122,.94)}
        .sighting-proof-photo{margin-top:12px;width:100%;max-height:360px;object-fit:cover;border-radius:16px;border:1px solid rgba(245,237,214,.1);background:#050403}

        .sighting-note{position:relative;margin:13px 0 0;padding:12px 13px;border-left:1px solid rgba(196,148,58,.18);background:rgba(5,4,3,.18);border-radius:0 12px 12px 0;color:rgba(245,237,214,.62);font-size:13px;line-height:1.55}
        .sighting-bottom{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px;padding-top:12px;border-top:1px solid rgba(245,237,214,.055)}
        .sighting-tier-line{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-family:var(--font-jetbrains);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(245,237,214,.38);line-height:1.35}
        .sighting-votes{display:flex;align-items:center;gap:6px;margin-left:auto}
        .vote-button{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(245,237,214,.085);background:rgba(245,237,214,.028);color:rgba(245,237,214,.58);font-family:var(--font-jetbrains);font-size:11px;font-weight:800;border-radius:999px;padding:7px 9px;cursor:pointer;transition:border-color .18s ease,background .18s ease,color .18s ease,transform .18s ease}
        .vote-button:hover{transform:translateY(-1px);border-color:rgba(245,237,214,.18);color:rgba(245,237,214,.86);background:rgba(245,237,214,.045)}
        .vote-button.active{border-color:rgba(196,148,58,.32);background:rgba(196,148,58,.085);color:var(--color-cream)}
        .sighting-empty-panel{position:relative;margin:0 4px 14px;padding:20px 0;border-top:1px solid var(--boundary-subtle);background:transparent}
        .sighting-empty-panel strong{display:block;margin-bottom:5px;color:var(--color-cream);font-family:var(--font-playfair);font-size:22px;font-weight:700}
        .sighting-empty-panel span{display:block;color:rgba(245,237,214,.52);font-size:13px;line-height:1.55}
        .sighting-loading-card{height:156px;border-bottom:1px solid var(--boundary-subtle);background:linear-gradient(100deg,rgba(245,237,214,.016),rgba(245,237,214,.045),rgba(245,237,214,.016));background-size:220% 100%;animation:sightingShimmer 1.4s ease-in-out infinite}
        @keyframes sightingShimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
        @media (prefers-reduced-motion:reduce){.sighting-loading-card{animation:none}.vote-button,.sighting-card,.sighting-location-button,.sighting-submit,.sighting-tab{transition:none!important}}
        @media (max-width:700px){main{padding-left:14px!important;padding-right:14px!important}.sighting-two-col{grid-template-columns:1fr!important}.sighting-mode-shell{gap:18px;margin-top:20px;margin-bottom:9px}.sighting-feed-shell{margin-left:-2px;margin-right:-2px;padding-top:12px}.sighting-feed-top{align-items:flex-end;padding:0 4px 12px}.sighting-menu{min-width:150px}.sighting-card-list{padding:0 4px;gap:0}.sighting-card{padding:20px 4px}.sighting-bottom{align-items:flex-end}.sighting-tier-line{flex:1;min-width:0}.sighting-votes{gap:5px}.vote-button{padding:7px 8px}.sighting-tab{min-width:auto;padding-left:4px;padding-right:4px}.sighting-card-kicker{align-items:flex-start}.sighting-time{padding-top:1px}.sighting-title{padding-right:0}.sighting-address{margin-left:23px}.sighting-detail-pill{font-size:11px}.sighting-empty-panel{margin:0 4px 10px;padding:18px 0}}
      `}</style>

      <div style={{ maxWidth: "1040px", margin: "0 auto" }}>
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 8vw, 72px)", lineHeight: 0.95 }}>Member Sightings</h1>
          <p style={{ maxWidth: 720, color: "rgba(245,237,214,0.68)", fontSize: 17, lineHeight: 1.65 }}>Submit and browse member-reported sightings.</p>
        </motion.div>


        <div className="sighting-mode-shell">
          <button type="button" className={`sighting-tab ${activeTab === "submit" ? "active" : ""}`} onClick={() => setActiveTab("submit")}>Submit</button>
          <button type="button" className={`sighting-tab ${activeTab === "feed" ? "active" : ""}`} onClick={() => setActiveTab("feed")}>Feed</button>
        </div>

        {activeTab === "submit" ? (
          <section style={{ borderRadius: "var(--radius-feature)", background: "var(--surface-soft)", padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,0.24)" }}>
            {isLimitedFeedPreview ? <div className="sighting-empty-panel" style={{ margin: "0 0 18px", textAlign: "center" }}><strong>Help the community scout</strong><span>Free members can post sightings. Upgrade when you want the full member feed and alert stack.</span></div> : null}
            <div style={{ display: "grid", gap: 14 }}>
              <section className="sighting-step-card" data-complete={Boolean(selectedBottleId || (isManualBottle && manualBottleConfirmed))}>
                <div className="sighting-step-head"><span className="sighting-step-number">01</span><div><strong>Bottle</strong><span>Search first. If we do not have it yet, add the bottle name and keep going.</span></div></div>
                <label style={{ display: "block" }}><span className="sighting-label">Bottle name</span><div className="sighting-input-wrap"><Search size={16} /><input value={bottleQuery} onChange={(e) => { setBottleQuery(e.target.value); setSelectedBottleId(""); setManualBottleConfirmed(false); }} placeholder="Try Blanton’s, EHT, RR13, Weller Full Proof…" /></div>{bottleMatches.length > 0 && !selectedBottleId ? <div className="sighting-suggestions">{bottleMatches.map((bottle) => <button key={bottle.id} type="button" onClick={() => { setBottleQuery(bottle.name); setSelectedBottleId(bottle.id); setManualBottleConfirmed(false); setSelectedBottleTier(bottle.tier || "limited"); }}>{bottle.name}<span>{[bottle.distillery, bottle.tier ? `${tierLabel(bottle.tier)} bottle` : null].filter(Boolean).join(" · ")}</span></button>)}</div> : null}</label>
                {isManualBottle ? <div className="manual-review-box" data-confirmed={manualBottleConfirmed}><strong>{manualBottleConfirmed ? "New bottle ready" : "Bottle not found yet"}</strong><p>{manualBottleConfirmed ? `“${bottleQuery.trim()}” will be added with this sighting so it can improve future searches and reports.` : "If this is the right name, confirm it as a new bottle before moving on."}</p><button type="button" className={`manual-bottle-action ${manualBottleConfirmed ? "confirmed" : ""}`} onClick={() => setManualBottleConfirmed(true)}>{manualBottleConfirmed ? "✓ Using this as a new bottle" : `Use “${bottleQuery.trim()}” as a new bottle`}</button></div> : null}
                {selectedBottleId ? <div className="sighting-selected-pill"><BadgeCheck size={13} /> Bottle matched</div> : null}
              </section>

              <section className="sighting-step-card" data-complete={Boolean(selectedStore || isManualStore)}>
                <div className="sighting-step-head"><span className="sighting-step-number">02</span><div><strong>Store</strong><span>Use location, search by city/name/address, or add a missing store for other members.</span></div></div>
                <label style={{ display: "block", marginBottom: 10 }}><span className="sighting-label">Store search</span><div className="sighting-input-wrap"><MapPin size={16} /><input value={storeQuery} onChange={(e) => { setStoreQuery(e.target.value); setSelectedStore(null); setStoreSuggestionsOpen(true); setActiveStoreIndex(-1); }} onFocus={() => setStoreSuggestionsOpen(true)} onKeyDown={handleStoreSearchKeyDown} placeholder="Store name, city, ZIP, or street" disabled={manualStoreMode} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="sighting-store-suggestions" aria-expanded={!manualStoreMode && storeSuggestionsOpen} aria-activedescendant={storeSuggestionsOpen && activeStoreIndex >= 0 ? `sighting-store-option-${activeStoreIndex}` : undefined} /></div></label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={requestLocation} disabled={manualStoreMode} className="sighting-location-button"><NavigationIcon size={15} /> Use my location</button><button type="button" className="sighting-location-button" onClick={() => { setManualStoreMode((current) => !current); setSelectedStore(null); }}>{manualStoreMode ? "Back to store search" : "Can’t find the store? Add it"}</button></div>{geoStatus ? <p style={{ color: "rgba(245,237,214,0.48)", fontSize: 12, margin: "8px 0 0" }}>{geoStatus}</p> : null}
                {manualStoreMode ? (
                  <div className="manual-review-box">
                    <strong>Add a missing store</strong>
                    <p>Help other members by adding a location we do not have yet. The more detail you add, the easier it is to reuse for future sightings.</p>
                    <input className="sighting-plain-input" value={storeQuery} onChange={(e) => setStoreQuery(e.target.value)} placeholder="Store name" />
                    <input className="sighting-plain-input" value={manualStoreAddress} onChange={(e) => setManualStoreAddress(e.target.value)} placeholder="Street address · optional but helpful" />
                    <div className="manual-grid"><input className="sighting-plain-input" value={manualStoreCity} onChange={(e) => setManualStoreCity(e.target.value)} placeholder="City" /><input className="sighting-plain-input" value={manualStoreState} onChange={(e) => setManualStoreState(e.target.value.toUpperCase().slice(0, 2))} placeholder="State" /></div>
                    <input className="sighting-plain-input" value={manualStoreZip} onChange={(e) => setManualStoreZip(e.target.value)} placeholder="ZIP · optional" />
                  </div>
                ) : selectedStore ? (
                  <div className="selected-store-card" aria-live="polite">
                    <strong>{storeDisplay(selectedStore)}</strong>
                    <span>{formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip])}</span>
                    <button type="button" onClick={() => { setSelectedStore(null); setStoreQuery(""); setStoreSuggestionsOpen(true); }}>Change store</button>
                  </div>
                ) : storeSuggestionsOpen ? (
                  <div id="sighting-store-suggestions" role="listbox" className="sighting-suggestions" style={{ marginTop: 12 }}>
                    {storesLoading ? <div className="sighting-empty">Loading the complete store directory…</div> : null}
                    {!storesLoading && storesError ? <div className="sighting-empty">Store search could not load. <button type="button" onClick={reloadStores}>Try again</button></div> : null}
                    {!storesLoading && !storesError && storeMatches.length === 0 ? <div className="sighting-empty">{storeQuery.trim() ? `No exact stores match “${storeQuery.trim()}” yet.` : `Search ${searchableStoreCount.toLocaleString()} exact stores by name, city, ZIP, or street.`} Not seeing it? Add the store so the community can reuse it.</div> : null}
                    {storeMatches.map((store, index) => <button id={`sighting-store-option-${index}`} key={store.id} role="option" aria-selected={activeStoreIndex === index} className={activeStoreIndex === index ? "selected" : undefined} type="button" onMouseEnter={() => setActiveStoreIndex(index)} onClick={() => selectStore(store)}>{storeDisplay(store)}<span>{formatStoreAddress([store.address, store.city, store.state, store.zip])}</span></button>)}
                  </div>
                ) : null}
              </section>

              <section className="sighting-step-card" data-complete={Boolean(quantityEstimate || price || notes || proofPhoto)}>
                <div className="sighting-step-head"><span className="sighting-step-number">03</span><div><strong>Details</strong><span>Add the quick field intel that helps someone decide whether to make the trip.</span></div></div>
                <span className="sighting-label">Sighting type</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>{([{ value: "seen_in_store", label: "Seen in store" }, { value: "online_social", label: "Online/Social Media" }] as const).map((option) => <button key={option.value} type="button" className={`sighting-location-button ${sightingType === option.value ? "active" : ""}`} onClick={() => setSightingType(option.value)} style={{ width: "100%", justifyContent: "flex-start", borderColor: sightingType === option.value ? "rgba(196,148,58,.36)" : undefined, background: sightingType === option.value ? "rgba(196,148,58,.1)" : undefined }}>{option.label}</button>)}</div>
                <div className="sighting-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label><span className="sighting-label">Quantity estimate</span><input className="sighting-plain-input" value={quantityEstimate} onChange={(e) => setQuantityEstimate(e.target.value)} placeholder="e.g. 3 bottles" /></label><label><span className="sighting-label">Price</span><input className="sighting-plain-input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" /></label></div>
                <label style={{ display: "block", marginTop: 12 }}><span className="sighting-label">Notes</span><textarea className="sighting-plain-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: shelf location, purchase limit, social post context…" rows={4} /></label>
                <label style={{ display: "block", marginTop: 12 }}><span className="sighting-label">Photo · optional</span><input className="sighting-plain-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setProofPhoto(e.target.files?.[0] || null)} /></label>
                {proofPhoto ? <p style={{ color: "rgba(203,255,225,.82)", fontSize: 12, lineHeight: 1.5, margin: "8px 0 0" }}>Photo selected: {proofPhoto.name}. It will be uploaded before the sighting is marked complete.</p> : null}
                <p style={{ color: "rgba(245,237,214,.46)", fontSize: 12, lineHeight: 1.5, margin: "8px 0 0" }}>A clear shelf or receipt photo can make the report more useful. Keep faces and personal info out of frame when possible.</p>
              </section>

              <section className="sighting-step-card" data-complete={Boolean(bottleQuery.trim() && (selectedStore || isManualStore))}>
                <div className="sighting-step-head"><span className="sighting-step-number">04</span><div><strong>Submit</strong><span>We’ll add the report to the member feed and use new bottle/store info to strengthen Bourbon Signal.</span></div></div>
                {submitError ? <div style={{ color: "#ffb4a3", marginTop: 12, fontSize: 13 }}>{submitError}</div> : null}{saved ? <div style={{ color: "var(--color-accent-amber)", marginTop: 12, fontSize: 13 }}>Sighting saved. It now appears in the member feed.</div> : null}
                <button type="button" onClick={submit} disabled={saving || !canSubmitSightings} className="sighting-submit"><Send size={16} /> {saving ? "Saving…" : "Submit sighting"}</button>
              </section>
            </div>
          </section>
        ) : (
          <section className="sighting-feed-shell">
            <div className="sighting-feed-top">
              <span className="sighting-feed-count">{isLimitedFeedPreview && typeof previewLimit === "number" ? `${Math.min(filteredSightings.length, previewLimit)} of ${totalSightings} recent member reports` : `${filteredSightings.length} member ${filteredSightings.length === 1 ? "report" : "reports"}`}</span>
              <SightingDropdown label="State" value={stateFilter} options={sightingStateOptions} onChange={setStateFilter} />
            </div>
            {loading ? <div className="sighting-card-list"><div className="sighting-loading-card" /><div className="sighting-loading-card" /></div> : null}
            <div className="sighting-card-list">{filteredSightings.map((sighting) => {
              const priceLabel = formatPrice(sighting.price);
              const detailPills = [sighting.quantityEstimate, priceLabel].filter(Boolean);
              const proof = sighting.rewardState?.photoProof;
              const proofUrl = proof?.status !== "rejected" ? (proof?.publicUrl || proof?.url || null) : null;
              return (
                <article key={sighting.id} className="sighting-card">
                  <div className="sighting-card-kicker"><span className="sighting-eyebrow">{sightingTypeLabel(sighting.sightingType)}</span><span className="sighting-time">Reported {formatAgo(sighting.createdAt)}</span></div>
                  <h3 className="sighting-title">{sighting.bottleName}</h3>
                  <div className="sighting-store-line"><MapPin size={15} aria-hidden="true" /><span>{sighting.storeName}</span></div>
                  <p className="sighting-address">{sightingLocationLine(sighting)}{sighting.storeAddress ? ` · ${sighting.storeAddress}` : ""}</p>
                  <div className="sighting-detail-row"><span className={`sighting-detail-pill tier tier-${sighting.rarityTier || "limited"}`}>{tierLabel(sighting.rarityTier)}</span>{proofUrl ? <span className="sighting-detail-pill verified"><BadgeCheck size={12} /> Photo included</span> : null}{sighting.reviewState?.needsBottleReview ? <span className="sighting-detail-pill">New bottle</span> : null}{sighting.reviewState?.needsStoreReview ? <span className="sighting-detail-pill">New store</span> : null}{detailPills.map((pill) => <span key={pill} className="sighting-detail-pill">{pill}</span>)}</div>
                  {proofUrl ? <img className="sighting-proof-photo" src={proofUrl} alt={`Photo for ${sighting.bottleName} sighting`} loading="lazy" /> : null}
                  {sighting.notes ? <div className="sighting-note">“{sighting.notes}”</div> : null}
                  <div className="sighting-bottom"><span className="sighting-tier-line"><span>Member sighting</span></span><div className="sighting-votes"><button type="button" aria-label="Thumbs up this sighting" className={`vote-button ${sighting.myVote === "up" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "up").catch(() => undefined)}><ThumbsUp size={14} /> {sighting.upCount || 0}</button><button type="button" aria-label="Thumbs down this sighting" className={`vote-button ${sighting.myVote === "down" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "down").catch(() => undefined)}><ThumbsDown size={14} /> {sighting.downCount || 0}</button></div></div>
                </article>
              );
            })}</div>
            {isLimitedFeedPreview && totalSightings > filteredSightings.length ? <div className="sighting-empty-panel" style={{ textAlign: "center" }}><strong>Upgrade to see every sighting</strong><span>Free members can preview the two newest reports. Standard Proof and above unlock the full member sightings feed.</span><a href="/pricing" className="sighting-submit" style={{ width: "fit-content", margin: "14px auto 0", textDecoration: "none" }}>Upgrade to see more</a></div> : null}
            {!loading && filteredSightings.length === 0 ? <div className="sighting-empty-panel"><strong>{stateFilter === "ALL" ? "No member sightings yet." : `No ${stateFilter} sightings yet.`}</strong><span>When a member reports a bottle, it will appear here newest-first with its source caveat and voting. Be the first to add useful field intel.</span></div> : null}
          </section>
        )}
      </div>
    </main>
  );
}
