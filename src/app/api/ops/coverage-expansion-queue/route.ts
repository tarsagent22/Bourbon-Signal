import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeOpsBearer } from "@/lib/ops-auth";
import { parseCoverageAutomationResult } from "@/lib/coverage-automation-result";
import { getCoverageRequestRepository, type CoverageAutomationJob } from "@/lib/coverage-request-repository";

export const dynamic = "force-dynamic";

const CONTRACT_VERSION = "bourbon-signal/coverage-expansion-queue@2";
const MAX_BODY_BYTES = 32_768;
const OPAQUE = /^[a-zA-Z0-9:|._/@+-]{1,340}$/;
const TASK_ID = /^t_[a-zA-Z0-9]{4,80}$/;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function claimSecret() {
  const secret = process.env.COVERAGE_AUTOMATION_CLAIM_SECRET;
  if (!secret) throw new Error("Coverage automation claim authentication is not configured.");
  return secret;
}

function outcomeSecret() {
  const secret = process.env.COVERAGE_AUTOMATION_OUTCOME_SECRET;
  if (!secret) throw new Error("Coverage automation outcome authentication is not configured.");
  return secret;
}

function authorityCapability(jobKey: string) {
  const secret = process.env.COVERAGE_AUTOMATION_CAPABILITY_SECRET;
  if (!secret || secret.length < 32) throw new Error("Coverage automation capability secret is not configured.");
  return createHmac("sha256", secret).update(`coverage-release:${jobKey}`).digest("base64url");
}

function validAuthorityCapability(jobKey: string, supplied: unknown) {
  if (typeof supplied !== "string") return false;
  const expected = authorityCapability(jobKey);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function body(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("Request body is too large.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error("Request body is too large.");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object.");
  return parsed as Record<string, unknown>;
}

function opaque(value: unknown, label: string, pattern = OPAQUE) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function publicJob(job: CoverageAutomationJob, includeResult = false) {
  return {
    jobKey: job.jobKey,
    coverageRequestId: job.coverageRequestId,
    requestVersion: job.requestVersion,
    targetType: job.targetType,
    stateCode: job.stateCode,
    areaKey: job.areaKey,
    storeId: job.storeId,
    canonicalTargetKey: job.canonicalTargetKey,
    baselineCoverageFingerprint: job.baselineCoverageFingerprint,
    status: job.status,
    taskId: job.taskId,
    ...(includeResult ? { terminalResult: job.terminalResult, deliveryUncertain: job.deliveryUncertain === true } : {}),
  };
}

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const action = opaque(input.action, "action", /^[a-z_]{3,40}$/);
    const repository = getCoverageRequestRepository();

    if (action === "claim" || action === "attach") {
      if (!authorizeOpsBearer(request.headers.get("authorization"), claimSecret())) return response({ error: "Unauthorized" }, 401);
    } else if (action === "complete" || action === "fail" || action === "claim_notification" || action === "ack_notification") {
      if (!authorizeOpsBearer(request.headers.get("authorization"), outcomeSecret())) return response({ error: "Unauthorized" }, 401);
    } else if (action !== "verify_authority") {
      return response({ error: "Unsupported coverage automation action." }, 400);
    }

    if (action === "claim") {
      const leaseToken = randomUUID();
      const job = await repository.claimAutomationJob(leaseToken);
      return response({
        contractVersion: CONTRACT_VERSION,
        job: job ? publicJob(job) : null,
        leaseToken: job?.owned ? leaseToken : null,
        authorityCapability: job?.owned ? authorityCapability(job.jobKey) : null,
      });
    }

    if (action === "claim_notification") {
      const notificationToken = randomUUID();
      const job = await repository.claimAutomationNotification(notificationToken);
      return response({
        contractVersion: CONTRACT_VERSION,
        job: job ? publicJob(job, true) : null,
        notificationToken: job && !job.deliveryUncertain ? notificationToken : null,
      }, job?.deliveryUncertain ? 409 : 200);
    }

    const jobKey = opaque(input.jobKey, "jobKey");

    if (action === "ack_notification") {
      const notificationToken = opaque(input.notificationToken, "notificationToken", /^[a-f0-9-]{36}$/);
      const platformMessageId = opaque(input.platformMessageId, "platformMessageId", /^[a-zA-Z0-9:_-]{1,120}$/);
      const acknowledged = await repository.acknowledgeAutomationNotification(jobKey, notificationToken, platformMessageId);
      if (!acknowledged) return response({ error: "Coverage automation notification acknowledgement is stale." }, 409);
      return response({ contractVersion: CONTRACT_VERSION, acknowledged: true });
    }

    const taskId = opaque(input.taskId, "taskId", TASK_ID);

    if (action === "attach") {
      const leaseToken = opaque(input.leaseToken, "leaseToken", /^[a-f0-9-]{36}$/);
      const job = await repository.attachAutomationTask(jobKey, leaseToken, taskId);
      if (!job) return response({ error: "Coverage automation lease, request version, or task binding is stale." }, 409);
      return response({ contractVersion: CONTRACT_VERSION, job: publicJob(job) });
    }

    if (action === "verify_authority") {
      if (!validAuthorityCapability(jobKey, input.authorityCapability)) return response({ error: "Invalid authority capability." }, 401);
      const authorized = await repository.verifyAutomationAuthority(jobKey, taskId);
      return response({ contractVersion: CONTRACT_VERSION, authorized }, authorized ? 200 : 409);
    }

    if (action === "fail") {
      const failureCode = opaque(input.failureCode, "failureCode", /^automation_(?:terminal_contract_failure|task_missing)$/);
      const terminalResult = parseCoverageAutomationResult({
        schemaVersion: "bourbon-signal/coverage-expansion-result@1",
        outcome: "blocked",
        headline: failureCode === "automation_task_missing"
          ? "The durable task record could not be recovered; the request remains open."
          : "The worker returned an invalid terminal evidence contract; the request remains open.",
        productionFingerprint: null,
        pullRequest: null,
        ci: { status: "not_applicable" },
        refresh: null,
        metrics: {
          baselineExactStoreRows: 0, productionExactStoreRows: 0,
          baselineLiveStores: 0, productionLiveStores: 0,
          baselineCustomerCards: 0, productionCustomerCards: 0,
        },
        canonicalVerification: { verified: false, url: null },
        sourcesReviewed: 0,
        blockerCode: failureCode,
        limitations: ["Automation stopped fail-closed without changing production coverage claims."],
      });
      const job = await repository.completeAutomationTask(jobKey, taskId, terminalResult);
      if (!job) return response({ error: "Coverage automation failure is stale or not bound to this task." }, 409);
      return response({ contractVersion: CONTRACT_VERSION, job: publicJob(job, true) });
    }

    if (action === "complete") {
      const terminalResult = parseCoverageAutomationResult(input.terminalResult);
      const job = await repository.completeAutomationTask(jobKey, taskId, terminalResult);
      if (!job) return response({ error: "Coverage automation result is stale or not bound to this task." }, 409);
      return response({ contractVersion: CONTRACT_VERSION, job: publicJob(job, true) });
    }

    return response({ error: "Unsupported coverage automation action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coverage automation request failed.";
    const status = /too large/i.test(message) ? 413 : /JSON|invalid|must be|shape|require/i.test(message) ? 400 : 500;
    return response({ error: message }, status);
  }
}
