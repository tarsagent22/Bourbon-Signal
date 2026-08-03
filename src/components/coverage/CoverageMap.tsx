"use client";

import type { KeyboardEvent } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import statesTopology from "us-atlas/states-10m.json";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { CoverageState } from "@/lib/coverage-model";
import styles from "./coverage.module.css";

interface CoverageMapProps {
  states: CoverageState[];
  selectedCode: string;
  onSelect: (stateCode: string) => void;
}

interface StateProperties {
  name?: string;
}

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 600;
const topology = statesTopology as unknown as Topology<{
  states: GeometryCollection<StateProperties>;
}>;
const stateFeatures = feature(
  topology,
  topology.objects.states,
) as unknown as FeatureCollection<Geometry, StateProperties>;
const projection = geoAlbersUsa().fitExtent(
  [[14, 14], [VIEW_WIDTH - 14, VIEW_HEIGHT - 14]],
  stateFeatures,
);
const path = geoPath(projection);
const STATE_CODE_BY_NAME = new Map<string, string>([
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"], ["California", "CA"],
  ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"], ["District of Columbia", "DC"], ["Florida", "FL"],
  ["Georgia", "GA"], ["Hawaii", "HI"], ["Idaho", "ID"], ["Illinois", "IL"], ["Indiana", "IN"],
  ["Iowa", "IA"], ["Kansas", "KS"], ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"],
  ["Maryland", "MD"], ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"], ["Mississippi", "MS"],
  ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"], ["Nevada", "NV"], ["New Hampshire", "NH"],
  ["New Jersey", "NJ"], ["New Mexico", "NM"], ["New York", "NY"], ["North Carolina", "NC"], ["North Dakota", "ND"],
  ["Ohio", "OH"], ["Oklahoma", "OK"], ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"],
  ["South Carolina", "SC"], ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"],
  ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"], ["West Virginia", "WV"], ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
]);

const MAPPED_STATES = stateFeatures.features.flatMap((stateFeature) => {
  const code = STATE_CODE_BY_NAME.get(stateFeature.properties?.name || "");
  return code ? [{ code, feature: stateFeature }] : [];
});

export function CoverageMap({ states, selectedCode, onSelect }: CoverageMapProps) {
  const statesByCode = new Map(states.map((state) => [state.code, state]));

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, stateCode: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(stateCode);
    }
  }

  return (
    <div className={styles.mapFrame}>
      <svg
        className={styles.mapSvg}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="group"
        aria-label="United States coverage map"
      >
        <desc>Colors show the strength of verified coverage sources. Update status is shown separately after you select a state.</desc>
        {MAPPED_STATES.map(({ code, feature: stateFeature }) => {
          const state = statesByCode.get(code);
          if (!state) return null;
          const selected = selectedCode === state.code;
          return (
            <g
              key={state.code}
              className={styles.stateCell}
              data-coverage-strength={state.coverageStrength}
              data-selected={selected}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${state.name}: ${state.coverageStrengthLabel}; ${state.healthLabel}`}
              onClick={() => onSelect(state.code)}
              onKeyDown={(event) => handleKeyDown(event, state.code)}
            >
              <title>{state.name}: {state.coverageStrengthLabel}</title>
              <path className={styles.stateShape} d={path(stateFeature as Feature) || undefined} />
            </g>
          );
        })}
      </svg>
      <div className={styles.mapLegend} aria-label="Coverage strength legend">
        <span>Coverage strength</span>
        <ul>
          <li aria-label="Strong coverage" data-coverage-strength="strong"><i aria-hidden="true" />Strong</li>
          <li aria-label="Moderate coverage" data-coverage-strength="moderate"><i aria-hidden="true" />Moderate</li>
          <li aria-label="Sparse coverage" data-coverage-strength="sparse"><i aria-hidden="true" />Sparse</li>
          <li aria-label="No coverage" data-coverage-strength="none"><i aria-hidden="true" />No coverage</li>
        </ul>
      </div>
      <p className={styles.mapCaption}>Color shows the breadth of verified coverage sources. Select a state for its update status and what is available now.</p>
    </div>
  );
}
