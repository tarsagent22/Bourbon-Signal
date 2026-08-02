"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoverageContract } from "@/lib/coverage-model";
import { CoverageMap } from "./CoverageMap";
import { CoverageStatePanel } from "./CoverageStatePanel";
import { COVERAGE_REQUEST_DRAFT_KEY } from "./CoverageRequestForm";
import { CoverageRequestsCard } from "@/components/dashboard/CoverageRequestsCard";
import { trackCoverageEvent } from "@/lib/coverage-analytics-client";
import styles from "./coverage.module.css";

interface CoverageExplorerProps {
  contract: CoverageContract;
  initialStateCode: string;
}

export function CoverageExplorer({ contract, initialStateCode }: CoverageExplorerProps) {
  const router = useRouter();
  const pageViewTracked = useRef(false);
  const fallbackCode = contract.states.find((state) => state.code === "NC")?.code || contract.states[0]?.code || "DC";
  const [selectedCode, setSelectedCode] = useState(
    contract.states.some((state) => state.code === initialStateCode) ? initialStateCode : fallbackCode,
  );
  const selectedState = useMemo(
    () => contract.states.find((state) => state.code === selectedCode) || contract.states[0],
    [contract.states, selectedCode],
  );

  useEffect(() => {
    if (pageViewTracked.current) return;
    pageViewTracked.current = true;
    trackCoverageEvent("coverage_page_viewed", { state: selectedCode });
  }, [selectedCode]);

  const selectState = useCallback((stateCode: string) => {
    if (!contract.states.some((state) => state.code === stateCode) || stateCode === selectedCode) return;
    window.sessionStorage.removeItem(COVERAGE_REQUEST_DRAFT_KEY);
    setSelectedCode(stateCode);
    router.replace(`/coverage?state=${encodeURIComponent(stateCode)}`, { scroll: false });
    trackCoverageEvent("coverage_state_selected", { state: stateCode });
  }, [contract.states, router, selectedCode]);

  if (!selectedState) return null;

  return (
    <main className={styles.shell}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Bourbon Signal Coverage</p>
        <h1>Check coverage <em>near you.</em></h1>
        <p>Select a state, then search a city or store to see what information is available. A listed store is not the same as a bottle in stock right now.</p>
      </header>

      <section className={styles.mobileSelector} aria-label="Choose a state">
        <label htmlFor="coverage-state-select">State</label>
        <select id="coverage-state-select" value={selectedCode} onChange={(event) => selectState(event.target.value)}>
          {contract.states.map((state) => (
            <option key={state.code} value={state.code}>{state.name} — {state.capabilityLabel}</option>
          ))}
        </select>
      </section>

      <section className={styles.explorerGrid} aria-label="Coverage explorer">
        <div className={styles.mapColumn}>
          <CoverageMap states={contract.states} selectedCode={selectedCode} onSelect={selectState} />
          <details className={styles.stateList}>
            <summary>Browse all states</summary>
            <ul>
              {contract.states.map((state) => (
                <li key={state.code}>
                  <button type="button" aria-current={selectedCode === state.code ? "true" : undefined} onClick={() => selectState(state.code)}>
                    <span><strong>{state.name}</strong><small>{state.healthLabel}</small></span>
                    <span>{state.capabilityLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
        <CoverageStatePanel key={selectedState.code} state={selectedState} />
      </section>
      <div className={styles.memberRequests}><CoverageRequestsCard emptyMode="hidden" /></div>
    </main>
  );
}
