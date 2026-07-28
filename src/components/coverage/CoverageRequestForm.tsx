"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { US_STATE_OPTIONS, type CoverageState } from "@/lib/coverage-model";
import type { CoverageRequestTargetType, MemberCoverageRequest } from "@/lib/coverage-request";
import { useAuth } from "@/lib/auth";
import { trackCoverageEvent } from "@/lib/coverage-analytics-client";
import styles from "./coverage.module.css";

interface CoverageRequestFormProps {
  state: CoverageState;
  visible: boolean;
  onCancel: () => void;
  onDraftRestored: () => void;
  variant?: "coverage" | "welcome";
}

interface RequestDraft {
  accountId: string | null;
  stateCode: string;
  manualCounty: string;
  manualCity: string;
  manualStoreName: string;
  manualAddress: string;
  notificationEnabled: boolean;
}

export const COVERAGE_REQUEST_DRAFT_KEY = "bourbon_signal_coverage_request_draft";
const DRAFT_KEY = COVERAGE_REQUEST_DRAFT_KEY;

export function CoverageRequestForm({ state, visible, onCancel, onDraftRestored, variant = "coverage" }: CoverageRequestFormProps) {
  const { isLoaded, isSignedIn, user } = useAuth();
  const accountId = user?.id || null;
  const [selectedStateCode, setSelectedStateCode] = useState(state.code);
  const [manualCounty, setManualCounty] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualStoreName, setManualStoreName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [renderedAccountId, setRenderedAccountId] = useState<string | null>(null);
  const started = useRef(false);
  const currentAccountId = useRef(accountId);
  const currentStateCode = useRef(selectedStateCode);
  const submitGeneration = useRef(0);
  const submitController = useRef<AbortController | null>(null);
  currentAccountId.current = accountId;
  currentStateCode.current = selectedStateCode;

  const targetType: CoverageRequestTargetType = manualStoreName.trim() ? "store" : manualCity.trim() ? "city" : manualCounty.trim() ? "county" : "state";
  const accountTransitionPending = !isLoaded
    || (renderedAccountId !== null && renderedAccountId !== accountId);

  useEffect(() => {
    submitController.current?.abort();
    submitGeneration.current += 1;
    setSelectedStateCode(state.code);
    setManualCounty("");
    setManualCity("");
    setManualStoreName("");
    setManualAddress("");
    setNotificationEnabled(false);
    setStatus("idle");
    setMessage("");
    started.current = false;
  }, [state.code]);

  useEffect(() => {
    if (!isLoaded) return;
    if (renderedAccountId && accountId !== renderedAccountId) {
      submitController.current?.abort();
      submitGeneration.current += 1;
      setSelectedStateCode(state.code);
      setManualCounty("");
      setManualCity("");
      setManualStoreName("");
      setManualAddress("");
      setNotificationEnabled(false);
      setStatus("idle");
      setMessage("");
      started.current = false;
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
    setRenderedAccountId(accountId);
  }, [accountId, isLoaded, renderedAccountId, state.code]);

  useEffect(() => {
    if (typeof window === "undefined" || !isLoaded) return;
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null") as RequestDraft | null;
      const validState = stored && US_STATE_OPTIONS.some((option) => option.code === stored.stateCode);
      if (!stored || !validState) return;
      if (stored.accountId && stored.accountId !== accountId) {
        window.sessionStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (stored.stateCode !== state.code) return;
      if (accountId && !stored.accountId) {
        stored.accountId = accountId;
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
      }
      setSelectedStateCode(stored.stateCode);
      setManualCounty(stored.manualCounty || "");
      setManualCity(stored.manualCity || "");
      setManualStoreName(stored.manualStoreName || "");
      setManualAddress(stored.manualAddress || "");
      setNotificationEnabled(stored.notificationEnabled === true);
      onDraftRestored();
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [accountId, isLoaded, onDraftRestored, state.code]);

  const draft: RequestDraft = {
    accountId,
    stateCode: selectedStateCode,
    manualCounty,
    manualCity,
    manualStoreName,
    manualAddress,
    notificationEnabled,
  };
  const returnPath = `/coverage?state=${encodeURIComponent(selectedStateCode)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;
  const signUpHref = "/sign-up?source=coverage";

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackCoverageEvent("coverage_request_started", { state: selectedStateCode, targetType });
  }

  function preserveDraft() {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    markStarted();
  }

  function cancelRequest() {
    window.sessionStorage.removeItem(DRAFT_KEY);
    onCancel();
  }

  function changeState(stateCode: string) {
    submitController.current?.abort();
    submitGeneration.current += 1;
    setSelectedStateCode(stateCode);
    setManualCounty("");
    setManualCity("");
    setManualStoreName("");
    setManualAddress("");
    window.sessionStorage.removeItem(DRAFT_KEY);
    setStatus("idle");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    markStarted();
    if (!accountId) return;
    submitController.current?.abort();
    const controller = new AbortController();
    submitController.current = controller;
    const generation = submitGeneration.current + 1;
    submitGeneration.current = generation;
    const requestAccountId = accountId;
    const requestStateCode = selectedStateCode;
    const requestTargetType = targetType;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/coverage/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: requestTargetType,
          stateCode: requestStateCode,
          areaLabel: requestTargetType === "county" ? manualCounty : manualCity,
          manualCounty,
          manualStoreName,
          manualCity,
          manualAddress,
          notificationEnabled,
        }),
        signal: controller.signal,
      });
      const payload = await response.json() as { request?: MemberCoverageRequest; error?: string };
      if (controller.signal.aborted
        || submitGeneration.current !== generation
        || currentAccountId.current !== requestAccountId
        || currentStateCode.current !== requestStateCode) return;
      if (!response.ok || !payload.request) throw new Error(payload.error || "Coverage request could not be saved.");
      setStatus("saved");
      window.sessionStorage.removeItem(DRAFT_KEY);
      setMessage(payload.request.status === "on_radar" ? "This request is on our radar." : "Request saved. Its status appears below.");
      window.dispatchEvent(new Event("coverage-request-saved"));
      trackCoverageEvent("coverage_request_submitted", { state: requestStateCode, targetType: requestTargetType });
    } catch (error) {
      if (controller.signal.aborted
        || submitGeneration.current !== generation
        || currentAccountId.current !== requestAccountId
        || currentStateCode.current !== requestStateCode) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Coverage request could not be saved.");
    }
  }

  return (
    <section className={`${styles.requestBlock} ${variant === "welcome" ? styles.requestBlockWelcome : ""}`} aria-labelledby="coverage-request-heading" hidden={!visible}>
      <div className={styles.requestHeader}>
        <div className={styles.subhead}>
          <p>{variant === "welcome" ? "Optional" : "Help improve local coverage"}</p>
          <h3 id="coverage-request-heading" tabIndex={-1}>{variant === "welcome" ? "Want Bourbon Signal to cover more near you?" : "Request coverage"}</h3>
        </div>
        {variant === "coverage" ? <button type="button" onClick={cancelRequest}>Cancel</button> : null}
      </div>

      {accountTransitionPending ? (
        <p className={styles.requestAuthLoading} aria-live="polite">Checking account…</p>
      ) : (
        <form onSubmit={submit} onFocusCapture={markStarted}>
          <p className={styles.requestInstructions}>Your state is enough. Add a county, city, or store if there is a particular place you want us to check.</p>

        <label className={styles.requestField}>
          <span>State <small>required</small></span>
          <select name="stateCode" value={selectedStateCode} required onChange={(event) => changeState(event.target.value)}>
            {US_STATE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
          </select>
        </label>

        <label className={styles.requestField}>
          <span>County <small>optional</small></span>
          <input name="manualCounty" value={manualCounty} maxLength={120} onChange={(event) => setManualCounty(event.target.value)} />
        </label>

        <label className={styles.requestField}>
          <span>City or area <small>optional</small></span>
          <input name="manualCity" value={manualCity} maxLength={120} onChange={(event) => setManualCity(event.target.value)} />
        </label>

        <label className={styles.requestField}>
          <span>Store name <small>optional</small></span>
          <input name="manualStoreName" value={manualStoreName} maxLength={180} onChange={(event) => setManualStoreName(event.target.value)} />
        </label>

        <label className={styles.requestField}>
          <span>Street or address detail <small>optional</small></span>
          <input name="manualAddress" value={manualAddress} maxLength={220} onChange={(event) => setManualAddress(event.target.value)} />
        </label>
        <p className={styles.requestPrivacy}>Request details stay private and do not create a public store listing.</p>

        <label className={styles.notificationChoice}>
          <input type="checkbox" checked={notificationEnabled} onChange={(event) => setNotificationEnabled(event.target.checked)} />
          <span>Request coverage and email me when it meaningfully improves.</span>
        </label>

        {isSignedIn ? (
          <button className={styles.requestSubmit} type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving request…" : status === "saved" ? "Request saved" : "Send coverage request"}
          </button>
        ) : (
          <>
            <a className={styles.requestSubmit} href={signUpHref} onClick={preserveDraft}>Create a free account to send this request</a>
            <p className={styles.requestAuthHelp}>No payment or card required.</p>
            <a className={styles.requestSignIn} href={signInHref} onClick={preserveDraft}>Already have an account? Sign in.</a>
          </>
        )}
          <p className={styles.requestPromise}>Requests guide investigation; they do not promise a launch date.</p>
          <p className={status === "error" ? styles.inlineError : styles.requestMessage} aria-live="polite">{message}</p>
        </form>
      )}
    </section>
  );
}
