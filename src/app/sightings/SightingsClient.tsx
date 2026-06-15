"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, MapPin, Navigation as NavigationIcon, Search, Send } from "lucide-react";
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
        .sighting-input-wrap input,.sighting-plain-input{width:100%;border:0;outline:0;background:transparent;color:var(--color-cream);font-family:var(--font-dm-sans);font-size:14px;padding:13px 0}.sighting-plain-input{border:1px solid rgba(245,237,214,.12);background:rgba(5,4,3,.36);border-radius:14px;padding:13px 12px}.sighting-suggestions{display:grid;gap:8px;margin-top:8px}.sighting-suggestions button{border:1px solid rgba(245,237,214,.09);background:rgba(245,237,214,.035);border-radius:12px;padding:10px 12px;color:var(--color-cream);text-align:left;cursor:pointer}.sighting-suggestions span{display:block;color:rgba(245,237,214,.44);font-size:12px;margin-top:3px}.sighting-suggestions button:hover,.sighting-suggestions button.selected{border-color:rgba(196,148,58,.35);background:rgba(196,148,58,.08)}.sighting-submit,.sighting-location-button,.sighting-tab,.vote-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:1px solid rgba(196,148,58,.26);background:rgba(196,148,58,.11);color:var(--color-cream);font-family:var(--font-dm-sans);font-size:13px;font-weight:800;padding:11px 15px;cursor:pointer}.sighting-submit{margin-top:18px;width:100%}.sighting-location-button{padding:9px 12px;background:rgba(245,237,214,.035);border-color:rgba(245,237,214,.1);color:rgba(245,237,214,.72)}.sighting-tab{border-radius:16px 16px 0 0;background:rgba(245,237,214,.035);border-color:rgba(245,237,214,.09);color:rgba(245,237,214,.54)}.sighting-tab.active{background:rgba(196,148,58,.13);border-color:rgba(196,148,58,.32);color:var(--color-cream)}.sighting-empty{color:rgba(245,237,214,.46);font-size:13px}.sighting-card{border:1px solid rgba(245,237,214,.1);border-radius:18px;padding:16px;background:linear-gradient(135deg,rgba(245,237,214,.045),rgba(196,148,58,.045));}.sighting-pill{font-family:var(--font-jetbrains);font-size:9px;text-transform:uppercase;letter-spacing:.08em;border:1px solid rgba(196,148,58,.22);background:rgba(196,148,58,.08);color:rgba(232,201,122,.95);border-radius:999px;padding:4px 7px}.vote-button{padding:7px 10px;background:rgba(245,237,214,.035);border-color:rgba(245,237,214,.12);color:rgba(245,237,214,.7)}.vote-button.active{background:rgba(196,148,58,.14);border-color:rgba(196,148,58,.34);color:var(--color-accent-amber)}@media(max-width:820px){.sighting-grid{grid-template-columns:1fr!important}.sighting-two-col{grid-template-columns:1fr!important}}
      `}</style>
      <div style={{ maxWidth: "1040px", margin: "0 auto" }}>
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 8vw, 72px)", lineHeight: 0.95 }}>Member Sightings</h1>
          <p style={{ maxWidth: 720, color: "rgba(245,237,214,0.68)", fontSize: 17, lineHeight: 1.65 }}>Submit and browse member-reported sightings. These are user submitted reports, not alert-triggering engine signals.</p>
        </motion.div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 28 }}>
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
          <section style={{ border: "1px solid rgba(245,237,214,0.1)", borderRadius: "0 28px 28px 28px", background: "rgba(245,237,214,0.045)", padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.34)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}><div><h2 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: 30 }}>Member Sightings Feed</h2><p style={{ margin: "5px 0 0", color: "rgba(245,237,214,.55)", fontSize: 13 }}>Newest first. User submitted sightings do not trigger alerts.</p></div><label><span className="sighting-label">State</span><select className="sighting-plain-input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="ALL">All states</option>{stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}</select></label></div>
            {loading ? <div className="sighting-empty">Loading member sightings…</div> : null}
            <div style={{ display: "grid", gap: 12 }}>{filteredSightings.map((sighting) => <article key={sighting.id} className="sighting-card"><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}><span className="sighting-pill">Member sighting</span><span className="sighting-pill">{tierLabel(sighting.rarityTier)}</span><span className="sighting-pill">{sightingTypeLabel(sighting.sightingType)}</span></div><h3 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: 24 }}>{sighting.bottleName}</h3><p style={{ margin: "6px 0 0", color: "rgba(245,237,214,.7)", lineHeight: 1.5 }}>{sighting.storeName} · {sighting.storeState || "State unknown"}</p><p style={{ margin: "4px 0 0", color: "rgba(245,237,214,.48)", fontSize: 13 }}>{sighting.storeAddress}</p>{sighting.quantityEstimate || sighting.price || sighting.notes ? <p style={{ margin: "8px 0 0", color: "rgba(245,237,214,.62)", fontSize: 13 }}>{[sighting.quantityEstimate, sighting.price ? `$${sighting.price}` : null, sighting.notes].filter(Boolean).join(" · ")}</p> : null}<p style={{ margin: "8px 0 0", color: "rgba(245,237,214,.4)", fontSize: 12 }}>Reported {formatAgo(sighting.createdAt)}</p></div><div style={{ display: "grid", gap: 6, minWidth: 82 }}><button type="button" className={`vote-button ${sighting.myVote === "up" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "up").catch(() => undefined)}>▲ {sighting.upCount || 0}</button><button type="button" className={`vote-button ${sighting.myVote === "down" ? "active" : ""}`} onClick={() => voteSighting(sighting.id, "down").catch(() => undefined)}>▼ {sighting.downCount || 0}</button></div></div></article>)}</div>
            {!loading && filteredSightings.length === 0 ? <div className="sighting-empty" style={{ padding: 18, border: "1px solid rgba(245,237,214,.09)", borderRadius: 16 }}>No member sightings match this state yet.</div> : null}
          </section>
        )}
      </div>
    </main>
  );
}
