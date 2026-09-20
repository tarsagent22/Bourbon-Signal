import { timingSafeEqual } from "node:crypto";
import { drainAccountDeletionCleanup } from "@/lib/account-deletion";
import { createAccountDeletionIdentityProvider } from "@/lib/account-deletion-identity-provider";
import { createAccountDeletionRepository } from "@/lib/account-deletion-repository";
import { PRIVATE_SIGNAL_API_HEADERS } from "@/lib/signals/signal-api-route";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_SIGNAL_API_HEADERS });
  }
  const result = await drainAccountDeletionCleanup({
    repository: createAccountDeletionRepository(),
    identityProvider: await createAccountDeletionIdentityProvider(),
    limit: 10,
  });
  return Response.json({ ok: true, ...result }, { headers: PRIVATE_SIGNAL_API_HEADERS });
}
