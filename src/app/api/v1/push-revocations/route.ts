import { NextRequest } from "next/server";
import { getPushOwnershipRepository, withPushOwnershipLease } from "@/lib/push-ownership";

const HEADERS = { "Cache-Control": "private, no-store" };
const BINDING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { deviceId?: string; revocationToken?: string };
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const revocationToken = typeof body.revocationToken === "string" ? body.revocationToken.trim() : "";
  if (!deviceId || deviceId.length > 120 || !BINDING_ID.test(revocationToken)) {
    return Response.json({ ok: false, revoked: false }, { status: 400, headers: HEADERS });
  }
  try {
    const revoked = await withPushOwnershipLease([{ deviceId }], async assertHeld => {
      await assertHeld();
      return getPushOwnershipRepository().revokeByCapability(deviceId, revocationToken);
    });
    return Response.json({ ok: true, revoked }, { headers: HEADERS });
  } catch {
    return Response.json({ ok: false, revoked: false }, { status: 503, headers: HEADERS });
  }
}
