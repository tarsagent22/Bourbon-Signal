"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { CoverageSearchResult } from "@/lib/coverage-model";
import styles from "./coverage.module.css";
import { trackCoverageEvent } from "@/lib/coverage-analytics-client";

interface CoverageSearchProps {
  stateCode: string;
  stateName: string;
}

const STATUS_LABELS: Record<CoverageSearchResult["status"], string> = {
  covered: "Covered",
  "partially-covered": "Partially covered",
  "known-not-active": "Not actively monitored",
  "actively-monitored": "Actively monitored",
  "known-expansion-candidate": "Not actively monitored",
  "not-found": "Not covered",
};

export function CoverageSearch({ stateCode, stateName }: CoverageSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoverageSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const requestController = useRef<AbortController | null>(null);
  const currentStateCode = useRef(stateCode);
  currentStateCode.current = stateCode;

  useEffect(() => {
    requestController.current?.abort();
    setQuery("");
    setResults([]);
    setStatus("idle");
    return () => requestController.current?.abort();
  }, [stateCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const requestState = stateCode;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setStatus("loading");
    try {
      const response = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: requestState, query: normalized }),
        signal: controller.signal,
      });
      const payload = await response.json() as { results?: CoverageSearchResult[]; error?: string };
      if (controller.signal.aborted || currentStateCode.current !== requestState) return;
      if (!response.ok || !Array.isArray(payload.results)) throw new Error(payload.error || "Search is unavailable.");
      setResults(payload.results);
      setStatus("ready");
      const first = payload.results[0];
      if (first) {
        trackCoverageEvent("coverage_search_resolved", {
          state: requestState,
          targetType: first.kind === "unknown" ? "unknown" : first.kind,
          resultCategory: first.status,
        });
      }
    } catch {
      if (controller.signal.aborted || currentStateCode.current !== requestState) return;
      setResults([]);
      setStatus("error");
    }
  }

  return (
    <section className={styles.searchBlock} aria-labelledby={`${inputId}-heading`}>
      <div className={styles.subhead}>
        <p>Check your area</p>
        <h3 id={`${inputId}-heading`}>Search a city or store in this state</h3>
      </div>
      <form className={styles.searchForm} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor={inputId}>Search a city or store in {stateName}</label>
        <input
          id={inputId}
          type="search"
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`City or store in ${stateName}`}
          autoComplete="off"
        />
        <button type="submit" disabled={status === "loading" || !query.trim()}>
          {status === "loading" ? "Checking…" : "Check"}
        </button>
      </form>
      <p className={styles.searchPrivacy}>Results describe monitoring coverage, not current bottle availability.</p>
      <div className={styles.searchResults} aria-live="polite" aria-busy={status === "loading"}>
        {status === "error" ? <p className={styles.inlineError}>Search is temporarily unavailable. Please try again.</p> : null}
        {status === "ready" ? results.map((result, index) => (
          <article
            key={`${result.kind}:${result.canonicalTargetKey || result.label}:${index}`}
            className={styles.searchResult}
            data-status={result.status}
          >
            <span>
              <strong>{result.label}</strong>
              <small>{[result.city, result.address].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={styles.resultStatus}>{STATUS_LABELS[result.status]}</span>
            <p>{result.detail}</p>
          </article>
        )) : null}
      </div>
    </section>
  );
}
