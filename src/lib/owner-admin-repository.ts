import { coverageDatabase } from "./owner-workspace";
import { runtimeNeonConnectionString } from "./neon-runtime";
export async function readOwnerBottleRecords() {
  if (!runtimeNeonConnectionString()) return [];
  return (await coverageDatabase().query(
    "SELECT bottle_id,patch,redirect_id,version FROM owner_bottle_records",
  )) as Array<{
    bottle_id: string;
    patch: Record<string, unknown>;
    redirect_id: string | null;
    version: number;
  }>;
}
export async function saveOwnerBottle(input: {
  id: string;
  patch: Record<string, unknown>;
  redirectId?: string;
  targetVersion?: number;
  version: number;
  actor: string;
  reason: string;
}) {
  const rows = (await coverageDatabase().query(
    "SELECT owner_save_bottle_record($1,$2::jsonb,$3,$4::bigint,$5,$6,$7::bigint) AS version",
    [
      input.id,
      JSON.stringify(input.patch),
      input.redirectId || null,
      input.version,
      input.actor,
      input.reason,
      input.targetVersion ?? null,
    ],
  )) as Array<{ version: number }>;
  return Number(rows[0].version);
}
export async function resolveOwnerBottleSubmission(input: {
  id: string;
  expectedUpdatedAt: string;
  bottleId: string | null;
  bottleName: string | null;
  actor: string;
  reason: string;
  status: string;
}) {
  const rows = (await coverageDatabase().query(
    "SELECT owner_resolve_bottle_submission($1,$2::timestamptz,$3,$4,$5,$6,$7) AS contribution",
    [
      input.id,
      input.expectedUpdatedAt,
      input.bottleId,
      input.bottleName,
      input.actor,
      input.reason,
      input.status,
    ],
  )) as Array<{ contribution: Record<string, unknown> }>;
  return rows[0].contribution;
}
export async function ownerAudit(
  actor: string,
  action: string,
  target: string,
  details: Record<string, unknown>,
) {
  await coverageDatabase().query(
    "INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES($1,$2,$3,$4::jsonb)",
    [actor, action, target, JSON.stringify(details)],
  );
}

export async function reviewOwnerBottleSubmission(input: {id:string; expectedUpdatedAt:string; bottleId:string|null; patch:Record<string,unknown>; version:number; actor:string; reason:string; action:string}) {
 const rows = await coverageDatabase().query("SELECT owner_review_bottle_submission($1,$2::timestamptz,$3,$4::jsonb,$5::bigint,$6,$7,$8) AS contribution",[input.id,input.expectedUpdatedAt,input.bottleId,JSON.stringify(input.patch),input.version,input.actor,input.reason,input.action]) as Array<{contribution:Record<string,unknown>}>;
 return rows[0].contribution;
}
