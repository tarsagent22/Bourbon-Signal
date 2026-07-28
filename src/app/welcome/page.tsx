"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { STATE_LIFECYCLE_CONFIG } from "@/config/stateLifecycle";
import { recordGrowthMilestone } from "@/lib/growth-client";
import { useAuth } from "@/lib/auth";
import { AVAILABLE_STATES, useStatePreferences } from "@/lib/statePreferences";
import styles from "./welcome.module.css";

type LifecycleEntry = {
  customerLabel?: string;
  customerSummary?: string;
  coverageTier?: string;
  refinementLevel?: string;
};

const lifecycleStates = STATE_LIFECYCLE_CONFIG.states as Record<string, LifecycleEntry>;

export default function WelcomePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { selectedStates, setSelectedStates } = useStatePreferences();
  const initialState = selectedStates.length === 1 && AVAILABLE_STATES.some((state) => state.code === selectedStates[0])
    ? selectedStates[0]
    : "";
  const [selectedState, setSelectedState] = useState(initialState);
  const registrationRecorded = useRef(false);
  const coverage = selectedState ? lifecycleStates[selectedState] : null;
  const activeStates = useMemo(
    () => [...AVAILABLE_STATES].filter((state) => state.active).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  useEffect(() => {
    const registrationCompleted = new URLSearchParams(window.location.search).get("registration") === "1";
    if (!registrationCompleted || !isLoaded || !isSignedIn || registrationRecorded.current) return;
    registrationRecorded.current = true;
    void recordGrowthMilestone("registration_completed", { surface: "welcome" }).then((recorded) => {
      if (recorded) window.history.replaceState({}, "", "/welcome");
      else registrationRecorded.current = false;
    });
  }, [isLoaded, isSignedIn]);

  const openStatePreview = () => {
    if (!selectedState) return;
    setSelectedStates([selectedState]);
    void recordGrowthMilestone("onboarding_state_selected", {
      surface: "welcome",
      kind: "state_selection",
      market: selectedState,
    }, { navigation: true });
    window.location.href = `/?state=${encodeURIComponent(selectedState)}#drops`;
  };

  return (
    <>
      <Navigation />
      <main className={styles.page}>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>Free account created · no card required</p>
          <h1 className={styles.title}>Choose the state you want to hunt first.</h1>
          <p className={styles.copy}>
            We will open the freshest eligible signals for one active market in the existing Drop Feed. Your free account includes the latest seven signals, three Bottle Checks, public Release Radar, and Member Sightings.
          </p>

          <div className={styles.stateStep}>
            <label htmlFor="welcome-state">Your first state</label>
            <select
              id="welcome-state"
              value={selectedState}
              onChange={(event) => setSelectedState(event.target.value)}
              required
            >
              <option value="">Choose one active state</option>
              {activeStates.map((state) => (
                <option key={state.code} value={state.code}>{state.name}</option>
              ))}
            </select>

            <div className={styles.coverage} aria-live="polite">
              {coverage ? (
                <>
                  <strong>What we can show in {coverage.customerLabel || selectedState}</strong>
                  <p>{coverage.customerSummary}</p>
                </>
              ) : (
                <>
                  <strong>Coverage is source-specific.</strong>
                  <p>Choose a state to see the current customer-facing coverage summary. Some markets provide live store inventory; others provide verified delivery, release, or warehouse leads.</p>
                </>
              )}
            </div>

            <button
              type="button"
              className={styles.primaryAction}
              disabled={!selectedState}
              onClick={openStatePreview}
            >
              See my state's latest signals
            </button>
          </div>

          <div className={styles.nextActions} aria-label="More free ways to start">
            <Link href="/bottle-check" className={styles.secondaryAction}>
              <span>Next</span>
              <strong>Check a bottle</strong>
              <small>Use one of three free Bottle Checks on a bottle already on your mind.</small>
            </Link>
            <Link href="/release-radar" className={styles.tertiaryAction}>Explore public Release Radar</Link>
          </div>

          <p className={styles.membershipLink}>
            Want the full state feed and saved alerts after you explore? <Link href="/pricing?source=welcome">See membership options</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
