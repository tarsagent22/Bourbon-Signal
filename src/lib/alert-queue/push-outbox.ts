import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { alertQueueConnectionString } from './runtime';

export function createProductionPushOutbox() {
  const url = alertQueueConnectionString();
  if (!url) throw new Error('push_outbox_database_missing');
  const sql = neon(url);
  return new PostgresPushOutbox({ query: async (text, params = []) => ({ rows: await sql.query(text, params) as Array<Record<string, unknown>> }) });
}
import type { SqlExecutor } from './postgres-repository';
import type { ExpoPushMessage, sendExpoPushMessages } from '../push-devices';

export type PushIntent = { id: string; alertId: string; stableKeys: string[]; attempts: number };
export type DurablePushTicket = { ticketId: string; tokenHash: string; installationHash: string; bindingId: string };
// All mutations are fenced by the same member lease used by registration/preferences and
// the caller. Lock the lease row in the statement so takeover cannot race the mutation.
const fence = `with held as materialized (select lease_key from alert_delivery_leases
  where lease_key=$1 and owner=$2 and expires_at>now() for update)`;
export class PostgresPushOutbox {
  constructor(private readonly sql: SqlExecutor) {}
  async assertHeld(userId: string, owner: string) {
    const result = await this.sql.query(`select lease_key from alert_delivery_leases where lease_key=$1 and owner=$2 and expires_at>now()`,[`member:${userId}`,owner]);
    if (!result.rows.length) throw new Error('push_member_lease_lost');
  }
  async enqueue(userId: string, owner: string, input: { alertId: string; stableKeys: string[]; expiresAt: string }) {
    await this.assertHeld(userId,owner);
    if (!input.stableKeys.length) throw new Error('push_missing_episode_identity');
    await this.sql.query(`${fence}, fresh as materialized (
      select array(select k from unnest($6::text[]) k where not exists (
        select 1 from alert_push_outbox prior where prior.user_id=$4 and k=any(prior.stable_keys)
      ) order by k) as keys from held
    ) insert into alert_push_outbox
      (id,user_id,alert_id,stable_keys,expires_at,status,attempt_count,next_attempt_at)
      select $3,$4,$5,fresh.keys,least($7::timestamptz,now()+interval '2 hours'),'pending',0,now()
      from fresh where cardinality(fresh.keys)>0
      on conflict (user_id,stable_keys) do nothing returning id`,
      [`member:${userId}`,owner,randomUUID(),userId,input.alertId,[...new Set(input.stableKeys)].sort(),input.expiresAt]);
    // Existing episodes (including unknown/manual) are never re-enqueued, even if
    // regrouping or an inbox-write failure gives the next draft a different alert ID.
    await this.assertHeld(userId,owner);
  }
  async pending(userId: string, owner: string): Promise<PushIntent[]> {
    await this.assertHeld(userId,owner);
    await this.sql.query(`${fence} update alert_push_outbox set status='expired',reason='expiry',updated_at=now()
      where user_id=$3 and status='pending' and expires_at<=now() and exists(select 1 from held)`,[`member:${userId}`,owner,userId]);
    const result = await this.sql.query(`select id,alert_id,stable_keys,attempt_count from alert_push_outbox
      where user_id=$1 and status='pending' and next_attempt_at<=now() and expires_at>now() and attempt_count<3
      order by created_at,id limit 25`,[userId]);
    return result.rows.map(row=>({id:String(row.id),alertId:String(row.alert_id),stableKeys:row.stable_keys as string[],attempts:Number(row.attempt_count)}));
  }
  async begin(userId: string, owner: string, id: string) {
    // Unknown is durable BEFORE entering the ownership/provider boundary. A crash, lost
    // lease, failed completion write or ambiguous acceptance is NEVER automatically replayed.
    const result = await this.sql.query(`${fence} update alert_push_outbox set status='unknown',reason='send_started_manual_review',
      attempt_count=attempt_count+1,updated_at=now() where id=$3 and user_id=$4 and status='pending'
      and next_attempt_at<=now() and expires_at>now() and attempt_count<3 and exists(select 1 from held) returning id`,[`member:${userId}`,owner,id,userId]);
    if (!result.rows.length) throw new Error('push_intent_not_sendable_or_lease_lost');
  }
  async finish(userId: string, owner: string, id: string, status: 'pending'|'unknown'|'accepted'|'suppressed', reason: string) {
    const result = await this.sql.query(`${fence} update alert_push_outbox set
      status=case when $5='pending' and expires_at<=now() then 'expired'
        when $5='pending' and attempt_count>=3 then 'exhausted' else $5 end,
      reason=$6,next_attempt_at=now()+interval '5 minutes'*greatest(attempt_count,1),updated_at=now()
      where id=$3 and user_id=$4 and status in ('pending','unknown') and exists(select 1 from held) returning id`,[`member:${userId}`,owner,id,userId,status,reason]);
    if (!result.rows.length) throw new Error('push_completion_not_persisted_or_lease_lost');
  }
  private async persistAcceptedTickets(userId: string, owner: string, id: string, tickets: DurablePushTicket[], acceptedAt: string, complete: boolean) {
    const ticketIds = new Set<string>();
    if (!tickets.length || tickets.length > 100 || tickets.some((ticket) => {
      const valid = /^[a-zA-Z0-9_-]{8,256}$/.test(ticket.ticketId)
        && /^[0-9a-f]{64}$/.test(ticket.tokenHash)
        && /^[0-9a-f]{64}$/.test(ticket.installationHash)
        && /^[a-zA-Z0-9-]{1,80}$/.test(ticket.bindingId)
        && !ticketIds.has(ticket.ticketId);
      ticketIds.add(ticket.ticketId);
      return !valid;
    })) throw new Error('push_provider_tickets_incomplete');
    const result = await this.sql.query(`${fence}, incoming as materialized (
        select * from jsonb_to_recordset($6::jsonb) as ticket(provider_ticket_id text,token_hash text,installation_hash text,binding_id text)
      ), inserted as (
        insert into alert_push_tickets
          (provider_ticket_id,outbox_id,user_id,token_hash,installation_hash,binding_id,status,next_receipt_at,accepted_at,updated_at)
        select ticket.provider_ticket_id,$3,$4,ticket.token_hash,ticket.installation_hash,ticket.binding_id,'pending',$5::timestamptz+interval '15 minutes',$5::timestamptz,$5::timestamptz
        from incoming ticket,held
        on conflict do nothing returning provider_ticket_id
      ) update alert_push_outbox set status=case when $7::boolean then 'accepted' else 'unknown' end,
          reason=case when $7::boolean then 'provider_accepted_receipt_pending' else 'partial_or_unaccounted_manual_review' end,updated_at=$5::timestamptz
        where id=$3 and user_id=$4 and status='unknown' and exists(select 1 from held)
          and (select count(*) from inserted)=jsonb_array_length($6::jsonb) returning id`,
      [`member:${userId}`,owner,id,userId,acceptedAt,JSON.stringify(tickets.map(ticket=>({
        provider_ticket_id:ticket.ticketId,token_hash:ticket.tokenHash,installation_hash:ticket.installationHash,binding_id:ticket.bindingId,
      }))),complete]);
    if (!result.rows.length) throw new Error('push_provider_tickets_not_persisted_or_lease_lost');
  }
  async accept(userId: string, owner: string, id: string, tickets: DurablePushTicket[], acceptedAt: string) {
    return this.persistAcceptedTickets(userId,owner,id,tickets,acceptedAt,true);
  }
  async recordAcceptedSubset(userId: string, owner: string, id: string, tickets: DurablePushTicket[], acceptedAt: string) {
    return this.persistAcceptedTickets(userId,owner,id,tickets,acceptedAt,false);
  }
}

export async function drainPushOutbox(repository: PostgresPushOutbox,userId: string,owner: string, adapters: {
  // Must reload current member preferences/entitlement and live candidates/devices. No
  // token, device ownership assertion, or send payload is ever read from this outbox.
  resolve: (intent: PushIntent) => Promise<{ devices: unknown; messages: ExpoPushMessage[] } | null>;
  send: (userId: string,devices: unknown,messages: ExpoPushMessage[]) => ReturnType<typeof sendExpoPushMessages>;
  durableTickets?: (result: Awaited<ReturnType<typeof sendExpoPushMessages>>, devices: unknown) => DurablePushTicket[];
  accepted?: (result: Awaited<ReturnType<typeof sendExpoPushMessages>>) => Promise<void>;
  now?: () => string;
}) {
  for (const intent of await repository.pending(userId,owner)) {
    await repository.assertHeld(userId,owner);
    const live = await adapters.resolve(intent); // failure before send remains safely pending
    if (!live || !live.messages.length) {
      await repository.finish(userId,owner,intent.id,'suppressed','current_policy_or_devices_denied');
      continue;
    }
    await repository.begin(userId,owner,intent.id);
    await repository.assertHeld(userId,owner);
    let result: Awaited<ReturnType<typeof sendExpoPushMessages>>;
    try { result = await adapters.send(userId,live.devices,live.messages); }
    catch {
      await repository.finish(userId,owner,intent.id,'unknown','provider_or_ownership_exception_manual_review');
      continue;
    }
    const allAccepted = result.accepted === live.messages.length && result.rejected === 0;
    const allRejected = result.accepted === 0 && result.rejected === live.messages.length;
    // The ownership boundary returns aggregate counts. Partial sends/ownership filtering
    // cannot safely identify which destinations may retry; hold those for manual review.
    if (result.accepted > 0) {
      // Persist every provider ticket and exact hashed binding before the intent can leave
      // write-ahead unknown. Any crash or incomplete ticket response remains non-replayable.
      try {
        const tickets = adapters.durableTickets?.(result,live.devices) || [];
        if (tickets.length !== result.accepted) throw new Error('push_provider_tickets_incomplete');
        const acceptedAt = (adapters.now || (()=>new Date().toISOString()))();
        if (allAccepted) await repository.accept(userId,owner,intent.id,tickets,acceptedAt);
        else await repository.recordAcceptedSubset(userId,owner,intent.id,tickets,acceptedAt);
      } catch (error) {
        // The write-ahead unknown state still prevents replay, but surface the failed
        // durable completion so operations never mistake it for tracked acceptance.
        throw error;
      }
    } else {
      await repository.finish(userId,owner,intent.id,allRejected ? 'pending' : 'unknown',
        allRejected ? 'explicit_provider_rejection' : 'partial_or_unaccounted_manual_review');
    }
    // Receipt bookkeeping failure must not undo the durable provider result.
    if (adapters.accepted) await adapters.accepted(result);
  }
}
