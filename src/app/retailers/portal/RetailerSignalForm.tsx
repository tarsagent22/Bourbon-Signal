"use client";

import { useEffect, useMemo, useState } from "react";
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

type RetailerSignalFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export default function RetailerSignalForm({ action }: RetailerSignalFormProps) {
  const [title, setTitle] = useState("");
  const [suggestions, setSuggestions] = useState<BottleSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = title.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
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
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

  const activeId = useMemo(() => activeIndex >= 0 ? `retailer-bottle-option-${activeIndex}` : undefined, [activeIndex]);

  function selectSuggestion(suggestion: BottleSuggestion) {
    setTitle(suggestion.canonicalName);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <form action={action} className={`${styles.formGrid} ${styles.signalForm}`}>
      <div className={styles.field}>
        <label htmlFor="kind">Signal type</label>
        <select className={styles.signalInput} id="kind" name="kind" defaultValue="bottle_drop">
          <option value="bottle_drop">Bottle drop</option>
          <option value="barrel_pick">Barrel pick</option>
          <option value="tasting">Tasting</option>
          <option value="lottery">Lottery</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="title">Bottle search or event title</label>
        <div className={styles.suggestionWrap}>
          <input
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-controls="retailer-bottle-suggestions"
            aria-expanded={open}
            autoComplete="off"
            className={styles.signalInput}
            id="title"
            name="title"
            onBlur={() => window.setTimeout(() => {
              setOpen(false);
              setActiveIndex(-1);
            }, 120)}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={() => setOpen(suggestions.length > 0)}
            onKeyDown={(event) => {
              if (!open || suggestions.length === 0) return;
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
            placeholder="Start typing a bottle name…"
            required
            maxLength={160}
            role="combobox"
            value={title}
          />
          {open ? (
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
        <p className={styles.fieldHelp}>Choose a Bottle Check suggestion or keep your own title if it is not listed.</p>
      </div>

      <div className={styles.field}>
        <label htmlFor="locationDetails">Location details <span className={styles.muted}>(optional)</span></label>
        <input className={styles.signalInput} id="locationDetails" name="locationDetails" placeholder="Front counter, tasting room…" maxLength={180} />
      </div>
      <div className={`${styles.formGrid} ${styles.twoColumns}`}>
        <div className={styles.field}><label htmlFor="price">Price</label><input className={styles.signalInput} id="price" name="price" placeholder="$79.99" maxLength={40} /></div>
        <div className={styles.field}><label htmlFor="availability">Availability</label><input className={styles.signalInput} id="availability" name="availability" placeholder="12 bottles, limit one" maxLength={100} /></div>
      </div>
      <div className={styles.field}><label htmlFor="expiresAt">End or expiration</label><input className={styles.signalInput} id="expiresAt" name="expiresAt" type="datetime-local" /></div>
      <div className={styles.field}><label htmlFor="notes">Customer details</label><textarea className={styles.signalInput} id="notes" name="notes" maxLength={1000} /></div>
      <button className={styles.primaryButton} type="submit">Submit signal</button>
    </form>
  );
}
