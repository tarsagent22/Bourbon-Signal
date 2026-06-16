"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, MapPin, Navigation as NavigationIcon, Search, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Bottle } from "@/data/bottles";
import { useBottles } from "@/hooks/useBottles";
import { useStores, type Store } from "@/hooks/useStores";
import { useSightings } from "@/hooks/useSightings";
import { formatStoreAddress, makeSightingId, normalizeBottleKey, sightingTypeLabel, type MemberSighting, type SightingType } from "@/lib/sightings";

function norm(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distanceMiles(a?: { lat: number; lng: number } | null, b?: { lat?: number; lng?: number }) {
  if (!a || b?.lat == null || b?.lng == null) return Number.POSITIVE_INFINITY;
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = ((b.lat || 0) * Math.PI) / 180;
  const c = 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2));
  return r * c;
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
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const { isSignedIn, signIn } = useAuth();
  const { bottles } = useBottles();
  const { stores, loading: storesLoading } = useStores();
  const { sightings, states, addSighting, voteSighting, saving, loading } = useSightings(isSignedIn);

  const [activeTab, setActiveTab] = useState<"submit" | "feed">("submit");
  const [sightingType, setSightingType] = useState<SightingType>("seen_in_store");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [bottleQuery, setBottleQuery] = useState(searchParams.get("bottle") || "");
  const [selectedBottleId, setSelectedBottleId] = useState(searchParams.get("bottleId") || "");
  const [selectedBottleTier, setSelectedBottleTier] = useState<MemberSighting["rarityTier"]>("limited");
  const [storeQuery, setStoreQuery] = useState(searchParams.get("store") || "");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [quantityEstimate, setQuantityEstimate] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState<MemberSighting | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bottleCheckMatches, setBottleCheckMatches] = useState<Bottle[]>([]);

  useEffect(() => {
    const bottle = searchParams.get("bottle");
    if (bottle) setBottleQuery(bottle);
    const store = searchParams.get("store");
    if (store) setStoreQuery(store);
  }, [searchParams]);

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
    const needle = norm(bottleQuery);
    if (!needle) return [];
    const matches = bottles.filter((bottle) => [bottle.name, bottle.canonical_name, bottle.canonical_id, ...(bottle.aliases || []), ...(bottle.search_aliases || [])].some((value) => norm(value).includes(needle) || needle.includes(norm(value))));
    const byId = new Map<string, Bottle>();
    [...matches, ...bottleCheckMatches].forEach((bottle) => {
      const key = bottle.id || bottle.canonical_id || bottle.name;
      if (key && !byId.has(key)) byId.set(key, bottle);
    });
    return Array.from(byId.values()).slice(0, 7);
  }, [bottleQuery, bottles, bottleCheckMatches]);

  const storeMatches = useMemo(() => {
    const needle = norm(storeQuery);
    return stores
      .filter((store) => store.precision === "store" && (store.searchable ?? true))
      .map((store) => {
        const searchable = norm([store.name, store.displayLabel, store.address, store.city, store.county, store.zip, store.state].filter(Boolean).join(" "));
        return { store, searchable, score: (needle && !searchable.includes(needle) ? 25 : 0) + Math.min(distanceMiles(geo, store), 250) };
      })
      .filter(({ searchable }) => (!needle ? Boolean(geo) : searchable.includes(needle)))
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map(({ store }) => store);
  }, [stores, storeQuery, geo]);

  const exactAddress = selectedStore ? formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip]) : "Select an exact store to show the address on the sighting card.";
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
    if (!isSignedIn) return signIn();
    const bottleName = bottleQuery.trim();
    if (!bottleName) return setSubmitError("Choose or enter a bottle.");
    if (!selectedStore) return setSubmitError("Select an exact store from the suggestions.");
    const sighting: MemberSighting = {
      id: makeSightingId(),
      bottleName,
      bottleId: selectedBottleId || normalizeBottleKey(bottleName),
      rarityTier: selectedBottleTier || "limited",
      storeId: selectedStore.id,
      storeName: storeDisplay(selectedStore),
      storeAddress: exactAddress,
      storeCity: selectedStore.city,
      storeState: selectedStore.state,
      storeZip: selectedStore.zip,
      quantityEstimate: quantityEstimate.trim() || undefined,
      price: price.trim() ? Number(price) : null,
      notes: notes.trim() || undefined,
      source: "custom",
      sightingType,
      createdAt: new Date().toISOString(),
    };
    await addSighting(sighting);
    setSaved(sighting);
    setQuantityEstimate("");
    setPrice("");
    setNotes("");
    setActiveTab("feed");
  };

  if (!isSignedIn) {
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
        .sighting-submit,.sighting-location-button,.sighting-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:1px solid rgba(245,237,214,.12);background:rgba(245,237,214,.04);color:var(--color-cream);font-family:var(--font-dm-sans);font-size:13px;font-weight:800;padding:11px 15px;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease,color .18s ease}
        .sighting-submit{margin-top:18px;width:100%;border-color:rgba(196,148,58,.24);background:rgba(196,148,58,.09)}
        .sighting-location-button{padding:9px 12px;background:rgba(245,237,214,.035);border-color:rgba(245,237,214,.1);color:rgba(245,237,214,.72)}
        .sighting-location-button:hover,.sighting-submit:hover,.sighting-tab:hover{transform:translateY(-1px);border-color:rgba(245,237,214,.2);background:rgba(245,237,214,.06)}
        .sighting-tab{position:relative;border-radius:0;background:transparent;border:0;color:rgba(245,237,214,.48);padding:12px 7px 13px;min-width:86px;letter-spacing:.01em}
        .sighting-tab:after{content:"";position:absolute;left:12px;right:12px;bottom:5px;height:1px;background:transparent;transition:background .18s ease,opacity .18s ease}
        .sighting-tab.active{color:var(--color-cream);background:transparent;box-shadow:none}
        .sighting-tab.active:after{background:rgba(196,148,58,.62)}
        .sighting-empty{color:rgba(245,237,214,.46);font-size:13px}
        .sighting-feed-shell{position:relative;border:1px solid rgba(245,237,214,.07);border-radius:24px;background:linear-gradient(180deg,rgba(16,12,9,.78),rgba(8,6,5,.46));padding:13px 0 0;box-shadow:0 20px 64px rgba(0,0,0,.24);overflow:hidden}
        .sighting-feed-shell:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(245,237,214,.026),transparent 28%);opacity:.8}
        .sighting-mode-shell{position:relative;margin-top:22px;margin-bottom:10px;border:0;border-radius:0;background:transparent;padding:0;display:flex;gap:22px;width:fit-content;max-width:100%}
        .sighting-feed-top{position:relative;display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap;padding:0 16px 12px;border-bottom:1px solid rgba(245,237,214,.055)}
        .sighting-feed-count{display:inline-flex;font-family:var(--font-dm-sans);font-size:13px;font-weight:650;color:rgba(245,237,214,.5)}
        .sighting-menu{position:relative;min-width:172px}
        .sighting-menu > span{display:block;margin-bottom:5px;font-family:var(--font-jetbrains);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(245,237,214,.34)}
        .sighting-menu-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;height:40px;border-radius:12px;border:1px solid rgba(245,237,214,.105);background:rgba(12,9,7,.7);color:rgba(245,237,214,.88);font-family:var(--font-dm-sans);font-size:13px;font-weight:750;padding:9px 11px;outline:none;text-align:left;cursor:pointer;box-shadow:inset 0 1px 0 rgba(245,237,214,.025)}
        .sighting-menu-trigger:hover,.sighting-menu-trigger[aria-expanded="true"]{border-color:rgba(196,148,58,.26);background:rgba(18,13,10,.92);box-shadow:inset 0 1px 0 rgba(245,237,214,.035)}
        .sighting-menu-trigger span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sighting-menu-panel{position:absolute;z-index:40;top:calc(100% + 7px);left:0;right:0;max-height:286px;overflow-y:auto;display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border-radius:15px;border:1px solid rgba(245,237,214,.11);background:rgba(13,10,8,.98);box-shadow:0 18px 40px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.035);scrollbar-color:rgba(245,237,214,.42) rgba(245,237,214,.08);scrollbar-width:thin}
        .sighting-menu-option{min-height:42px;border-radius:11px;border:1px solid rgba(245,237,214,.06);background:rgba(245,237,214,.022);color:rgba(245,237,214,.68);font-family:var(--font-dm-sans);font-size:13px;font-weight:650;text-align:left;padding:9px 11px;cursor:pointer}
        .sighting-menu-option:hover,.sighting-menu-option.active{border-color:rgba(196,148,58,.24);background:rgba(196,148,58,.075);color:var(--color-cream)}
        .sighting-card-list{position:relative;display:grid;gap:11px;padding:12px}
        .sighting-card{position:relative;overflow:hidden;border:1px solid rgba(245,237,214,.08);border-radius:21px;padding:17px;background:linear-gradient(145deg,rgba(23,17,12,.92),rgba(9,7,6,.97));box-shadow:0 16px 42px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.035)}
        .sighting-card:before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:1px;background:rgba(196,148,58,.34);opacity:.7}
        .sighting-card:after{content:none}
        .sighting-card-kicker{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
        .sighting-eyebrow{font-family:var(--font-jetbrains);font-size:9px;text-transform:uppercase;letter-spacing:.11em;color:rgba(206,169,91,.68);font-weight:800}
        .sighting-time{font-family:var(--font-jetbrains);font-size:10px;color:rgba(245,237,214,.42);white-space:nowrap}
        .sighting-title{position:relative;margin:0;font-family:var(--font-playfair);font-size:clamp(23px,6vw,31px);line-height:1.03;letter-spacing:-.01em;color:var(--color-cream);padding-right:10px}
        .sighting-store-line{position:relative;display:flex;align-items:flex-start;gap:8px;margin-top:9px;color:rgba(245,237,214,.76);font-size:14px;line-height:1.45;font-weight:750}
        .sighting-store-line svg{flex:0 0 auto;margin-top:2px;color:rgba(245,237,214,.38)}
        .sighting-address{position:relative;margin:4px 0 0 22px;color:rgba(245,237,214,.42);font-size:12px;line-height:1.45}
        .sighting-detail-row{position:relative;display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
        .sighting-detail-pill{border:1px solid rgba(245,237,214,.075);border-radius:999px;background:rgba(5,4,3,.24);padding:6px 9px;color:rgba(245,237,214,.6);font-family:var(--font-dm-sans);font-size:12px;font-weight:700;line-height:1}
        .sighting-note{position:relative;margin:12px 0 0;padding:11px 13px;border-left:1px solid rgba(245,237,214,.12);background:rgba(5,4,3,.22);border-radius:0 12px 12px 0;color:rgba(245,237,214,.64);font-size:13px;line-height:1.5}
        .sighting-bottom{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:15px;padding-top:12px;border-top:1px solid rgba(245,237,214,.055)}
        .sighting-tier-line{font-family:var(--font-jetbrains);font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:rgba(245,237,214,.38)}
        .sighting-votes{display:flex;align-items:center;gap:6px;margin-left:auto}
        .vote-button{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(245,237,214,.085);background:rgba(245,237,214,.028);color:rgba(245,237,214,.58);font-family:var(--font-jetbrains);font-size:11px;font-weight:800;border-radius:999px;padding:7px 9px;cursor:pointer;transition:border-color .18s ease,background .18s ease,color .18s ease,transform .18s ease}
        .vote-button:hover{transform:translateY(-1px);border-color:rgba(245,237,214,.18);color:rgba(245,237,214,.86);background:rgba(245,237,214,.045)}
        .vote-button.active{border-color:rgba(196,148,58,.32);background:rgba(196,148,58,.085);color:var(--color-cream)}
        .sighting-empty-panel{position:relative;margin:0 14px 14px;padding:20px;border:1px solid rgba(245,237,214,.09);border-radius:18px;background:rgba(5,4,3,.18)}
        .sighting-empty-panel strong{display:block;margin-bottom:5px;color:var(--color-cream);font-family:var(--font-playfair);font-size:22px;font-weight:700}
        .sighting-empty-panel span{display:block;color:rgba(245,237,214,.52);font-size:13px;line-height:1.55}
        .sighting-loading-card{height:156px;border-radius:20px;border:1px solid rgba(245,237,214,.06);background:linear-gradient(100deg,rgba(245,237,214,.026),rgba(245,237,214,.06),rgba(245,237,214,.026));background-size:220% 100%;animation:sightingShimmer 1.4s ease-in-out infinite}
        @keyframes sightingShimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
        @media (prefers-reduced-motion:reduce){.sighting-loading-card{animation:none}.vote-button,.sighting-card,.sighting-location-button,.sighting-submit,.sighting-tab{transition:none!important}}
        @media (max-width:700px){main{padding-left:14px!important;padding-right:14px!important}.sighting-two-col{grid-template-columns:1fr!important}.sighting-mode-shell{gap:18px;margin-top:20px;margin-bottom:9px}.sighting-feed-shell{margin-left:-2px;margin-right:-2px;border-radius:22px;padding-top:12px}.sighting-feed-top{align-items:flex-end;padding:0 13px 11px}.sighting-menu{min-width:150px}.sighting-card-list{padding:10px;gap:10px}.sighting-card{border-radius:19px;padding:16px}.sighting-bottom{align-items:flex-end}.sighting-tier-line{max-width:48%;line-height:1.45}.sighting-votes{gap:5px}.vote-button{padding:7px 8px}.sighting-tab{min-width:auto;padding-left:4px;padding-right:4px}.sighting-card-kicker{align-items:flex-start}.sighting-time{padding-top:1px}.sighting-title{padding-right:0}.sighting-address{margin-left:0}.sighting-detail-pill{font-size:11px}.sighting-empty-panel{margin:0 10px 10px;padding:18px}}
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
          <section style={{ border: "1px solid rgba(245,237,214,0.1)", borderRadius: "0 28px 28px 28px", background: "rgba(245,237,214,0.045)", padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.34)" }}>
            <div className="sighting-two-col" style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 18 }}>
              <div>
                <label style={{ display: "block", marginBottom: 18 }}><span className="sighting-label">Bottle</span><div className="sighting-input-wrap"><Search size={16} /><input value={bottleQuery} onChange={(e) => { setBottleQuery(e.target.value); setSelectedBottleId(""); }} placeholder="Search or type bottle name" /></div>{bottleMatches.length > 0 && !selectedBottleId ? <div className="sighting-suggestions">{bottleMatches.map((bottle) => <button key={bottle.id} type="button" onClick={() => { setBottleQuery(bottle.name); setSelectedBottleId(bottle.id); setSelectedBottleTier(bottle.tier || "limited"); }}>{bottle.name}<span>{bottle.distillery}</span></button>)}</div> : null}</label>
                <label style={{ display: "block", marginBottom: 10 }}><span className="sighting-label">Store</span><div className="sighting-input-wrap"><MapPin size={16} /><input value={storeQuery} onChange={(e) => { setStoreQuery(e.target.value); setSelectedStore(null); }} placeholder="City, ZIP, street, or store name" /></div></label>
                <button type="button" onClick={requestLocation} className="sighting-location-button"><NavigationIcon size={15} /> Use my location</button>{geoStatus ? <p style={{ color: "rgba(245,237,214,0.48)", fontSize: 12, margin: "8px 0 0" }}>{geoStatus}</p> : null}
                <div className="sighting-suggestions" style={{ marginTop: 12 }}>{storesLoading ? <div className="sighting-empty">Loading stores…</div> : null}{!storesLoading && storeMatches.length === 0 ? <div className="sighting-empty">Search by city, ZIP, street, store name, or use your location.</div> : null}{storeMatches.map((store) => <button key={store.id} type="button" className={selectedStore?.id === store.id ? "selected" : ""} onClick={() => { setSelectedStore(store); setStoreQuery(storeDisplay(store)); }}>{storeDisplay(store)}<span>{formatStoreAddress([store.address, store.city, store.state, store.zip])}</span></button>)}</div>
              </div>
              <div>
                <span className="sighting-label">Sighting type</span>
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>{([{ value: "seen_in_store", label: "Seen in store" }, { value: "online_social", label: "Online/Social Media" }] as const).map((option) => <button key={option.value} type="button" className={`sighting-location-button ${sightingType === option.value ? "active" : ""}`} onClick={() => setSightingType(option.value)} style={{ width: "100%", justifyContent: "flex-start", borderColor: sightingType === option.value ? "rgba(196,148,58,.36)" : undefined, background: sightingType === option.value ? "rgba(196,148,58,.1)" : undefined }}>{option.label}</button>)}</div>
                <div className="sighting-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label><span className="sighting-label">Quantity estimate</span><input className="sighting-plain-input" value={quantityEstimate} onChange={(e) => setQuantityEstimate(e.target.value)} placeholder="e.g. 3 bottles" /></label><label><span className="sighting-label">Price</span><input className="sighting-plain-input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" /></label></div>
                <label style={{ display: "block", marginTop: 12 }}><span className="sighting-label">Notes</span><textarea className="sighting-plain-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: purchase limit, shelf location, Facebook group context, etc." rows={4} /></label>
                {submitError ? <div style={{ color: "#ffb4a3", marginTop: 12, fontSize: 13 }}>{submitError}</div> : null}{saved ? <div style={{ color: "var(--color-accent-amber)", marginTop: 12, fontSize: 13 }}>Sighting saved. It now appears in the member feed.</div> : null}
                <button type="button" onClick={submit} disabled={saving} className="sighting-submit"><Send size={16} /> {saving ? "Saving…" : "Submit sighting"}</button>
              </div>
            </div>
          </section>
        ) : (
          <section className="sighting-feed-shell">
            <div className="sighting-feed-top">
              <span className="sighting-feed-count">{filteredSightings.length} member {filteredSightings.length === 1 ? "report" : "reports"}</span>
              <SightingDropdown label="State" value={stateFilter} options={sightingStateOptions} onChange={setStateFilter} />
            </div>
            {loading ? <div className="sighting-card-list"><div className="sighting-loading-card" /><div className="sighting-loading-card" /></div> : null}
            <div className="sighting-card-list">{filteredSightings.map((sighting) => {
              const priceLabel = formatPrice(sighting.price);
              const detailPills = [sighting.quantityEstimate, priceLabel].filter(Boolean);
              return (
                <article key={sighting.id} className="sighting-card">
                  <div className="sighting-card-kicker"><span className="sighting-eyebrow">{sightingTypeLabel(sighting.sightingType)}</span><span className="sighting-time">Reported {formatAgo(sighting.createdAt)}</span></div>
                  <h3 className="sighting-title">{sighting.bottleName}</h3>
                  <div className="sighting-store-line"><MapPin size={15} aria-hidden="true" /><span>{sighting.storeName}</span></div>
                  <p className="sighting-address">{sightingLocationLine(sighting)}{sighting.storeAddress ? ` · ${sighting.storeAddress}` : ""}</p>
                  {detailPills.length > 0 ? <div className="sighting-detail-row">{detailPills.map((pill) => <span key={pill} className="sighting-detail-pill">{pill}</span>)}</div> : null}
                  {sighting.notes ? <div className="sighting-note">“{sighting.notes}”</div> : null}
                  <div className="sighting-bottom"><span className="sighting-tier-line">Member sighting · {tierLabel(sighting.rarityTier)}</span><div className="sighting-votes"><button type="button" aria-label="Thumbs up this sighting" className={`vote-button ${sighting.myVote === "up" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "up").catch(() => undefined)}><ThumbsUp size={14} /> {sighting.upCount || 0}</button><button type="button" aria-label="Thumbs down this sighting" className={`vote-button ${sighting.myVote === "down" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "down").catch(() => undefined)}><ThumbsDown size={14} /> {sighting.downCount || 0}</button></div></div>
                </article>
              );
            })}</div>
            {!loading && filteredSightings.length === 0 ? <div className="sighting-empty-panel"><strong>{stateFilter === "ALL" ? "No member sightings yet." : `No ${stateFilter} sightings yet.`}</strong><span>When a member reports a bottle, it will appear here newest-first with its source caveat and voting. Be the first to add useful field intel.</span></div> : null}
          </section>
        )}
      </div>
    </main>
  );
}
