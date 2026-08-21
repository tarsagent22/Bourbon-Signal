"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { MapPin, Send, X } from "lucide-react";
import { useBottles } from "@/hooks/useBottles";
import { useStores, type Store } from "@/hooks/useStores";
import type { Bottle } from "@/data/bottles";
import { mergeSightingBottleSuggestions, searchSightingBottles } from "@/lib/sighting-bottle-search";
import { buildSightingStoreSearchIndex, searchSightingStoreIndex } from "@/lib/sighting-store-search";
import { formatStoreAddress, makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType } from "@/lib/sightings";

function storeLabel(store: Store) {
  return store.displayLabel || store.name || store.address || [store.city, store.state].filter(Boolean).join(", ");
}

function asComposerBottle(value: unknown): Bottle | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id || "").trim();
  const name = String(item.canonicalName || item.name || "").trim();
  if (!id || !name) return null;
  const availability = String(item.availability || item.tier || "").toLowerCase();
  return {
    id,
    name,
    canonical_name: name,
    aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
    distillery: String(item.producer || item.distillery || ""),
    tier: availability === "unicorn" ? "unicorn" : availability === "allocated" || availability === "highly_allocated" ? "allocated" : "limited",
    msrp: typeof item.msrp === "number" && Number.isFinite(item.msrp) ? item.msrp : 0,
  };
}

function BottleSignalIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M13 5.5h6M14 5.5v5.2l-2.8 3.7v10.1c0 1.1.9 2 2 2h5.6c1.1 0 2-.9 2-2V14.4L18 10.7V5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.1 17.2h5.8M13.1 22.7h5.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".72" />
      <path d="M8.8 12.2a5.3 5.3 0 0 0 0 7.6M5.8 9.2a9.5 9.5 0 0 0 0 13.6M23.2 12.2a5.3 5.3 0 0 1 0 7.6M26.2 9.2a9.5 9.5 0 0 1 0 13.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type AddSighting = (sighting: MemberSighting) => Promise<{ sighting: MemberSighting; created: boolean }>;

export default function InlineSignalComposer({
  isSignedIn,
  canSubmit,
  signIn,
  addSighting,
  saving,
  defaultState,
}: {
  isSignedIn: boolean;
  canSubmit: boolean;
  signIn: () => void;
  addSighting: AddSighting;
  saving: boolean;
  defaultState?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [bottleName, setBottleName] = useState("");
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState(defaultState || "");
  const manualStateEdited = useRef(false);
  const revealTimers = useRef<number[]>([]);
  const catalogRequestId = useRef(0);
  const [manualAddress, setManualAddress] = useState("");
  const [manualZip, setManualZip] = useState("");
  const [sightingType, setSightingType] = useState<SightingType>("seen_in_store");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeSearch, setActiveSearch] = useState<"bottle" | "store" | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [catalogBottles, setCatalogBottles] = useState<Bottle[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const { bottles, loading: bottlesLoading } = useBottles(open && isSignedIn);
  const { stores, loading: storesLoading } = useStores(open && isSignedIn);
  const storeSearchIndex = useMemo(() => buildSightingStoreSearchIndex(stores), [stores]);

  const storeMatches = useMemo(
    () => selectedStore ? [] : searchSightingStoreIndex(storeSearchIndex, storeQuery, { limit: 4 }) as Store[],
    [selectedStore, storeQuery, storeSearchIndex],
  );
  const bottleMatches = useMemo(() => {
    if (selectedBottle) return [];
    const authoritative = catalogBottles.slice(0, 4);
    const immediate = searchSightingBottles(bottles, bottleName, { limit: 4 });
    return mergeSightingBottleSuggestions(immediate, authoritative, 4);
  }, [bottleName, bottles, catalogBottles, selectedBottle]);

  useEffect(() => {
    const requestId = ++catalogRequestId.current;
    const query = bottleName.trim();
    if (!open || !isSignedIn || selectedBottle || activeSearch !== "bottle" || query.length < 2) {
      setCatalogBottles([]);
      setCatalogLoading(false);
      return;
    }
    const controller = new AbortController();
    setCatalogBottles([]);
    setCatalogLoading(true);
    const timeout = window.setTimeout(() => {
      fetch(`/api/bottle-check?q=${encodeURIComponent(query)}&intent=suggest-authoritative`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (controller.signal.aborted || requestId !== catalogRequestId.current) return;
          if (!payload) return setCatalogBottles([]);
          const values = [payload.bottle, ...(Array.isArray(payload.suggestions) ? payload.suggestions : [])];
          const seen = new Set<string>();
          setCatalogBottles(values.map(asComposerBottle).filter((bottle): bottle is Bottle => {
            if (!bottle || seen.has(bottle.id)) return false;
            seen.add(bottle.id);
            return true;
          }));
        })
        .catch((fetchError) => {
          if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
          if (requestId !== catalogRequestId.current) return;
          setCatalogBottles([]);
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === catalogRequestId.current) setCatalogLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeSearch, bottleName, isSignedIn, open, selectedBottle]);

  useEffect(() => {
    if (!selectedStore && !manualStateEdited.current) setManualState(defaultState || "");
  }, [defaultState, selectedStore]);

  const selectStore = (store: Store) => {
    setSelectedStore(store);
    setStoreQuery(storeLabel(store));
    setManualCity("");
    setManualState("");
    manualStateEdited.current = false;
    setManualAddress("");
    setManualZip("");
    setActiveSearch(null); setHighlightedIndex(-1);
  };

  const selectBottle = (bottle: Bottle) => {
    setSelectedBottle(bottle);
    setBottleName(bottle.name);
    setActiveSearch(null); setHighlightedIndex(-1);
  };

  const reset = () => {
    setBottleName("");
    setSelectedBottle(null);
    setStoreQuery("");
    setSelectedStore(null);
    setManualCity("");
    setManualState(defaultState || "");
    manualStateEdited.current = false;
    setManualAddress("");
    setManualZip("");
    setQuantity("");
    setPrice("");
    setNotes("");
    setActiveSearch(null); setHighlightedIndex(-1);
  };

  const expandPost = () => {
    if (!isSignedIn) return;
    setError(null);
    setSuccess(null);
    setOpen(true);
  };

  const revealFocusedField = (element: HTMLElement, reserveBelow = 24) => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    revealTimers.current.forEach((timer) => window.clearTimeout(timer));
    const reveal = () => {
      if (!document.body.contains(element) || document.activeElement !== element) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const bounds = element.getBoundingClientRect();
      if (bounds.top >= 76 && bounds.bottom + reserveBelow <= viewportHeight - 12) return;
      element.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
    };
    revealTimers.current = [window.setTimeout(reveal, 80), window.setTimeout(reveal, 320)];
  };

  const focusSearch = (search: "bottle" | "store", element: HTMLInputElement) => {
    if (!isSignedIn) return;
    expandPost();
    setActiveSearch(search);
    setHighlightedIndex(-1);
    revealFocusedField(element, 208);
  };

  const dismissSearchOnBlur = (event: FocusEvent<HTMLElement>) => {
    const field = event.currentTarget.closest(".inline-signal-starter-field");
    const next = event.relatedTarget;
    if (next instanceof Node && field?.contains(next)) return;
    revealTimers.current.forEach((timer) => window.clearTimeout(timer));
    revealTimers.current = [];
    setActiveSearch(null); setHighlightedIndex(-1);
  };

  const dismissSearchOnEscape = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    setActiveSearch(null); setHighlightedIndex(-1);
    event.currentTarget.blur();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>, search: "bottle" | "store") => {
    if (event.key === "Escape") return dismissSearchOnEscape(event);
    const options = search === "bottle" ? bottleMatches : storeMatches;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setActiveSearch(search);
      setHighlightedIndex((current) => {
        if (event.key === "ArrowDown") return current < options.length - 1 ? current + 1 : 0;
        return current > 0 ? current - 1 : options.length - 1;
      });
      return;
    }
    if (event.key === "Enter" && highlightedIndex >= 0 && options[highlightedIndex]) {
      event.preventDefault();
      if (search === "bottle") selectBottle(options[highlightedIndex] as Bottle);
      else selectStore(options[highlightedIndex] as Store);
    }
  };

  useEffect(() => {
    if (!activeSearch || highlightedIndex < 0) return;
    document.getElementById(`inline-${activeSearch}-option-${highlightedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeSearch, highlightedIndex]);

  const beginPost = () => {
    if (!isSignedIn) {
      signIn();
      return;
    }
    expandPost();
  };

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!isSignedIn) return signIn();
    if (!canSubmit) return setError("Sign in to post a Signal.");
    const bottle = bottleName.trim();
    const manualStoreName = storeQuery.trim();
    if (!bottle) return setError("Add the bottle name.");
    if (!selectedStore && (!manualStoreName || !manualCity.trim() || !manualState.trim())) {
      return setError("Select an exact store, or add the store name, city, and state.");
    }
    const storeName = selectedStore ? storeLabel(selectedStore) : manualStoreName;
    const storeCity = selectedStore?.city || manualCity.trim();
    const storeState = (selectedStore?.state || manualState).trim().toUpperCase();
    const storeZip = selectedStore?.zip || manualZip.trim();
    const storeAddress = selectedStore
      ? formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip])
      : formatStoreAddress([manualAddress.trim(), storeCity, storeState, storeZip]);
    const parsedPrice = price.trim() ? Number(price) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) return setError("Add a valid price or leave it blank.");

    const sighting: MemberSighting = {
      id: makeSightingId(),
      bottleName: bottle,
      bottleId: selectedBottle?.id || normalizeBottleKey(bottle),
      rarityTier: selectedBottle?.tier === "unicorn" || selectedBottle?.tier === "allocated" ? selectedBottle.tier : "limited",
      storeId: selectedStore?.id || `manual-store-${normalizeBottleKey([storeName, storeCity, storeState].join(" "))}`,
      storeName,
      storeAddress,
      storeCity,
      storeState,
      storeZip,
      quantityEstimate: quantity.trim() || undefined,
      price: parsedPrice,
      notes: notes.trim() || undefined,
      source: "custom",
      sightingType,
      reviewState: {
        needsBottleReview: !selectedBottle,
        needsStoreReview: !selectedStore,
        manualBottleName: !selectedBottle ? bottle : undefined,
        manualStoreName: !selectedStore ? storeName : undefined,
        manualStoreAddress: !selectedStore ? manualAddress.trim() || undefined : undefined,
        manualStoreCity: !selectedStore ? storeCity : undefined,
        manualStoreState: !selectedStore ? storeState : undefined,
        manualStoreZip: !selectedStore ? storeZip || undefined : undefined,
      },
      createdAt: new Date().toISOString(),
    };

    try {
      const result = await addSighting(sighting);
      setSuccess(result.created ? "Signal posted. It is now in the feed." : "That Signal was already reported recently.");
      reset();
      if (result.created) window.setTimeout(() => setOpen(false), 900);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to post this Signal. Please try again.");
    }
  };

  return (
    <section className={`inline-signal-composer ${open ? "open" : ""}`} aria-label="Post a Signal">
      <style>{`
        .inline-signal-composer{width:100%;max-width:100%;min-width:0;margin:0 0 26px;border:1px solid rgba(196,148,58,.24);border-radius:17px;background:linear-gradient(135deg,rgba(196,148,58,.11),rgba(14,10,7,.92) 62%);padding:13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 12px 30px rgba(0,0,0,.14)}
        .inline-signal-heading{display:flex;align-items:center;gap:10px;margin-bottom:11px;color:var(--color-cream)}
        .inline-signal-launch-icon{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border:1px solid rgba(232,201,122,.24);border-radius:13px;background:rgba(196,148,58,.13);color:rgba(232,201,122,.96)}
        .inline-signal-heading-copy{min-width:0;flex:1}.inline-signal-heading strong{display:block;font-family:var(--font-dm-sans);font-size:14px;font-weight:850}.inline-signal-heading-copy>span{display:block;margin-top:2px;color:rgba(245,237,214,.52);font-size:12px;line-height:1.35}
        .inline-signal-close{display:grid;place-items:center;width:30px;height:30px;flex:0 0 auto;border:1px solid rgba(245,237,214,.1);border-radius:999px;background:rgba(245,237,214,.035);color:rgba(245,237,214,.62);cursor:pointer}
        .inline-signal-starter{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.18fr) auto;gap:8px;align-items:center}
        .inline-signal-starter-field{position:relative;min-width:0;scroll-margin-top:88px}.inline-signal-starter-field>svg{position:absolute;left:11px;top:21px;transform:translateY(-50%);color:rgba(245,237,214,.34);pointer-events:none}
        .inline-signal-starter-input{width:100%;height:42px;min-width:0;scroll-margin-top:88px;border:1px solid rgba(245,237,214,.11);border-radius:999px;background:rgba(7,5,4,.55);color:var(--color-cream);font:650 12px var(--font-dm-sans);padding:0 13px;outline:none}.inline-signal-starter-input.store{padding-left:33px}.inline-signal-starter-input:focus{border-color:rgba(196,148,58,.42);box-shadow:0 0 0 3px rgba(196,148,58,.07)}
        .inline-signal-post-start{height:42px;border:1px solid rgba(232,201,122,.34);border-radius:999px;background:linear-gradient(180deg,rgba(214,164,55,.95),rgba(178,124,25,.95));color:#161008;padding:0 17px;font:900 12px var(--font-dm-sans);cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.16)}
        .inline-signal-form{display:grid;gap:12px;margin-top:13px;padding-top:13px;border-top:1px solid rgba(245,237,214,.07)}
        .inline-signal-section-heading{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 10px;min-width:0;color:rgba(232,201,122,.88);font:850 10px var(--font-jetbrains);letter-spacing:.08em;text-transform:uppercase}.inline-signal-section-heading span{min-width:0;color:rgba(245,237,214,.38);font:600 10px var(--font-dm-sans);letter-spacing:0;text-transform:none}
        .inline-signal-field{display:grid;gap:6px}.inline-signal-field>span{font-family:var(--font-jetbrains);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase;color:rgba(245,237,214,.42)}
        .inline-signal-input{width:100%;min-width:0;scroll-margin-top:88px;border:1px solid rgba(245,237,214,.11);border-radius:11px;background:rgba(7,5,4,.48);color:var(--color-cream);font:600 13px var(--font-dm-sans);padding:11px 12px;outline:none}.inline-signal-input:focus{border-color:rgba(196,148,58,.36)}
        .inline-signal-choice-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}.inline-signal-choice{min-width:0;white-space:normal;border:1px solid rgba(245,237,214,.09);border-radius:11px;background:rgba(245,237,214,.025);color:rgba(245,237,214,.62);font:750 12px var(--font-dm-sans);padding:10px 7px;cursor:pointer}.inline-signal-choice.active{border-color:rgba(196,148,58,.3);background:rgba(196,148,58,.1);color:var(--color-cream)}
        .inline-signal-search-panel{position:absolute;top:calc(100% + 7px);left:0;right:0;z-index:30;display:grid;gap:5px;max-height:246px;overflow-y:auto;overscroll-behavior:contain;border:1px solid rgba(196,148,58,.22);border-radius:13px;background:rgba(13,9,7,.98);padding:6px;box-shadow:0 16px 34px rgba(0,0,0,.42)}.inline-signal-search-panel button{border:1px solid rgba(245,237,214,.08);border-radius:10px;background:rgba(245,237,214,.025);color:var(--color-cream);padding:10px;text-align:left;cursor:pointer;font:750 12px var(--font-dm-sans)}.inline-signal-search-panel button[aria-selected="true"]{border-color:rgba(196,148,58,.38);background:rgba(196,148,58,.13)}.inline-signal-search-panel small{display:block;margin-top:3px;color:rgba(245,237,214,.46);font-weight:500;line-height:1.35}.inline-signal-search-status{margin:0;padding:8px 9px;color:rgba(245,237,214,.52);font-size:12px;line-height:1.4}
        .inline-signal-selected{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border:1px solid rgba(83,211,146,.18);border-radius:11px;background:rgba(83,211,146,.06);padding:10px;color:rgba(218,255,233,.86);font-size:12px}.inline-signal-selected button{border:0;background:transparent;color:rgba(232,201,122,.9);font-weight:800;cursor:pointer}
        .inline-signal-manual{display:grid;grid-template-columns:1fr 84px;gap:8px}.inline-signal-manual .wide{grid-column:1/-1}
        .inline-signal-details{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inline-signal-details .wide{grid-column:1/-1}
        .inline-signal-submit{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;border:1px solid rgba(196,148,58,.34);border-radius:999px;background:rgba(196,148,58,.13);color:var(--color-cream);font:850 13px var(--font-dm-sans);padding:11px 15px;cursor:pointer}.inline-signal-submit:disabled{opacity:.6;cursor:progress}
        .inline-signal-message{margin:0;font-size:12px;line-height:1.5}.inline-signal-message.error{color:#ffb4a3}.inline-signal-message.success{color:rgba(203,255,225,.9)}
        @media(max-width:767px){.inline-signal-starter-input,.inline-signal-input{font-size:16px}}
        @media(max-width:620px){.inline-signal-composer{margin-bottom:30px;padding:14px}.inline-signal-starter{grid-template-columns:minmax(0,1fr);gap:10px}.inline-signal-starter-field,.inline-signal-starter-input,.inline-signal-input{max-width:100%}.inline-signal-starter-input{height:46px}.inline-signal-starter-field>svg{top:23px}.inline-signal-post-start{width:100%;height:44px}.inline-signal-search-panel{position:relative;top:auto;left:auto;right:auto;z-index:4;max-height:min(184px,30dvh);margin-top:7px}.inline-signal-section-heading span{flex-basis:100%}.inline-signal-manual,.inline-signal-details{grid-template-columns:minmax(0,1fr)}.inline-signal-manual .wide,.inline-signal-details .wide{grid-column:auto}}
      `}</style>
      <div className="inline-signal-heading">
        <span className="inline-signal-launch-icon"><BottleSignalIcon /></span>
        <span className="inline-signal-heading-copy"><strong>Post a Signal</strong><span>Share a bottle and where you found it.</span></span>
        {open ? <button type="button" className="inline-signal-close" aria-label="Close composer" onClick={() => { setOpen(false); setActiveSearch(null); setHighlightedIndex(-1); }}><X size={15} /></button> : null}
      </div>
      <div className="inline-signal-starter">
        <div className="inline-signal-starter-field" onBlur={dismissSearchOnBlur}>
          <input className="inline-signal-starter-input" value={bottleName} onFocus={(event) => focusSearch("bottle", event.currentTarget)} onKeyDown={(event) => handleSearchKeyDown(event, "bottle")} onChange={(event) => { expandPost(); setBottleName(event.target.value); setSelectedBottle(null); setActiveSearch("bottle"); setHighlightedIndex(-1); }} placeholder="What bottle did you find?" aria-label="Bottle found" aria-required="true" aria-autocomplete="list" aria-controls="inline-bottle-matches" aria-expanded={!selectedBottle && open && activeSearch === "bottle" && bottleName.trim().length >= 2} aria-activedescendant={activeSearch === "bottle" && highlightedIndex >= 0 ? `inline-bottle-option-${highlightedIndex}` : undefined} autoComplete="off" />
          {!selectedBottle && open && activeSearch === "bottle" && bottleName.trim().length >= 2 ? <div id="inline-bottle-matches" className="inline-signal-search-panel" aria-label="Bottle matches" role="listbox">
            {bottleMatches.map((bottle, index) => <button id={`inline-bottle-option-${index}`} key={bottle.id} type="button" role="option" aria-selected={highlightedIndex === index} onMouseEnter={() => setHighlightedIndex(index)} onPointerDown={(event) => event.preventDefault()} onClick={() => selectBottle(bottle)}>{bottle.name}<small>{[bottle.distillery, bottle.tier].filter(Boolean).join(" · ")}</small></button>)}
            {bottlesLoading || catalogLoading ? <p className="inline-signal-search-status">Loading bottle suggestions…</p> : null}
            {!bottlesLoading && !catalogLoading && !bottleMatches.length ? <p className="inline-signal-search-status">No catalog match yet. You can keep the name as typed.</p> : null}
          </div> : null}
        </div>
        <div className="inline-signal-starter-field" onBlur={dismissSearchOnBlur}>
          <MapPin size={14} />
          <input className="inline-signal-starter-input store" value={storeQuery} onFocus={(event) => focusSearch("store", event.currentTarget)} onKeyDown={(event) => handleSearchKeyDown(event, "store")} onChange={(event) => { expandPost(); setStoreQuery(event.target.value); setSelectedStore(null); setActiveSearch("store"); setHighlightedIndex(-1); }} placeholder="Search store, city, ZIP, or street" aria-label="Store search" aria-required="true" aria-autocomplete="list" aria-controls="inline-store-matches" aria-expanded={!selectedStore && open && activeSearch === "store" && storeQuery.trim().length >= 2} aria-activedescendant={activeSearch === "store" && highlightedIndex >= 0 ? `inline-store-option-${highlightedIndex}` : undefined} autoComplete="off" />
          {!selectedStore && open && activeSearch === "store" && storeQuery.trim().length >= 2 ? <div id="inline-store-matches" className="inline-signal-search-panel" aria-label="Exact store matches" role="listbox">
            {storeMatches.map((store, index) => <button id={`inline-store-option-${index}`} key={store.id} type="button" role="option" aria-selected={highlightedIndex === index} onMouseEnter={() => setHighlightedIndex(index)} onPointerDown={(event) => event.preventDefault()} onClick={() => selectStore(store)}>{storeLabel(store)}<small>{formatStoreAddress([store.address, store.city, store.state, store.zip])}</small></button>)}
            {storesLoading ? <p className="inline-signal-search-status">Loading store suggestions…</p> : null}
            {!storesLoading && !storeMatches.length ? <p className="inline-signal-search-status">No exact store found. Add the store, city, and state below.</p> : null}
          </div> : null}
        </div>
        {!open ? <button type="button" className="inline-signal-post-start" onClick={beginPost}>Post</button> : null}
      </div>
      {open ? (
        <div className="inline-signal-form">
          <div className="inline-signal-section-heading">Required to post <span>Just a few more details</span></div>
          <div className="inline-signal-field"><span>Signal type</span><div className="inline-signal-choice-row"><button type="button" className={`inline-signal-choice ${sightingType === "seen_in_store" ? "active" : ""}`} onClick={() => setSightingType("seen_in_store")}>Seen in store</button><button type="button" className={`inline-signal-choice ${sightingType === "online_social" ? "active" : ""}`} onClick={() => setSightingType("online_social")}>Online / social</button></div></div>
          {selectedStore ? <div className="inline-signal-selected"><span><strong>{storeLabel(selectedStore)}</strong><br />{formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip])}</span><button type="button" onClick={() => { setSelectedStore(null); setStoreQuery(""); }}>Change</button></div> : (
            <div className="inline-signal-manual"><input className="inline-signal-input" value={manualCity} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setManualCity(event.target.value)} placeholder="City · required" /><input className="inline-signal-input" value={manualState} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => { manualStateEdited.current = true; setManualState(event.target.value.toUpperCase().slice(0, 2)); }} placeholder="State · required" /><input className="inline-signal-input wide" value={manualAddress} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setManualAddress(event.target.value)} placeholder="Street address · optional" /><input className="inline-signal-input wide" value={manualZip} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setManualZip(event.target.value)} placeholder="ZIP · optional" /></div>
          )}
          <div className="inline-signal-section-heading">Optional details <span>Helpful context for other members</span></div>
          <div className="inline-signal-details"><input className="inline-signal-input" value={quantity} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity estimate · optional" /><input className="inline-signal-input" type="number" inputMode="decimal" min="0" value={price} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setPrice(event.target.value)} placeholder="Price · optional" /><textarea className="inline-signal-input wide" rows={3} value={notes} onFocus={(event) => revealFocusedField(event.currentTarget)} onChange={(event) => setNotes(event.target.value)} placeholder="Notes · shelf location, purchase limit, or useful context" /></div>
          {error ? <p className="inline-signal-message error">{error}</p> : null}
          {success ? <p className="inline-signal-message success" aria-live="polite">{success}</p> : null}
          <button type="button" className="inline-signal-submit" onClick={submit} disabled={saving}><Send size={15} />{saving ? "Posting…" : "Post Signal"}</button>
        </div>
      ) : null}
    </section>
  );
}
