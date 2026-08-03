"use client";

import { useCallback, useState } from "react";
import type { CoverageState } from "@/lib/coverage-model";
import { CoverageSearch } from "./CoverageSearch";
import { CoverageRequestForm } from "./CoverageRequestForm";
import { CoverageSummary } from "./CoverageSummary";
import styles from "./coverage.module.css";

interface CoverageStatePanelProps {
  state: CoverageState;
}

export function CoverageStatePanel({ state }: CoverageStatePanelProps) {
  const [requestOpen, setRequestOpen] = useState(false);

  const focusRequest = useCallback(() => {
    window.requestAnimationFrame(() => {
      const heading = document.getElementById("coverage-request-heading");
      heading?.focus();
      heading?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const openRequest = useCallback(() => {
    setRequestOpen(true);
    focusRequest();
  }, [focusRequest]);

  const closeRequest = useCallback(() => {
    setRequestOpen(false);
  }, []);

  const handleDraftRestored = useCallback(() => {
    setRequestOpen(true);
    focusRequest();
  }, [focusRequest]);

  return (
    <aside className={styles.detailPanel} aria-labelledby="coverage-state-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Selected state · {state.code}</p>
          <h2 id="coverage-state-heading" tabIndex={-1}>{state.name}</h2>
        </div>
      </div>
      <CoverageSummary state={state} />

      <CoverageSearch stateCode={state.code} stateName={state.name} />

      {!requestOpen ? (
        <button className={styles.requestCoverageButton} type="button" onClick={openRequest}>
          <span>Request coverage</span>
          <small>State required · city and store optional</small>
        </button>
      ) : null}

      <div id="coverage-request">
        <CoverageRequestForm
          state={state}
          visible={requestOpen}
          onCancel={closeRequest}
          onDraftRestored={handleDraftRestored}
        />
      </div>

      <details className={styles.coverageDetails}>
        <summary>How we check this area</summary>
        <div className={styles.coverageDetailsBody}>
          <div className={styles.visibilityGrid}>
            <section>
              <h3>What you can do here</h3>
              <ul>{(state.customerCanSee || state.canSee).map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h3>What is not available yet</h3>
              <ul>{(state.customerCannotSee || state.cannotSee).map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </div>

          {state.areas.length ? (
            <section className={styles.areaSection}>
              <div className={styles.subhead}>
                <p>Store locations</p>
                <h3>{state.scope.knownBoards ? `${state.representedAreaCount} cities and towns with listed stores` : `${state.representedAreaCount} areas with information`}</h3>
              </div>
              <div className={styles.areaList}>
                {state.areas.slice(0, 8).map((area) => <span key={area}>{area}</span>)}
                {state.areas.length > 8 ? <span>+{state.areas.length - 8} more</span> : null}
              </div>
            </section>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
