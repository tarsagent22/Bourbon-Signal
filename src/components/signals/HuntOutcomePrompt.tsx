"use client";

import { useEffect, useMemo, useState } from "react";
import { createSignalApiClient } from "@/lib/signals/signal-api-client";
import type { SignalHuntOutcome } from "@/lib/signals/signal-api-contract";
import {
  huntOutcomePromptStorageKey,
  shouldOfferHuntOutcomePrompt,
  type HuntOutcomePromptSignal,
} from "@/lib/hunt-outcome-prompt";

const OUTCOMES: ReadonlyArray<{ value: SignalHuntOutcome; label: string }> = [
  { value: "found_it", label: "Found it" },
  { value: "gone_when_checked", label: "Gone when I checked" },
  { value: "didnt_go", label: "Didn’t go" },
];

export default function HuntOutcomePrompt({ signalId, signal }: { signalId: string; signal: HuntOutcomePromptSignal }) {
  const api = useMemo(() => createSignalApiClient({
    baseUrl: globalThis.location?.origin || "http://localhost",
  }), []);
  const [outcome, setOutcome] = useState<SignalHuntOutcome | null>(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const now = Date.now();
    if (!shouldOfferHuntOutcomePrompt({ signal, now, lastPromptedAt: null })) return;
    api.getHuntOutcome(signalId).then((response) => {
      if (!active) return;
      if (response.outcome) {
        setOutcome(response.outcome.outcome);
        setVisible(true);
        return;
      }
      const storageKey = huntOutcomePromptStorageKey(signalId);
      const lastPromptedAt = Number(globalThis.localStorage?.getItem(storageKey));
      if (!shouldOfferHuntOutcomePrompt({ signal, now, lastPromptedAt })) return;
      globalThis.localStorage?.setItem(storageKey, String(now));
      setVisible(true);
      setEditing(true);
    }).catch(() => {
      // Authentication or a temporarily inaccessible historical Signal should not create a nag.
    });
    return () => { active = false; };
  }, [api, signal, signalId]);

  async function choose(next: SignalHuntOutcome) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.setHuntOutcome(signalId, next);
      setOutcome(response.outcome?.outcome || next);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That outcome could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;
  const selectedLabel = OUTCOMES.find((item) => item.value === outcome)?.label;

  return (
    <section aria-label="Hunt Outcome" style={{ marginTop: 24, borderTop: "1px solid rgba(245,237,214,0.10)", paddingTop: 18 }}>
      {outcome && !editing ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)", fontSize: 13 }}>
            Hunt Outcome recorded: <strong style={{ color: "var(--color-cream)" }}>{selectedLabel}</strong>
          </p>
          <button type="button" onClick={() => setEditing(true)} style={{ border: 0, background: "transparent", color: "var(--color-accent-amber)", cursor: "pointer", font: "inherit", padding: 8 }}>Edit</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, color: "var(--color-cream)", fontFamily: "var(--font-playfair)", fontSize: 18 }}>How did this hunt go?</h2>
            <p style={{ margin: "4px 0 0", color: "var(--color-text-tertiary)", fontFamily: "var(--font-dm-sans)", fontSize: 12 }}>Optional and private. One tap helps measure whether expired Signals were useful.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {OUTCOMES.map((item) => (
              <button key={item.value} type="button" disabled={saving} onClick={() => void choose(item.value)} style={{ minHeight: 42, border: "1px solid rgba(196,148,58,0.30)", borderRadius: 999, background: outcome === item.value ? "rgba(196,148,58,0.16)" : "rgba(255,255,255,0.035)", color: "var(--color-cream)", cursor: saving ? "progress" : "pointer", padding: "8px 12px", fontFamily: "var(--font-dm-sans)", fontSize: 12, fontWeight: 700 }}>{item.label}</button>
            ))}
          </div>
          {error ? <p role="alert" style={{ margin: 0, color: "#D77A61", fontSize: 12 }}>{error}</p> : null}
        </div>
      )}
    </section>
  );
}
