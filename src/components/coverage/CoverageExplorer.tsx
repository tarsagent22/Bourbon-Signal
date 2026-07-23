"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoverageContract, CoverageSearchResult } from "@/lib/coverage-model";
import { CoverageMap } from "./CoverageMap";
import { CoverageStatePanel } from "./CoverageStatePanel";
import { CoverageRequestsCard } from "@/components/dashboard/CoverageRequestsCard";
import { trackCoverageEvent } from "@/lib/coverage-analytics-client";
import styles from "./coverage.module.css";

interface CoverageExplorerProps {
  contract: CoverageContract;
  initialStateCode: string;
}

const LEGEND = [
  ["deep", "Deep coverage"],
  ["active", "Active coverage"],
  ["focused", "Focused coverage"],
  ["intelligence", "Intelligence only"],
  ["not-active", "Not active yet"],
] as const;

export function CoverageExplorer({ contract, initialStateCode }: CoverageExplorerProps) {
  const router = useRouter();
  const pageViewTracked = useRef(false);
  const fallbackCode = contract.states.find((state) => state.code === "NC")?.code || contract.states[0]?.code || "DC";
  const [selectedCode, setSelectedCode] = useState(
    contract.states.some((state) => state.code === initialStateCode) ? initialStateCode : fallbackCode,
  );
  const [selectedTarget, setSelectedTarget] = useState<CoverageSearchResult | null>(null);
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
    if (!contract.states.some((state) => state.code === stateCode)) return;
    setSelectedCode(stateCode);
    setSelectedTarget(null);
    router.replace(`/coverage?state=${encodeURIComponent(stateCode)}`, { scroll: false });
    trackCoverageEvent("coverage_state_selected", { state: stateCode });
  }, [contract.states, router]);

  if (!selectedState) return null;

  return (
    <main className={styles.shell}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>The Bourbon Signal coverage desk</p>
        <h1>Know what we can see<br /><em>before you join the hunt.</em></h1>
        <p>Explore honest source capability by state, then check a city or store. Coverage never means a bottle is on the shelf right now.</p>
        <div className={styles.freshnessNote}>
          <span aria-hidden="true" />
          Coverage model updated {contract.generatedAt ? new Date(contract.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "with the latest available source export"}
        </div>
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
          <div className={styles.legend} aria-label="Coverage legend">
            <h2>Coverage legend</h2>
            <div>
              {LEGEND.map(([capability, label]) => (
                <span key={capability}><i data-capability={capability} aria-hidden="true" />{label}</span>
              ))}
            </div>
          </div>
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
        <CoverageStatePanel state={selectedState} selectedTarget={selectedTarget} onTargetSelected={setSelectedTarget} />
      </section>
      <div className={styles.memberRequests}><CoverageRequestsCard /></div>
    </main>
  );
}
