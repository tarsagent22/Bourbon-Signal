import type {
  AlertCandidateInput,
  AlertCandidateBatchInput,
  AlertCandidateRecord,
  AlertQueueRepository,
} from "./repository";

export type AlertQueueMode = "shadow" | "active";

export type AlertDeliveryReservation = {
  candidate: AlertCandidateRecord;
  claimed: boolean;
  reason: "shadow_enqueued" | "claimed" | "retry_not_due" | "already_claimed" | "already_delivered" | "suppressed" | "terminal_failure" | "claim_lost";
};

export async function reserveAlertDelivery(
  repository: AlertQueueRepository,
  input: AlertCandidateInput,
  options: { mode: AlertQueueMode; workerId: string; now: string },
): Promise<AlertDeliveryReservation> {
  const candidate = await repository.enqueue(input);
  if (options.mode === "shadow") {
    if (candidate.status === "suppressed") return { candidate, claimed: false, reason: "suppressed" };
    if (candidate.status === "delivered") return { candidate, claimed: false, reason: "already_delivered" };
    if (candidate.status === "claimed") return { candidate, claimed: false, reason: "already_claimed" };
    if (candidate.status === "failed") return { candidate, claimed: false, reason: "terminal_failure" };
    return { candidate, claimed: false, reason: "shadow_enqueued" };
  }
  if (candidate.status === "claimed") return { candidate, claimed: false, reason: "already_claimed" };
  if (candidate.status === "delivered") return { candidate, claimed: false, reason: "already_delivered" };
  if (candidate.status === "suppressed") return { candidate, claimed: false, reason: "suppressed" };
  if (candidate.status === "failed") return { candidate, claimed: false, reason: "terminal_failure" };
  if (candidate.nextAttemptAt && candidate.nextAttemptAt > options.now) {
    return { candidate, claimed: false, reason: "retry_not_due" };
  }
  const claimed = await repository.claim(candidate.id, options.workerId, options.now);
  if (!claimed) {
    const current = await repository.get(candidate.id) || candidate;
    const reason = current.status === "claimed" ? "already_claimed" : "claim_lost";
    return { candidate: current, claimed: false, reason };
  }
  return { candidate: claimed, claimed: true, reason: "claimed" };
}

export async function reserveAlertDeliveryBatch(
  repository: AlertQueueRepository,
  input: AlertCandidateBatchInput,
  options: { mode: AlertQueueMode; workerId: string; now: string },
) {
  if (input.alertWindow !== "stable-v2") {
    throw new Error("Underlying alert batches must use the stable-v2 alert window");
  }
  const claimed = await repository.reserveBatch(
    input,
    options.workerId,
    options.now,
    options.mode === "active",
  );
  return { claimed };
}
