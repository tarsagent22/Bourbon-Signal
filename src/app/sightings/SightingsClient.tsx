"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { MapPin, Navigation as NavigationIcon, Search, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Bottle } from "@/data/bottles";
import { useBottles } from "@/hooks/useBottles";
import { useStores, type Store } from "@/hooks/useStores";
import { useSightings } from "@/hooks/useSightings";
import { formatStoreAddress, makeSightingId, normalizeBottleKey, type MemberSighting } from "@/lib/sightings";

function norm(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distanceMiles(a?: { lat: number; lng: number } | null, b?: { lat?: number; lng?: number }) {
  if (!a || b?.lat == null || b?.lng == null) return Number.POSITIVE_INFINITY;
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng));
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
  return {
    id,
    name,
    canonical_id: id,
    canonical_name: name,
    aliases: Array.isArray(bottle.aliases) ? bottle.aliases.map(String) : [],
    distillery: String(bottle.producer || bottle.brand || "Bottle Check index"),
    tier,
    msrp: typeof bottle.msrp === "number" ? bottle.msrp : 0,
  };
}

export default function SightingsClient() {
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const { isSignedIn, signIn } = useAuth();
  const { bottles } = useBottles();
  const { stores, loading: storesLoading } = useStores();
  const { sightings, addSighting, saving } = useSightings(isSignedIn);

  const [bottleQuery, setBottleQuery] = useState(searchParams.get("bottle") || "");
  const [selectedBottleId, setSelectedBottleId] = useState(searchParams.get("bottleId") || "");
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
    if (query.length < 2) {
      setBottleCheckMatches([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/bottle-check?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const suggestions = [data?.bottle, ...(Array.isArray(data?.suggestions) ? data.suggestions : [])].filter(Boolean);
          setBottleCheckMatches(suggestions.map(asBottleCheckBottle).filter((bottle): bottle is Bottle => Boolean(bottle)));
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setBottleCheckMatches([]);
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bottleQuery]);

  const bottleMatches = useMemo(() => {
    const needle = norm(bottleQuery);
    if (!needle) return [];
    const matches = bottles
      .filter((bottle) => {
        const values = [bottle.name, bottle.canonical_name, bottle.canonical_id, ...(bottle.aliases || []), ...(bottle.search_aliases || [])];
        return values.some((value) => norm(value).includes(needle) || needle.includes(norm(value)));
      });
    const byId = new Map<string, Bottle>();
    [...matches, ...bottleCheckMatches].forEach((bottle) => {
      const key = bottle.id || bottle.canonical_id || bottle.name;
      if (key && !byId.has(key)) byId.set(key, bottle);
    });
    return Array.from(byId.values()).slice(0, 7);
  }, [bottleQuery, bottles, bottleCheckMatches]);

  const storeMatches = useMemo(() => {
    const needle = norm(storeQuery);
    const scored = stores
      .filter((store) => store.precision === "store" && (store.searchable ?? true))
      .map((store) => {
        const searchable = norm([store.name, store.displayLabel, store.address, store.city, store.county, store.zip, store.state].filter(Boolean).join(" "));
        const textScore = !needle ? 0 : searchable.includes(needle) ? 0 : 25;
        const geoScore = distanceMiles(geo, store);
        return { store, score: textScore + Math.min(geoScore, 250) };
      })
      .filter(({ store }) => {
        if (!needle) return Boolean(geo);
        const searchable = norm([store.name, store.displayLabel, store.address, store.city, store.county, store.zip, store.state].filter(Boolean).join(" "));
        return searchable.includes(needle);
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);
    return scored.map(({ store }) => store);
  }, [stores, storeQuery, geo]);

  const exactAddress = selectedStore
    ? formatStoreAddress([selectedStore.address, selectedStore.city, selectedStore.state, selectedStore.zip])
    : "Select an exact store to show the address on the sighting card.";

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Location is not available in this browser.");
      return;
    }
    setGeoStatus("Finding nearby stores…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("Nearby stores sorted by your current location. Select the exact store before submitting.");
      },
      () => setGeoStatus("Could not use location. Search by city, ZIP, street, or store name instead."),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const submit = async () => {
    setSubmitError(null);
    if (!isSignedIn) {
      signIn();
      return;
    }
    const bottleName = bottleQuery.trim();
    if (!bottleName) return setSubmitError("Choose or enter a bottle.");
    if (!selectedStore) return setSubmitError("Select an exact store from the suggestions.");
    const sighting: MemberSighting = {
      id: makeSightingId(),
      bottleName,
      bottleId: selectedBottleId || normalizeBottleKey(bottleName),
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
      createdAt: new Date().toISOString(),
    };
    await addSighting(sighting);
    setSaved(sighting);
    setQuantityEstimate("");
    setPrice("");
    setNotes("");
  };

  return (
    <main style={{ minHeight: "100vh", padding: "112px 18px 80px", background: "linear-gradient(180deg, #100c08 0%, #1b130c 46%, #100c08 100%)", color: "var(--color-cream)" }}>
      <div style={{ maxWidth: "1040px", margin: "0 auto" }}>
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 11px", borderRadius: "999px", border: "1px solid rgba(196,148,58,0.26)", background: "rgba(196,148,58,0.08)", color: "rgba(245,237,214,0.76)", fontFamily: "var(--font-jetbrains)", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <ShieldCheck size={14} /> Member signal layer
          </div>
          <h1 style={{ marginTop: "18px", marginBottom: "10px", fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 8vw, 72px)", lineHeight: 0.95 }}>Sightings</h1>
          <p style={{ maxWidth: "720px", color: "rgba(245,237,214,0.68)", fontSize: "17px", lineHeight: 1.65 }}>
            Add a store-level bottle sighting to strengthen Bourbon Signal’s trust layer. Every sighting must be tied to an exact store before it can appear in the member feed.
          </p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)", gap: "18px", marginTop: "28px" }} className="sighting-grid">
          <section style={{ border: "1px solid rgba(245,237,214,0.1)", borderRadius: "28px", background: "rgba(245,237,214,0.045)", padding: "22px", boxShadow: "0 24px 70px rgba(0,0,0,0.34)" }}>
            <label style={{ display: "block", marginBottom: "18px" }}>
              <span className="sighting-label">Bottle</span>
              <div className="sighting-input-wrap"><Search size={16} /><input value={bottleQuery} onChange={(e) => { setBottleQuery(e.target.value); setSelectedBottleId(""); }} placeholder="Search or type bottle name" /></div>
              {bottleMatches.length > 0 && !selectedBottleId ? (
                <div className="sighting-suggestions">
                  {bottleMatches.map((bottle) => <button key={bottle.id} type="button" onClick={() => { setBottleQuery(bottle.name); setSelectedBottleId(bottle.id); }}>{bottle.name}<span>{bottle.distillery}</span></button>)}
                </div>
              ) : null}
            </label>

            <label style={{ display: "block", marginBottom: "10px" }}>
              <span className="sighting-label">Store</span>
              <div className="sighting-input-wrap"><MapPin size={16} /><input value={storeQuery} onChange={(e) => { setStoreQuery(e.target.value); setSelectedStore(null); }} placeholder="City, ZIP, street, or store name" /></div>
            </label>
            <button type="button" onClick={requestLocation} className="sighting-location-button"><NavigationIcon size={15} /> Use my location</button>
            {geoStatus ? <p style={{ color: "rgba(245,237,214,0.48)", fontSize: "12px", margin: "8px 0 0" }}>{geoStatus}</p> : null}

            <div className="sighting-suggestions" style={{ marginTop: "12px" }}>
              {storesLoading ? <div className="sighting-empty">Loading stores…</div> : null}
              {!storesLoading && storeMatches.length === 0 ? <div className="sighting-empty">Search by city, ZIP, street, store name, or use your location.</div> : null}
              {storeMatches.map((store) => <button key={store.id} type="button" className={selectedStore?.id === store.id ? "selected" : ""} onClick={() => { setSelectedStore(store); setStoreQuery(storeDisplay(store)); }}>{storeDisplay(store)}<span>{formatStoreAddress([store.address, store.city, store.state, store.zip])}</span></button>)}
            </div>

            <div style={{ marginTop: "18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label><span className="sighting-label">Quantity estimate</span><input className="sighting-plain-input" value={quantityEstimate} onChange={(e) => setQuantityEstimate(e.target.value)} placeholder="e.g. 3 bottles, shelf full" /></label>
              <label><span className="sighting-label">Price</span><input className="sighting-plain-input" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" /></label>
            </div>
            <label style={{ display: "block", marginTop: "12px" }}><span className="sighting-label">Notes</span><textarea className="sighting-plain-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: purchase limit, shelf location, line, etc." rows={3} /></label>

            {submitError ? <div style={{ color: "#ffb4a3", marginTop: "12px", fontSize: "13px" }}>{submitError}</div> : null}
            <button type="button" onClick={submit} disabled={saving} className="sighting-submit"><Send size={16} /> {saving ? "Saving…" : isSignedIn ? "Submit sighting" : "Sign in to submit"}</button>
          </section>

          <aside style={{ border: "1px solid rgba(196,148,58,0.22)", borderRadius: "28px", background: "linear-gradient(145deg, rgba(196,148,58,0.12), rgba(20,14,8,0.88))", padding: "22px", alignSelf: "start" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "28px" }}>Sighting card preview</h2>
            <div style={{ marginTop: "16px", border: "1px solid rgba(245,237,214,0.12)", borderRadius: "20px", padding: "16px", background: "rgba(9,7,5,0.42)" }}>
              <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", letterSpacing: "0.08em", color: "rgba(196,148,58,0.9)", textTransform: "uppercase" }}>User submitted</div>
              <div style={{ marginTop: "8px", fontFamily: "var(--font-playfair)", fontWeight: 700, fontSize: "25px", lineHeight: 1.05 }}>{bottleQuery || "Bottle name"}</div>
              <div style={{ marginTop: "14px", color: "rgba(245,237,214,0.8)", fontWeight: 650 }}>{selectedStore ? storeDisplay(selectedStore) : "Exact store required"}</div>
              <div style={{ color: "rgba(245,237,214,0.48)", fontSize: "13px", marginTop: "3px" }}>{exactAddress}</div>
              <div style={{ display: "flex", gap: "10px", marginTop: "14px", color: "rgba(245,237,214,0.62)", fontSize: "13px" }}>
                {quantityEstimate ? <span>{quantityEstimate}</span> : null}
                {price ? <span>${price}</span> : null}
                {!quantityEstimate && !price ? <span>Quantity/price optional</span> : null}
              </div>
            </div>
            {saved ? <p style={{ color: "rgba(190,232,177,0.95)", fontSize: "13px", lineHeight: 1.5 }}>Saved. Your sighting will appear in your signed-in member drop feed preview.</p> : null}
            <h3 style={{ marginTop: "22px", marginBottom: "10px", fontFamily: "var(--font-dm-sans)", fontSize: "14px" }}>Your recent sightings</h3>
            <div style={{ display: "grid", gap: "8px" }}>{sightings.slice(0, 4).map((item) => <div key={item.id} style={{ border: "1px solid rgba(245,237,214,0.08)", borderRadius: "14px", padding: "10px", color: "rgba(245,237,214,0.68)", fontSize: "12px" }}><strong style={{ color: "var(--color-cream)" }}>{item.bottleName}</strong><br />{item.storeName}</div>)}</div>
          </aside>
        </div>
      </div>
      <style>{`
        @media (max-width: 860px) { .sighting-grid { grid-template-columns: 1fr !important; } }
        .sighting-label { display:block; margin-bottom:7px; color:rgba(245,237,214,.5); font-family:var(--font-jetbrains); font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
        .sighting-input-wrap { display:flex; align-items:center; gap:9px; border:1px solid rgba(245,237,214,.13); border-radius:16px; background:rgba(10,8,6,.55); padding:0 12px; color:rgba(245,237,214,.45); }
        .sighting-input-wrap input, .sighting-plain-input { width:100%; border:0; outline:0; background:rgba(10,8,6,.55); color:var(--color-cream); border-radius:16px; padding:13px 12px; font-family:var(--font-dm-sans); font-size:14px; }
        .sighting-input-wrap input { background:transparent; padding-left:0; }
        .sighting-plain-input { border:1px solid rgba(245,237,214,.13); }
        .sighting-suggestions { display:grid; gap:7px; }
        .sighting-suggestions button { text-align:left; border:1px solid rgba(245,237,214,.09); border-radius:14px; background:rgba(245,237,214,.045); color:var(--color-cream); padding:10px 12px; cursor:pointer; }
        .sighting-suggestions button.selected, .sighting-suggestions button:hover { border-color:rgba(196,148,58,.5); background:rgba(196,148,58,.11); }
        .sighting-suggestions span { display:block; margin-top:3px; color:rgba(245,237,214,.42); font-size:12px; }
        .sighting-empty { border:1px dashed rgba(245,237,214,.12); border-radius:14px; padding:12px; color:rgba(245,237,214,.42); font-size:13px; }
        .sighting-location-button, .sighting-submit { display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:999px; border:1px solid rgba(196,148,58,.32); background:rgba(196,148,58,.1); color:var(--color-cream); padding:10px 14px; font-weight:700; cursor:pointer; }
        .sighting-submit { margin-top:18px; width:100%; background:linear-gradient(135deg,#C4943A,#E8C97A,#C4943A); color:#120d08; border:0; padding:14px 18px; }
      `}</style>
    </main>
  );
}
