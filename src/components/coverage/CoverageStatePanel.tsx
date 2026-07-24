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
  if (state.health === "current") return "Sources working normally";
  if (state.health === "intermittent") return "Sources updating intermittently";
  if (state.health === "temporarily-limited") return "Some sources are temporarily limited";
  return state.capability === "not-active" ? "No active monitoring source" : "No recent source update";
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
        <span className={styles.capabilityBadge} data-capability={state.capability}>{state.capabilityLabel}</span>
      </div>

      <div className={styles.healthRow}>
        <span>Source status</span>
        <strong data-health={state.health}>{healthCopy(state)}</strong>
      </div>
      <p className={styles.stateSummary}>{state.summary}</p>

      {state.representedAreaCount || state.monitoredStoreCount ? (
        <div className={styles.quickFacts} aria-label="Coverage at a glance">
          {state.representedAreaCount ? <span><strong>{state.representedAreaCount}</strong> represented areas</span> : null}
          {state.monitoredStoreCount ? <span><strong>{state.monitoredStoreCount}</strong> monitored stores</span> : null}
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
        <summary>How coverage works</summary>
        <div className={styles.coverageDetailsBody}>
          {state.sourceLabel ? <p className={styles.sourceLine}>Primary source: <strong>{state.sourceLabel}</strong></p> : null}

          {state.precisions.length ? (
            <div className={styles.precisionList} aria-label="Coverage precision">
              {state.precisions.map((precision) => <span key={precision}>{precision}</span>)}
            </div>
          ) : null}

          <div className={styles.visibilityGrid}>
            <section>
              <h3>What we can see</h3>
              <ul>{state.canSee.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h3>What we cannot yet see</h3>
              <ul>{state.cannotSee.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </div>

          <section className={styles.layerSection} aria-labelledby="coverage-layers-heading">
            <div className={styles.subhead}>
              <p>Coverage detail</p>
              <h3 id="coverage-layers-heading">Store monitoring levels</h3>
            </div>
            <dl className={styles.layerGrid}>
              <div><dt>Known stores</dt><dd>{state.layers.known}</dd></div>
              <div><dt>Monitored stores</dt><dd>{state.layers.probeable}</dd></div>
              <div><dt>Catalog tracking</dt><dd>{state.layers.catalogWatch}</dd></div>
              <div><dt>Inventory monitoring</dt><dd>{state.layers.live}</dd></div>
              <div><dt>Alert-ready</dt><dd>{state.layers.alertGrade}</dd></div>
            </dl>
          </section>

          {state.areas.length ? (
            <section className={styles.areaSection}>
              <div className={styles.subhead}>
                <p>Represented areas</p>
                <h3>{state.representedAreaCount} cities, counties, boards, or source areas</h3>
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
