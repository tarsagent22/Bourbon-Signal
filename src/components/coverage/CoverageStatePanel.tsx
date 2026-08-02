"use client";

import { useCallback, useState } from "react";
import type { CoverageState } from "@/lib/coverage-model";
import { CoverageSearch } from "./CoverageSearch";
import { CoverageRequestForm } from "./CoverageRequestForm";
import styles from "./coverage.module.css";

interface CoverageStatePanelProps {
  state: CoverageState;
}

function healthCopy(state: CoverageState) {
  if (state.health === "current") return "Information is current";
  if (state.health === "intermittent") return "Updates are intermittent";
  if (state.health === "temporarily-limited") return "Some information is temporarily limited";
  return state.coverageStatus === "not-available" ? "Not available yet" : "No recent update";
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
        <span className={styles.capabilityBadge} data-coverage-status={state.coverageStatus}>{state.coverageStatusLabel}</span>
      </div>
      <div className={styles.healthRow}>
        <span>Update status</span>
        <strong data-health={state.health}>{healthCopy(state)}</strong>
      </div>
      <p className={styles.stateSummary}>{state.customerSummary || state.summary}</p>

      {state.representedAreaCount || state.scope.searchableStores || state.scope.inventoryMonitoredStores ? (
        <div className={styles.quickFacts} aria-label="Coverage at a glance">
          {state.representedAreaCount ? <span><strong>{state.representedAreaCount}</strong> {state.scope.knownBoards ? "store cities and towns" : "represented areas"}</span> : null}
          {state.scope.shipmentBoards ? <span><strong>{state.scope.shipmentBoards}</strong> official local pages with shipment information</span> : null}
          {state.scope.searchableStores ? <span><strong>{state.scope.searchableStores}</strong> stores listed</span> : null}
          {state.scope.inventoryMonitoredStores ? <span><strong>{state.scope.inventoryMonitoredStores}</strong> stores with current availability</span> : null}
        </div>
      ) : null}

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
