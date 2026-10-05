import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { getCoverageRequestRepository } from '@/lib/coverage-request-repository';
import { coverageDatabase } from '@/lib/owner-workspace';
import { coverageStatusLabels, type CoverageStatus } from '../../../../../shared/coverage-requests';
export async function GET() {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try {
    const repository = getCoverageRequestRepository();
    const [requests, automation, notes] = await Promise.all([repository.listDemandForOwner(), repository.summarizeActiveAutomationStatusesForOwner(), coverageDatabase().query('SELECT request_id, internal_note, member_update, priority FROM coverage_request_reviews')]);
    const reviews = new Map((notes as Array<Record<string, unknown>>).map(n => [n.request_id, n]));
    return Response.json({ requests: requests.map(r => ({ ...r, review: reviews.get(r.id) || null })), automation }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Coverage inbox is temporarily unavailable.' }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string' || !body.id.trim() || body.id.length > 80 || typeof body.status !== 'string' || !['requested','on_radar','closed'].includes(body.status)) return Response.json({ error: 'Choose a request and valid status.' }, { status: 400 });
  // Improvement is evidence-driven by the existing automation, never a manual promise.
  if (body.status === 'improved') return Response.json({ error: 'Coverage improvement requires verified production evidence. Use the coverage workflow.' }, { status: 400 });
  const note = typeof body.internalNote === 'string' ? body.internalNote.trim().slice(0,1000) : '';
  const update = typeof body.memberUpdate === 'string' ? body.memberUpdate.trim().slice(0,500) : '';
  const priority = body.priority === 'high' ? 'high' : 'normal';
  try {
    const result = await getCoverageRequestRepository().updateStatusForOwner(body.id, body.status as CoverageStatus, owner.email, new Date().toISOString(), {actorId:owner.userId,internalNote:note,memberUpdate:update,priority});
    if (!result) return Response.json({ error: 'Request could not be updated. Refresh the inbox.' }, { status: 409 });
    return Response.json({ ok: true, result });
  } catch { return Response.json({ error: 'Coverage review could not be saved. Refresh before retrying.' }, { status: 503 }); }
}
