import { randomUUID } from "node:crypto";
import { rankBottleMatches } from "../../../../../shared/admin-bottle-matches";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { getOwnerBourbonBible, clearBourbonBibleCache } from "@/lib/bourbonBible";
import {
  readOwnerBottleRecords,
  saveOwnerBottle,
} from "@/lib/owner-admin-repository";
import {
  adminReason,
  adminRecord,
  validateBottleDraft,
} from "../../../../../shared/owner-admin";
import { coverageDatabase } from "@/lib/owner-workspace";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  try {
    const params = new URL(request.url).searchParams,
      q = (params.get("q") || "").trim().toLowerCase(),
      offset = Math.max(0, Number(params.get("offset")) || 0);
    const records=await readOwnerBottleRecords();
    const catalog=await getOwnerBourbonBible(records);
    const versions = new Map(
      records.map((r) => [r.bottle_id, Number(r.version)]),
    );
    const found = params.get("suggest") === "1" ? rankBottleMatches(catalog, q) : catalog
      .filter((b) =>
        [b.canonicalName, b.brand, b.producer, ...b.aliases]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
    const id = params.get("id");
    const bottles = (
      id ? catalog.filter((b) => b.id === id) : found.slice(offset, offset + 40)
    ).map((b) => ({ ...b, version: versions.get(b.id) || 0 }));
    return Response.json(
      {
        bottles,
        total: found.length,
        nextOffset: !id && offset + 40 < found.length ? offset + 40 : null,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Bottle library could not load." },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  const body = adminRecord(await request.json().catch(() => null));
  let reason, draft;
  try {
    reason = adminReason(body.reason);
    draft = validateBottleDraft(body.bottle);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0)
    return Response.json(
      { error: "Refresh the bottle before editing." },
      { status: 400 },
    );
  try {
    const catalog = await getOwnerBourbonBible(),
      existing = catalog.find((b) => b.id === body.id);
    if (body.id && !existing)
      return Response.json({ error: "Bottle not found." }, { status: 404 });
    const target = body.redirectId
      ? catalog.find((b) => b.id === body.redirectId)
      : null;
    if (body.redirectId && (!existing || !target || target.id === existing.id))
      return Response.json(
        { error: "Choose a different current bottle as the merge target." },
        { status: 400 },
      );
    if (
      target &&
      (!Number.isSafeInteger(body.targetVersion) ||
        Number(body.targetVersion) < 0)
    )
      return Response.json(
        { error: "Refresh the merge target first." },
        { status: 400 },
      );
    if (
      !target &&
      catalog.some(
        (b) =>
          b.id !== body.id &&
          b.canonicalName.toLowerCase() === draft.canonicalName.toLowerCase(),
      )
    )
      return Response.json(
        {
          error:
            "That name already exists. Link or merge with the existing entry.",
        },
        { status: 409 },
      );
    const patch = target
      ? {
          ...target,
          aliases: [
            ...new Set([
              ...target.aliases,
              existing!.canonicalName,
              ...existing!.aliases,
            ]),
          ],
        }
      : { ...draft, artwork: draft.artwork || existing?.artwork, aliases:[...new Set([...(existing?.aliases || []),existing?.canonicalName || "",...draft.aliases])].filter(Boolean) };
    const id = existing?.id || `owner-${randomUUID()}`;
    const version = await saveOwnerBottle({
      id,
      patch: { ...patch, _previous: existing || null },
      redirectId: target?.id,
      targetVersion: Number(body.targetVersion),
      version: Number(body.version),
      actor: owner.userId,
      reason,
    });
    clearBourbonBibleCache();
    const history = await coverageDatabase().query(
      "SELECT action,details,created_at FROM owner_workspace_audit WHERE target_id=$1 ORDER BY id DESC LIMIT 20",
      [id],
    );
    return Response.json(
      {
        ok: true,
        bottle: { ...patch, id: target?.id || id, version },
        history,
      },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error: String(e).includes("admin_conflict")
          ? "This bottle changed. Refresh before saving again."
          : "Bottle changes could not be saved.",
      },
      { status: String(e).includes("admin_conflict") ? 409 : 503 },
    );
  }
}
