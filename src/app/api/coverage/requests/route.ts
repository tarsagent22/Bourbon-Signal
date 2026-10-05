import { NextRequest, NextResponse } from "next/server";
import { coverageDatabase } from "@/lib/owner-workspace";
import { auth } from "@clerk/nextjs/server";
import {
  CoverageRequestValidationError,
  normalizeCoverageRequestTarget,
} from "@/lib/coverage-request";
import { inspectCoverageRequestStoreAliasPayload } from "@/lib/coverage-location-aliases";
import {
  CoverageRequestRateLimitError,
  getCoverageRequestRepository,
} from "@/lib/coverage-request-repository";
import { readCurrentCoverageRequestContext } from "@/lib/coverage-server";

async function authenticatedUserId() {
  const { userId } = await auth();
  return userId;
}

export async function GET() {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const requests = await getCoverageRequestRepository().listForUser(userId);
    const reviews = await coverageDatabase().query('SELECT review.request_id, review.member_update, review.updated_at FROM coverage_request_reviews review JOIN coverage_requests request ON request.id=review.request_id WHERE request.user_id=$1', [userId]) as Array<{request_id:string;member_update:string;updated_at:string}>;
    const updates = new Map(reviews.map(r=>[r.request_id,r]));
    const memberRequests=requests.map(r=>{const update=updates.get(r.id);return {...r,memberUpdate:update?.member_update||null,updatedAt:update?.member_update&&update.updated_at&&new Date(update.updated_at).getTime()>Date.parse(r.updatedAt)?new Date(update.updated_at).toISOString():r.updatedAt};});
    return NextResponse.json({ contractVersion: "bourbon-signal/member-coverage-requests@1", requests: memberRequests }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Coverage requests are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "A coverage request is required." }, { status: 400 });

  try {
    const stateCode = typeof body.stateCode === "string" ? body.stateCode.trim().toUpperCase() : "";
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const inspection = inspectCoverageRequestStoreAliasPayload({
      ...body,
      stateCode,
      targetType: body.targetType,
      storeId,
    });
    if (inspection.status === "conflict") {
      throw new CoverageRequestValidationError("Coverage request details conflict with the selected store.");
    }
    const resolvedStoreId = inspection.status === "matched" ? inspection.alias.storeId : storeId;
    const context = await readCurrentCoverageRequestContext(stateCode, resolvedStoreId);
    const target = normalizeCoverageRequestTarget({ ...body, storeId: resolvedStoreId }, {
      baselineCoverageFingerprint: context.state?.fingerprint || "",
      matchedStore: context.matchedStore,
    });
    const saved = await getCoverageRequestRepository().upsertForUser(userId, target);
    return NextResponse.json({
      contractVersion: "bourbon-signal/member-coverage-requests@1",
      request: saved,
    }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof CoverageRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CoverageRequestRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: "Coverage request storage is temporarily unavailable." }, { status: 503 });
  }
}
