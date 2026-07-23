"use client";

import { useCallback } from "react";
import type { CoverageSearchResult, CoverageState } from "@/lib/coverage-model";
import { CoverageSearch } from "./CoverageSearch";
import { CoverageRequestForm } from "./CoverageRequestForm";
import styles from "./coverage.module.css";

interface CoverageStatePanelProps {
  state: CoverageState;
  selectedTarget: CoverageSearchResult | null;
  onTargetSelected: (target: CoverageSearchResult | null) => void;
}

export function CoverageStatePanel({ state, selectedTarget, onTargetSelected }: CoverageStatePanelProps) {
  const handleTargetSelected = useCallback((target: CoverageSearchResult | null) => {
    onTargetSelected(target);
  }, [onTargetSelected]);

  return (
    <aside className={styles.detailPanel} aria-labelledby="coverage-state-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>State detail · {state.code}</p>
          <h2 id="coverage-state-heading" tabIndex={-1}>{state.name}</h2>
        </div>
        <span className={styles.capabilityBadge} data-capability={state.capability}>{state.capabilityLabel}</span>
      </div>

      <div className={styles.healthRow}>
        <span>Source health</span>
        <strong data-health={state.health}>{state.healthLabel}</strong>
      </div>
      <p className={styles.stateSummary}>{state.summary}</p>
      {state.sourceLabel ? <p className={styles.sourceLine}>Source lane: <strong>{state.sourceLabel}</strong></p> : null}

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
          <p>Source layers</p>
          <h3 id="coverage-layers-heading">Directory to alert-grade</h3>
        </div>
        <dl className={styles.layerGrid}>
          <div><dt>Known stores</dt><dd>{state.layers.known}</dd></div>
          <div><dt>Probeable</dt><dd>{state.layers.probeable}</dd></div>
          <div><dt>Catalog / watch</dt><dd>{state.layers.catalogWatch}</dd></div>
          <div><dt>Live inventory</dt><dd>{state.layers.live}</dd></div>
          <div><dt>Alert-grade</dt><dd>{state.layers.alertGrade}</dd></div>
        </dl>
      </section>

      {state.areas.length ? (
        <section className={styles.areaSection}>
          <div className={styles.subhead}>
            <p>Represented areas</p>
            <h3>Cities, counties, boards, and source areas</h3>
          </div>
          <div className={styles.areaList}>
            {state.areas.slice(0, 16).map((area) => <span key={area}>{area}</span>)}
            {state.areas.length > 16 ? <span>+{state.areas.length - 16} more</span> : null}
          </div>
        </section>
      ) : null}

      <CoverageSearch stateCode={state.code} stateName={state.name} onTargetSelected={handleTargetSelected} />
      <div id="coverage-request"><CoverageRequestForm state={state} target={selectedTarget} /></div>
    </aside>
  );
}
