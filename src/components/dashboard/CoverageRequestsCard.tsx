"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MemberCoverageRequest } from "@/lib/coverage-request";
import { useAuth } from "@/lib/auth";
import styles from "./CoverageRequestsCard.module.css";

const STATUS_LABELS: Record<MemberCoverageRequest["status"], string> = {
  requested: "Requested",
  on_radar: "On our radar",
  improved: "Coverage improved",
  closed: "Closed",
};

function targetLabel(request: MemberCoverageRequest) {
  if (request.targetType === "store") return request.storeName || request.areaLabel;
  return request.areaLabel;
}

export type CoverageRequestsEmptyMode = "compact" | "hidden";

export function CoverageRequestsCard({ emptyMode = "compact" }: { emptyMode?: CoverageRequestsEmptyMode }) {
  const { isLoaded, isSignedIn, user } = useAuth();
  const accountId = user?.id || null;
  const [requests, setRequests] = useState<MemberCoverageRequest[]>([]);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const loadSequence = useRef(0);

  const loadRequests = useCallback((forAccountId: string, signal?: AbortSignal) => {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    setStatus("loading");
    fetch("/api/coverage/requests", { signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { requests?: MemberCoverageRequest[] };
        if (!response.ok || !Array.isArray(payload.requests)) throw new Error("Request status unavailable");
        if (signal?.aborted || loadSequence.current !== sequence) return;
        setRequests(payload.requests);
        setLoadedAccountId(forAccountId);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (signal?.aborted || loadSequence.current !== sequence) return;
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !accountId) return;
    let controller: AbortController | null = null;
    setRequests([]);
    setLoadedAccountId(null);
    setStatus("loading");
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      loadRequests(accountId, controller.signal);
    };
    refresh();
    window.addEventListener("coverage-request-saved", refresh);
    return () => {
      controller?.abort();
      loadSequence.current += 1;
      window.removeEventListener("coverage-request-saved", refresh);
    };
  }, [accountId, isLoaded, isSignedIn, loadRequests]);

  if (!isLoaded || !isSignedIn || !accountId) return null;
  const visibleRequests = loadedAccountId === accountId ? requests : [];
  const visibleStatus = loadedAccountId === accountId ? status : "loading";

  if (visibleStatus === "loading") return null;
  if (visibleStatus === "error" && emptyMode === "hidden") return null;
  if (visibleStatus === "ready" && visibleRequests.length === 0) {
    if (emptyMode === "hidden") return null;
    return (
      <Link className={styles.compactLink} href="/coverage">
        <span><strong>Check coverage near you</strong><small>Search your state, city, or regular store.</small></span>
        <span aria-hidden="true">→</span>
      </Link>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="member-coverage-requests-heading">
      <div className={styles.heading}>
        <div>
          <p>Expansion loop</p>
          <h2 id="member-coverage-requests-heading">Coverage requests</h2>
        </div>
        <Link href="/coverage">Explore coverage</Link>
      </div>
      <div aria-live="polite">
        {visibleStatus === "error" ? (
          <p className={styles.message}>Request status is temporarily unavailable. Your saved requests have not been removed.</p>
        ) : (
          <ul className={styles.list}>
            {visibleRequests.map((request) => (
              <li key={request.id}>
                <span className={styles.targetType}>{request.targetType === "city" ? "City / area" : request.targetType}</span>
                <strong>{targetLabel(request)}</strong>
                <span className={styles.stateCode}>{request.stateCode}</span>
                <span className={styles.status} data-status={request.status}>{STATUS_LABELS[request.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={styles.note}>Requests guide source investigation. They do not include a promised date.</p>
    </section>
  );
}
