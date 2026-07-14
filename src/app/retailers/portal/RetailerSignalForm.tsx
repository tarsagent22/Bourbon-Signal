"use client";

import { useEffect, useMemo, useState } from "react";
import { retailerSignalFieldConfig, type RetailerSignalKind } from "@/lib/retailer-signal-fields";
import { RETAILER_TIME_ZONES, type RetailerTimeZone } from "@/lib/retailer-time-zone";
import styles from "../retailers.module.css";

type BottleSuggestion = {
  id: string;
  canonicalName: string;
  brand?: string;
  availability?: string;
};

type SuggestionResponse = {
  bottle?: BottleSuggestion | null;
  suggestions?: BottleSuggestion[];
};

type RetailerSignalStore = {
  id: string;
  storeName: string;
  storeAddress: string;
  defaultTimeZone: RetailerTimeZone | "";
};

type RetailerSignalFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  stores: RetailerSignalStore[];
};

export default function RetailerSignalForm({ action, stores }: RetailerSignalFormProps) {
  const initialStoreId = stores.length === 1 ? stores[0].id : "";
  const initialStore = stores.find((store) => store.id === initialStoreId);
  const [storeId, setStoreId] = useState(initialStoreId);
  const [kind, setKind] = useState<RetailerSignalKind>("bottle_drop");
  const [availabilityTiming, setAvailabilityTiming] = useState<"now" | "scheduled">("now");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [expiresAtLocal, setExpiresAtLocal] = useState("");
  const [timeZone, setTimeZone] = useState<RetailerTimeZone | "">(initialStore?.defaultTimeZone || "");
  const [title, setTitle] = useState("");
  const [selectedBottleId, setSelectedBottleId] = useState("");
  const [suggestions, setSuggestions] = useState<BottleSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const fieldConfig = retailerSignalFieldConfig(kind);
  const selectedStore = stores.find((store) => store.id === storeId);

  useEffect(() => {
    const query = title.trim();
    if (!fieldConfig.useBottleSuggestions || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/bottle-check?q=${encodeURIComponent(query)}&intent=suggest`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const data = (await response.json()) as SuggestionResponse;
        const rows = [data.bottle, ...(data.suggestions || [])]
          .filter((bottle): bottle is BottleSuggestion => Boolean(bottle?.id && bottle.canonicalName))
          .filter((bottle, index, all) => all.findIndex((candidate) => candidate.id === bottle.id) === index)
          .slice(0, 6);
        setSuggestions(rows);
        setActiveIndex(-1);
        setOpen(rows.length > 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setOpen(false);
          setActiveIndex(-1);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fieldConfig.useBottleSuggestions, title]);

  const activeId = useMemo(() => activeIndex >= 0 ? `retailer-bottle-option-${activeIndex}` : undefined, [activeIndex]);
  const timeZoneField = (
    <div className={styles.field}>
      <label htmlFor="timeZone">Store time zone</label>
      <select
        className={styles.signalInput}
        id="timeZone"
        name="timeZone"
        onChange={(event) => setTimeZone(event.target.value as RetailerTimeZone | "")}
        required
        value={timeZone}
      >
        {selectedStore?.defaultTimeZone ? null : <option disabled value="">Choose time zone</option>}
        {RETAILER_TIME_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
      </select>
      <p className={styles.fieldHelp}>{selectedStore?.defaultTimeZone ? "Used for the selected store. Change it only if needed." : "Choose the time zone used at this store."}</p>
    </div>
  );

  function selectSuggestion(suggestion: BottleSuggestion) {
    setTitle(suggestion.canonicalName);
    setSelectedBottleId(suggestion.id);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <form action={action} className={`${styles.formGrid} ${styles.signalForm}`}>
      <input name="bottleId" type="hidden" value={selectedBottleId} />
      <div className={styles.field}>
        <label htmlFor="storeId">Signal store</label>
        <select
          className={styles.signalInput}
          id="storeId"
          name="storeId"
          onChange={(event) => {
            const nextStoreId = event.target.value;
            const nextStore = stores.find((store) => store.id === nextStoreId);
            setStoreId(nextStoreId);
            setTimeZone(nextStore?.defaultTimeZone || "");
          }}
          required
          value={storeId}
        >
          {stores.length > 1 || !storeId ? <option disabled value="">Choose a store</option> : null}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.storeName} — {store.storeAddress}</option>
          ))}
        </select>
        <p className={styles.fieldHelp}>This signal will use the selected location’s store name and address.</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="kind">Signal type</label>
        <select
          className={styles.signalInput}
          id="kind"
          name="kind"
          onChange={(event) => {
            setKind(event.target.value as RetailerSignalKind);
            setAvailabilityTiming("now");
            setStartsAtLocal("");
            setExpiresAtLocal("");
            setSelectedBottleId("");
          }}
          value={kind}
        >
          <option value="bottle_drop">Bottle availability</option>
          <option value="barrel_pick">Barrel pick</option>
          <option value="tasting">Tasting</option>
          <option value="lottery">Lottery</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="title">{fieldConfig.titleLabel}</label>
        <div className={styles.suggestionWrap}>
          <input
            aria-activedescendant={fieldConfig.useBottleSuggestions ? activeId : undefined}
            aria-autocomplete={fieldConfig.useBottleSuggestions ? "list" : undefined}
            aria-controls={fieldConfig.useBottleSuggestions ? "retailer-bottle-suggestions" : undefined}
            aria-describedby="retailer-signal-title-help"
            aria-expanded={fieldConfig.useBottleSuggestions ? open : undefined}
            autoComplete="off"
            className={styles.signalInput}
            id="title"
            maxLength={160}
            name="title"
            onBlur={() => window.setTimeout(() => {
              setOpen(false);
              setActiveIndex(-1);
            }, 120)}
            onChange={(event) => {
              setTitle(event.target.value);
              setSelectedBottleId("");
            }}
            onFocus={() => {
              if (fieldConfig.useBottleSuggestions) setOpen(suggestions.length > 0);
            }}
            onKeyDown={(event) => {
              if (!fieldConfig.useBottleSuggestions || !open || suggestions.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % suggestions.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
              } else if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                selectSuggestion(suggestions[activeIndex]);
              } else if (event.key === "Escape") {
                setOpen(false);
                setActiveIndex(-1);
              }
            }}
            placeholder={fieldConfig.titlePlaceholder}
            required
            role={fieldConfig.useBottleSuggestions ? "combobox" : undefined}
            value={title}
          />
          {fieldConfig.useBottleSuggestions && open ? (
            <div className={styles.suggestionList} id="retailer-bottle-suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={styles.suggestionOption}
                  id={`retailer-bottle-option-${index}`}
                  key={suggestion.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                  role="option"
                  type="button"
                >
                  <strong>{suggestion.canonicalName}</strong>
                  <span>{[suggestion.brand, suggestion.availability?.replaceAll("_", " ")].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className={styles.fieldHelp} id="retailer-signal-title-help">{fieldConfig.titleHelp}</p>
      </div>

      {fieldConfig.supportsAvailabilityTiming ? (
        <fieldset className={styles.timingFieldset}>
          <legend>When will it be available?</legend>
          <div className={styles.timingOptions}>
            <label className={styles.timingOption}>
              <input
                checked={availabilityTiming === "now"}
                name="availabilityTiming"
                onChange={() => setAvailabilityTiming("now")}
                type="radio"
                value="now"
              />
              <span><strong>Available now</strong><small>Publish as live inventory immediately.</small></span>
            </label>
            <label className={styles.timingOption}>
              <input
                checked={availabilityTiming === "scheduled"}
                name="availabilityTiming"
                onChange={() => setAvailabilityTiming("scheduled")}
                type="radio"
                value="scheduled"
              />
              <span><strong>Schedule for later</strong><small>Show it as upcoming until the selected time.</small></span>
            </label>
          </div>
          {availabilityTiming === "scheduled" ? (
            <>
              <div className={styles.field}>
                <label htmlFor="startsAtLocal">Go-live date and time</label>
                <input
                  className={styles.signalInput}
                  id="startsAtLocal"
                  name="startsAt"
                  onChange={(event) => setStartsAtLocal(event.target.value)}
                  required
                  type="datetime-local"
                  value={startsAtLocal}
                />
              </div>
              {timeZoneField}
            </>
          ) : null}
        </fieldset>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="locationDetails">{fieldConfig.locationLabel} <span className={styles.muted}>(optional)</span></label>
        <input className={styles.signalInput} id="locationDetails" name="locationDetails" placeholder={fieldConfig.locationPlaceholder} maxLength={180} />
      </div>

      {fieldConfig.showPrice || fieldConfig.showAvailability ? (
        <div className={`${styles.formGrid} ${styles.twoColumns}`}>
          {fieldConfig.showPrice ? (
            <div className={styles.field}>
              <label htmlFor="price">{fieldConfig.priceLabel} <span className={styles.muted}>(optional)</span></label>
              <input className={styles.signalInput} id="price" name="price" placeholder={fieldConfig.pricePlaceholder} maxLength={40} />
            </div>
          ) : null}
          {fieldConfig.showAvailability ? (
            <div className={styles.field}>
              <label htmlFor="availability">{fieldConfig.availabilityLabel} <span className={styles.muted}>(optional)</span></label>
              <input className={styles.signalInput} id="availability" name="availability" placeholder={fieldConfig.availabilityPlaceholder} maxLength={100} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="expiresAtLocal">{fieldConfig.expiresAtLabel}{fieldConfig.expiresAtRequired ? null : <span className={styles.muted}> (optional)</span>}</label>
        <input
          className={styles.signalInput}
          id="expiresAtLocal"
          name="expiresAt"
          onChange={(event) => setExpiresAtLocal(event.target.value)}
          required={fieldConfig.expiresAtRequired}
          type="datetime-local"
          value={expiresAtLocal}
        />
        {fieldConfig.supportsAvailabilityTiming ? <p className={styles.fieldHelp}>Leave this blank and it will expire 24 hours after it goes live.</p> : null}
      </div>
      {availabilityTiming !== "scheduled" && (fieldConfig.expiresAtRequired || Boolean(expiresAtLocal)) ? timeZoneField : null}

      <div className={styles.field}>
        <label htmlFor="notes">{fieldConfig.notesLabel} <span className={styles.muted}>(optional)</span></label>
        <textarea className={styles.signalInput} id="notes" name="notes" placeholder={fieldConfig.notesPlaceholder} maxLength={1000} />
      </div>

      <button className={styles.primaryButton} type="submit">Submit signal</button>
    </form>
  );
}
