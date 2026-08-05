import { Compass, Gauge } from "lucide-react";
import type { CoverageState } from "@/lib/coverage-model";
import styles from "./CoverageSummary.module.css";

interface CoverageSummaryProps {
  state: CoverageState;
}

export function CoverageSummary({ state }: CoverageSummaryProps) {
  const showNcBoards = state.code === "NC" && state.scope.knownBoards > 0;
  const showShipmentCaveat = state.code === "NC" || state.scope.shipmentBoards > 0;

  return (
    <div className={styles.summary}>
      <span className={styles.strength} data-coverage-strength={state.coverageStrength}>
        <Gauge size={13} aria-hidden="true" />
        {state.coverageStrengthLabel}
      </span>

      {showNcBoards ? (
        <dl className={styles.metrics} aria-label="Coverage at a glance">
          {showNcBoards ? (
            <div>
              <Compass size={16} aria-hidden="true" />
              <dt>NC ABC boards monitored</dt>
              <dd>{state.scope.knownBoards}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {showShipmentCaveat ? (
        <p className={styles.caveat}>Shipment reports show board or area deliveries—not guaranteed shelf stock.</p>
      ) : null}
    </div>
  );
}
