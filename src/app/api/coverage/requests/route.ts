import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json({ contractVersion: "bourbon-signal/member-coverage-requests@1", requests }, {
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
