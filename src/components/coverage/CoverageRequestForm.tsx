"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CoverageSearchResult, CoverageState } from "@/lib/coverage-model";
import type { CoverageRequestTargetType, MemberCoverageRequest } from "@/lib/coverage-request";
import { useAuth } from "@/lib/auth";
import { trackCoverageEvent } from "@/lib/coverage-analytics-client";
import styles from "./coverage.module.css";

interface CoverageRequestFormProps {
  state: CoverageState;
  target: CoverageSearchResult | null;
  visible: boolean;
  onCancel: () => void;
  onDraftRestored: () => void;
}

interface RequestDraft {
  stateCode: string;
  targetType: CoverageRequestTargetType;
  areaLabel: string;
  storeId: string;
  manualStoreName: string;
  manualCity: string;
  manualAddress: string;
}

const DRAFT_KEY = "bourbon_signal_coverage_request_draft";

export function CoverageRequestForm({ state, target, visible, onCancel, onDraftRestored }: CoverageRequestFormProps) {
  const { isLoaded, isSignedIn, user } = useAuth();
  const accountId = user?.id || null;
  const [targetType, setTargetType] = useState<CoverageRequestTargetType>("state");
  const [areaLabel, setAreaLabel] = useState("");
  const [storeId, setStoreId] = useState("");
  const [manualStoreName, setManualStoreName] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const started = useRef(false);
  const previousAccountId = useRef<string | null>(null);
  const currentAccountId = useRef(accountId);
  const currentStateCode = useRef(state.code);
  const submitGeneration = useRef(0);
  const submitController = useRef<AbortController | null>(null);
  currentAccountId.current = accountId;
  currentStateCode.current = state.code;

  useEffect(() => {
    setStatus("idle");
    setMessage("");
    setAreaLabel("");
    setStoreId("");
    setManualStoreName("");
    setManualCity("");
    setManualAddress("");
    if (!target) {
      setTargetType("state");
      return;
    }
    if (target.kind === "city") {
      setTargetType("city");
      setAreaLabel(target.city || target.label);
      setStoreId("");
      return;
    }
    if (target.kind === "store") {
      setTargetType("store");
      setStoreId(target.storeId || "");
      setManualStoreName(target.label);
      setManualCity(target.city || "");
      setManualAddress(target.address || "");
      return;
    }
    setTargetType("store");
    setStoreId("");
    setAreaLabel(target.label);
    setManualStoreName(target.label);
  }, [target]);

  useEffect(() => {
    submitController.current?.abort();
    submitGeneration.current += 1;
    setTargetType("state");
    setAreaLabel("");
    setStoreId("");
    setManualStoreName("");
    setManualCity("");
    setManualAddress("");
    setNotificationEnabled(false);
    setStatus("idle");
    setMessage("");
    started.current = false;
  }, [state.code]);

  useEffect(() => {
    const previous = previousAccountId.current;
    if (accountId && previous && accountId !== previous) {
      submitController.current?.abort();
      submitGeneration.current += 1;
      setTargetType("state");
      setAreaLabel("");
      setStoreId("");
      setManualStoreName("");
      setManualCity("");
      setManualAddress("");
      setNotificationEnabled(false);
      setStatus("idle");
      setMessage("");
      started.current = false;
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
    if (accountId) previousAccountId.current = accountId;
  }, [accountId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || "null") as RequestDraft | null;
      if (!stored || stored.stateCode !== state.code) return;
      setTargetType(stored.targetType);
      setAreaLabel(stored.areaLabel);
      setStoreId(stored.storeId);
      setManualStoreName(stored.manualStoreName);
      setManualCity(stored.manualCity);
      setManualAddress(stored.manualAddress);
      onDraftRestored();
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [onDraftRestored, state.code]);

  const draft: RequestDraft = {
    stateCode: state.code,
    targetType,
    areaLabel,
    storeId,
    manualStoreName,
    manualCity,
    manualAddress,
  };
  const returnPath = `/coverage?state=${encodeURIComponent(state.code)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackCoverageEvent("coverage_request_started", { state: state.code, targetType });
  }

  function preserveDraft() {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    markStarted();
  }

  function cancelRequest() {
    window.sessionStorage.removeItem(DRAFT_KEY);
    onCancel();
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
    const requestStateCode = state.code;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/coverage/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          stateCode: requestStateCode,
          areaLabel,
          storeId: storeId || undefined,
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
      trackCoverageEvent("coverage_request_submitted", { state: requestStateCode, targetType });
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
    <section className={styles.requestBlock} aria-labelledby="coverage-request-heading" hidden={!visible}>
      <div className={styles.requestHeader}>
        <div className={styles.subhead}>
          <p>Help improve local coverage</p>
          <h3 id="coverage-request-heading" tabIndex={-1}>Request coverage</h3>
        </div>
        <button type="button" onClick={cancelRequest}>Cancel</button>
      </div>

      <form onSubmit={submit} onFocusCapture={markStarted}>
        {target?.kind === "unknown" ? (
          <fieldset className={styles.targetChoices}>
            <legend>Is this a city or store?</legend>
            {(["city", "store"] as const).map((kind) => (
              <label key={kind}>
                <input type="radio" name="coverage-target" value={kind} checked={targetType === kind} onChange={() => setTargetType(kind)} />
                <span>{kind === "city" ? "City / area" : "Store"}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {targetType === "state" ? <p className={styles.requestTargetSummary}>{state.name} statewide expansion</p> : null}

        {targetType === "city" ? (
          <label className={styles.requestField}>
            <span>City or area</span>
            <input value={areaLabel} maxLength={120} required onChange={(event) => setAreaLabel(event.target.value)} />
          </label>
        ) : null}

        {targetType === "store" ? storeId ? (
          <div className={styles.matchedStore}>
            <span>Matched store</span>
            <strong>{target?.label || manualStoreName}</strong>
            <button type="button" onClick={() => { setStoreId(""); setManualStoreName(target?.label || ""); }}>Use manual details instead</button>
          </div>
        ) : (
          <div className={styles.manualStoreFields}>
            <label className={styles.requestField}>
              <span>Store name</span>
              <input name="manualStoreName" value={manualStoreName} maxLength={180} required onChange={(event) => setManualStoreName(event.target.value)} />
            </label>
            <label className={styles.requestField}>
              <span>City</span>
              <input name="manualCity" value={manualCity} maxLength={120} required onChange={(event) => setManualCity(event.target.value)} />
            </label>
            <label className={styles.requestField}>
              <span>Street or address detail <small>optional</small></span>
              <input name="manualAddress" value={manualAddress} maxLength={220} onChange={(event) => setManualAddress(event.target.value)} />
            </label>
            <p>Manual details stay private in the request queue and do not create a public store.</p>
          </div>
        ) : null}

        <label className={styles.notificationChoice}>
          <input type="checkbox" checked={notificationEnabled} onChange={(event) => setNotificationEnabled(event.target.checked)} />
          <span>Request coverage and email me when it meaningfully improves.</span>
        </label>

        {!isLoaded ? (
          <button className={styles.requestSubmit} type="button" disabled>Checking account…</button>
        ) : isSignedIn ? (
          <button className={styles.requestSubmit} type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving request…" : status === "saved" ? "Request saved" : "Send coverage request"}
          </button>
        ) : (
          <a className={styles.requestSubmit} href={signInHref} onClick={preserveDraft}>Sign in to send this request</a>
        )}
        <p className={styles.requestPromise}>Requests guide investigation; they do not promise a launch date.</p>
        <p className={status === "error" ? styles.inlineError : styles.requestMessage} aria-live="polite">{message}</p>
      </form>
    </section>
  );
}
