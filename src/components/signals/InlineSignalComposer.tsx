"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Plus, Send } from "lucide-react";
import { useStores, type Store } from "@/hooks/useStores";
import { buildSightingStoreSearchIndex, searchSightingStoreIndex } from "@/lib/sighting-store-search";
import { formatStoreAddress, makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType } from "@/lib/sightings";

function storeLabel(store: Store) {
  return store.displayLabel || store.name || store.address || [store.city, store.state].filter(Boolean).join(", ");
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
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState(defaultState || "");
  const manualStateEdited = useRef(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualZip, setManualZip] = useState("");
  const [sightingType, setSightingType] = useState<SightingType>("seen_in_store");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { stores, loading: storesLoading } = useStores(open && isSignedIn);
  const storeSearchIndex = useMemo(() => buildSightingStoreSearchIndex(stores), [stores]);

  const storeMatches = useMemo(
    () => selectedStore ? [] : searchSightingStoreIndex(storeSearchIndex, storeQuery, { limit: 6 }) as Store[],
    [selectedStore, storeQuery, storeSearchIndex],
  );

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
  };

  const reset = () => {
    setBottleName("");
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
      bottleId: normalizeBottleKey(bottle),
      rarityTier: "limited",
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
        needsBottleReview: true,
        needsStoreReview: !selectedStore,
        manualBottleName: bottle,
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
        .inline-signal-composer{margin:0 0 16px;border:1px solid rgba(196,148,58,.2);border-radius:17px;background:linear-gradient(135deg,rgba(196,148,58,.09),rgba(14,10,7,.8) 58%);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
        .inline-signal-launch{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;background:transparent;color:var(--color-cream);padding:14px 15px;cursor:pointer;text-align:left}
        .inline-signal-launch-copy{display:flex;align-items:center;gap:11px;min-width:0}.inline-signal-launch-icon{display:grid;place-items:center;width:34px;height:34px;flex:0 0 auto;border-radius:11px;background:rgba(196,148,58,.14);color:rgba(232,201,122,.96)}
        .inline-signal-launch strong{display:block;font-family:var(--font-dm-sans);font-size:14px;font-weight:850}.inline-signal-launch span span{display:block;margin-top:2px;color:rgba(245,237,214,.5);font-size:12px;line-height:1.35}
        .inline-signal-form{display:grid;gap:12px;padding:2px 15px 15px;border-top:1px solid rgba(245,237,214,.06)}
        .inline-signal-field{display:grid;gap:6px}.inline-signal-field>span{font-family:var(--font-jetbrains);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase;color:rgba(245,237,214,.42)}
        .inline-signal-input{width:100%;min-width:0;border:1px solid rgba(245,237,214,.11);border-radius:11px;background:rgba(7,5,4,.48);color:var(--color-cream);font:600 13px var(--font-dm-sans);padding:11px 12px;outline:none}.inline-signal-input:focus{border-color:rgba(196,148,58,.36)}
        .inline-signal-choice-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inline-signal-choice{border:1px solid rgba(245,237,214,.09);border-radius:11px;background:rgba(245,237,214,.025);color:rgba(245,237,214,.62);font:750 12px var(--font-dm-sans);padding:10px;cursor:pointer}.inline-signal-choice.active{border-color:rgba(196,148,58,.3);background:rgba(196,148,58,.1);color:var(--color-cream)}
        .inline-signal-suggestions{display:grid;gap:6px}.inline-signal-suggestions button{border:1px solid rgba(245,237,214,.08);border-radius:11px;background:rgba(245,237,214,.025);color:var(--color-cream);padding:9px 10px;text-align:left;cursor:pointer;font:750 12px var(--font-dm-sans)}.inline-signal-suggestions small{display:block;margin-top:3px;color:rgba(245,237,214,.43);font-weight:500}
        .inline-signal-selected{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border:1px solid rgba(83,211,146,.18);border-radius:11px;background:rgba(83,211,146,.06);padding:10px;color:rgba(218,255,233,.86);font-size:12px}.inline-signal-selected button{border:0;background:transparent;color:rgba(232,201,122,.9);font-weight:800;cursor:pointer}
        .inline-signal-manual{display:grid;grid-template-columns:1fr 84px;gap:8px}.inline-signal-manual .wide{grid-column:1/-1}
        .inline-signal-details{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inline-signal-details .wide{grid-column:1/-1}
        .inline-signal-submit{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;border:1px solid rgba(196,148,58,.34);border-radius:999px;background:rgba(196,148,58,.13);color:var(--color-cream);font:850 13px var(--font-dm-sans);padding:11px 15px;cursor:pointer}.inline-signal-submit:disabled{opacity:.6;cursor:progress}
        .inline-signal-message{margin:0;font-size:12px;line-height:1.5}.inline-signal-message.error{color:#ffb4a3}.inline-signal-message.success{color:rgba(203,255,225,.9)}
        @media(max-width:520px){.inline-signal-manual,.inline-signal-details{grid-template-columns:1fr}.inline-signal-manual .wide,.inline-signal-details .wide{grid-column:auto}}
      `}</style>
      <button
        type="button"
        className="inline-signal-launch"
        onClick={() => {
          if (!isSignedIn) return signIn();
          setOpen((current) => !current);
          setError(null);
          setSuccess(null);
        }}
        aria-expanded={open}
      >
        <span className="inline-signal-launch-copy"><span className="inline-signal-launch-icon"><Plus size={17} /></span><span><strong>Post a Signal</strong><span>Share a bottle sighting with the community.</span></span></span>
        <ChevronDown size={17} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s ease" }} />
      </button>
      {open ? (
        <div className="inline-signal-form">
          <label className="inline-signal-field"><span>Bottle</span><input className="inline-signal-input" value={bottleName} onChange={(event) => setBottleName(event.target.value)} placeholder="Bottle name" autoComplete="off" /></label>
          <div className="inline-signal-field"><span>Signal type</span><div className="inline-signal-choice-row"><button type="button" className={`inline-signal-choice ${sightingType === "seen_in_store" ? "active" : ""}`} onClick={() => setSightingType("seen_in_store")}>Seen in store</button><button type="button" className={`inline-signal-choice ${sightingType === "online_social" ? "active" : ""}`} onClick={() => setSightingType("online_social")}>Online / social</button></div></div>
          <label className="inline-signal-field"><span>Store</span><div style={{ position: "relative" }}><MapPin size={14} style={{ position: "absolute", left: 11, top: 13, color: "rgba(245,237,214,.38)" }} /><input className="inline-signal-input" style={{ paddingLeft: 32 }} value={storeQuery} onChange={(event) => { setStoreQuery(event.target.value); setSelectedStore(null); }} placeholder="Search store, city, ZIP, or street" autoComplete="off" /></div></label>
          {!selectedStore && storeMatches.length ? <div className="inline-signal-suggestions" aria-label="Exact store matches">{storeMatches.map((store) => <button key={store.id} type="button" onClick={() => selectStore(store)}>Select exact store: {storeLabel(store)}<small>{formatStoreAddress([store.address, store.city, store.state, store.zip])}</small></button>)}</div> : null}
          {!selectedStore && storesLoading && storeQuery.trim().length >= 2 ? <p className="inline-signal-message">Loading exact stores…</p> : null}
          {selectedStore ? <div className="inline-signal-selected"><span><strong>{storeLabel(selectedStore)}</strong><br />{formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip])}</span><button type="button" onClick={() => { setSelectedStore(null); setStoreQuery(""); }}>Change</button></div> : (
            <div className="inline-signal-manual"><input className="inline-signal-input wide" value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="Street address · optional" /><input className="inline-signal-input" value={manualCity} onChange={(event) => setManualCity(event.target.value)} placeholder="City" /><input className="inline-signal-input" value={manualState} onChange={(event) => { manualStateEdited.current = true; setManualState(event.target.value.toUpperCase().slice(0, 2)); }} placeholder="State" /><input className="inline-signal-input wide" value={manualZip} onChange={(event) => setManualZip(event.target.value)} placeholder="ZIP · optional" /></div>
          )}
          <div className="inline-signal-details"><input className="inline-signal-input" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity estimate" /><input className="inline-signal-input" type="number" inputMode="decimal" min="0" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price · optional" /><textarea className="inline-signal-input wide" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes · shelf location, purchase limit, or useful context" /></div>
          {error ? <p className="inline-signal-message error">{error}</p> : null}
          {success ? <p className="inline-signal-message success" aria-live="polite">{success}</p> : null}
          <button type="button" className="inline-signal-submit" onClick={submit} disabled={saving}><Send size={15} />{saving ? "Posting…" : "Post Signal"}</button>
        </div>
      ) : null}
    </section>
  );
}
