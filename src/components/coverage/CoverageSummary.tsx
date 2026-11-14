import { Compass, Gauge } from "lucide-react";
import type { CoverageState } from "@/lib/coverage-model";
import { coverageMonitoringFootprint } from "@/lib/welcome-onboarding";
import styles from "./CoverageSummary.module.css";

interface CoverageSummaryProps {
  state: CoverageState;
}

export function CoverageSummary({ state }: CoverageSummaryProps) {
  const footprint = coverageMonitoringFootprint(state);
  const showShipmentCaveat = state.code === "NC" || state.scope.shipmentBoards > 0;

  return (
    <div className={styles.summary}>
      <span className={styles.strength} data-coverage-strength={state.coverageStrength}>
        <Gauge size={13} aria-hidden="true" />
        {state.coverageStrengthLabel}
      </span>

      <dl className={styles.metrics} aria-label="Coverage at a glance">
        <div>
          <Compass size={16} aria-hidden="true" />
          <dt>{footprint.label}</dt>
          <dd>{footprint.count}</dd>
        </div>
      </dl>

      {showShipmentCaveat ? (
        <p className={styles.caveat}>Shipment reports show board or area deliveries—not guaranteed shelf stock.</p>
      ) : null}
    </div>
  );
}
