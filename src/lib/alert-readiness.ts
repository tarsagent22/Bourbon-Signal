import { createHash, timingSafeEqual } from "node:crypto";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const booleans = ["dryRun", "snapshotFresh", "deliveryEnabled", "onSiteDeliveryEnabled", "emailDeliveryEnabled", "smsDeliveryEnabled", "emailClientConfigured", "smsClientConfigured", "monitorOnly"] as const;
const counts = [
  "rawEligibleCandidateCount", "candidateCount", "skippedSafetyGuardrail", "usersConsidered", "paidUsersConsidered", "skippedFreeUsers", "skippedNoAreaPreferences",
  "usersWithOnSiteEnabled", "usersWithPushEnabled", "usersWithEmailEnabled", "usersWithSmsEnabled", "usersMatched", "onSiteAlertsCreated",
  "pushNotificationsSent", "pushNotificationsWouldSend", "emailsSent", "emailsWouldSend", "smsSent", "smsWouldSend",
  "skippedEmailDeliveryDisabled", "skippedSmsDeliveryDisabled", "skippedEmailRecipientNotAllowed", "skippedSmsRecipientNotAllowed", "skippedEmailBaseline", "skippedSmsBaseline",
  "onSiteBaselinesCreated", "emailBaselinesCreated", "smsBaselinesCreated", "skippedNoEmail", "skippedDedupe", "skippedOnSiteDedupe", "skippedSpecificBottlePrefs",
  "skippedFinalOnSiteFreshness", "skippedFinalEmailFreshness", "skippedFinalSmsFreshness", "queueIntentsObserved", "queueClaimsGranted", "queueSuppressed", "queueDuplicatesSkipped",
  "queueFailures", "queueStaleClaimsRecovered", "dedupeIdentityMigrations", "dedupeIdentityMigrationFailures",
] as const;

const pushHealthCounts = ["pendingTickets", "maxReceiptLagSeconds", "delivered", "rejected", "unknown", "staleDevices", "invalidDevices"] as const;
const pushReasonClasses = new Set(["receipt_ok", "device_not_registered", "receipt_rejected", "provider_transient", "receipt_retry_exhausted", "malformed_receipt_response", "partial_receipt_response", "unknown_receipt_ids", "account_deleted_after_acceptance"]);

function sanitizePushHealth(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid push health result");
  const source = value as Record<string, unknown>;
  const health: Record<string, number | Record<string, number>> = {};
  for (const field of pushHealthCounts) {
    const value = source[field];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid push health count");
    health[field] = value;
  }
  const reasons: Record<string, number> = {};
  if (source.reasonClasses && typeof source.reasonClasses === "object" && !Array.isArray(source.reasonClasses)) {
    for (const [reason, value] of Object.entries(source.reasonClasses as Record<string, unknown>)) {
      if (pushReasonClasses.has(reason) && typeof value === "number" && Number.isSafeInteger(value) && value >= 0) reasons[reason] = value;
    }
  }
  health.reasonClasses = reasons;
  return health;
}

export function createAlertReadinessHandler(options: {
  secret: () => string | undefined;
  read: () => Promise<unknown>;
  pushHealth?: () => Promise<unknown>;
  now?: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    const expected = options.secret();
    const authorization = request.headers.get("authorization") || "";
    if (!expected || expected.length < 32 || authorization.length > 512 || !authorization.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(expected), digest(authorization.slice(7)))) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers });
    if (new URL(request.url).search) return Response.json({ error: "Query controls are not supported" }, { status: 400, headers });
    try {
      const value = await options.read();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid readiness result");
      const data = value as Record<string, unknown>;
      if (data.dryRun !== true) throw new Error("Read-only mode required");
      for (const field of ["emailsSent", "smsSent", "pushNotificationsSent"] as const) {
        if (data[field] !== undefined && data[field] !== 0) throw new Error("Unexpected mutation report");
      }
      const summary: Record<string, boolean | number | string> = {};
      for (const field of booleans) if (typeof data[field] === "boolean") summary[field] = data[field];
      for (const field of counts) {
        const count = data[field];
        if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) summary[field] = count;
      }
      // Canonical dry-run counts simulated inbox construction as "created".
      // Adapt only this read-only response; retain the legacy delivery contract.
      if (typeof summary.onSiteAlertsCreated === "number") {
        summary.onSiteAlertsWouldCreate = summary.onSiteAlertsCreated;
        summary.onSiteAlertsCreated = 0;
      }
      if (["remote-snapshot", "local-export", "cache-fallback", "empty-fallback"].includes(String(data.snapshotSource))) summary.snapshotSource = String(data.snapshotSource);
      if (["off", "shadow", "active"].includes(String(data.queueMode))) summary.queueMode = String(data.queueMode);
      const pushDelivery = options.pushHealth ? sanitizePushHealth(await options.pushHealth()) : null;
      return Response.json({ contractVersion: "bourbon-signal-alert-readiness-v2", generatedAt: (options.now || (() => new Date().toISOString()))(), summary,
        errorCount: Array.isArray(data.errors) ? data.errors.length : 0,
        deviceReceiptProven: Boolean(pushDelivery && Number(pushDelivery.delivered) > 0),
        ...(pushDelivery ? { pushDelivery } : {}),
      }, { headers });
    } catch {
      return Response.json({ error: "Alert diagnostics unavailable" }, { status: 503, headers });
    }
  };
}
