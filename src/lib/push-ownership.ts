import { createHash } from 'node:crypto';
import type { SqlExecutor } from './alert-queue/postgres-repository';
import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import { withMemberAlertLease } from './alert-queue/member-lease';
import { normalizePushDevices, sendExpoPushMessages, type ExpoPushMessage, type PushDeviceRecord } from './push-devices';

export const pushOwnershipHash = (kind: 'installation' | 'token', value: string) => createHash('sha256').update(`bourbon-signal/push/${kind}/v1\0${value}`).digest('hex');
type PushIdentity = Pick<PushDeviceRecord, 'deviceId'> & Partial<Pick<PushDeviceRecord, 'expoPushToken'>>;
export interface PushOwnershipRepository {
  bind(userId: string, device: PushIdentity & { expoPushToken: string }, bindingId: string): Promise<void>;
  disable(userId: string, deviceId: string): Promise<void>;
  owned(userId: string, devices: PushDeviceRecord[]): Promise<PushDeviceRecord[]>;
}
export class PostgresPushOwnershipRepository implements PushOwnershipRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async bind(userId: string, device: PushIdentity & { expoPushToken: string }, bindingId: string) {
    const hashes = [pushOwnershipHash('installation',device.deviceId),pushOwnershipHash('token',device.expoPushToken)].sort();
    // One statement: both global resources are reassigned atomically. Fixed resource order
    // avoids crossed token/installation deadlocks; joins require the SAME registration generation.
    await this.sql.query(`insert into member_push_ownership (resource_hash,user_id,binding_id,expires_at,updated_at)
      select resource_hash,$2,$3,now()+interval '30 days',now() from unnest($1::text[]) resource_hash order by resource_hash
      on conflict (resource_hash) do update set user_id=excluded.user_id,binding_id=excluded.binding_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at`,[hashes,userId,bindingId]);
  }
  async disable(userId: string, deviceId: string) {
    // Only the authenticated current owner can revoke this installation. Keep a tombstone;
    // a stale Clerk write cannot resurrect ownership or an old registration generation.
    await this.sql.query(`update member_push_ownership set expires_at=now(),updated_at=now()
      where resource_hash=$1 and user_id=$2`,[pushOwnershipHash('installation',deviceId),userId]);
  }
  async owned(userId: string, devices: PushDeviceRecord[]) {
    const candidates = devices.filter(d=>d.enabled && d.bindingId);
    if (!candidates.length) return [];
    const records = candidates.map((d,index)=>({index,installation:pushOwnershipHash('installation',d.deviceId),token:pushOwnershipHash('token',d.expoPushToken),generation:d.bindingId}));
    const result = await this.sql.query(`select candidate.index from jsonb_to_recordset($2::jsonb)
      as candidate(index integer,installation text,token text,generation text)
      join member_push_ownership i on i.resource_hash=candidate.installation
      join member_push_ownership t on t.resource_hash=candidate.token
      where i.user_id=$1 and t.user_id=$1 and i.binding_id=candidate.generation and t.binding_id=candidate.generation
        and i.expires_at>now() and t.expires_at>now()`,[userId,JSON.stringify(records)]);
    const allowed = new Set(result.rows.map(r=>Number(r.index)));
    return candidates.filter((_d,index)=>allowed.has(index));
  }
}
export const getPushOwnershipRepository = (): PushOwnershipRepository => new PostgresPushOwnershipRepository(createProductionAlertQueueSqlExecutor());
export async function ownedPushDevices(userId: string, devices: unknown, repository = getPushOwnershipRepository()) {
  return repository.owned(userId,normalizePushDevices(devices));
}

// Registration/revocation and final provider authorization share resource leases across accounts.
// Callers that also write member metadata acquire member:<userId> FIRST, then these sorted resources.
export async function withPushOwnershipLease<T>(devices: PushIdentity[], operation: (assertHeld: () => Promise<void>) => Promise<T>): Promise<T> {
  const keys = [...new Set(devices.flatMap(d=>[pushOwnershipHash('installation',d.deviceId),...(d.expoPushToken ? [pushOwnershipHash('token',d.expoPushToken)] : [])]))].sort();
  const guards: Array<()=>Promise<void>> = [];
  const take = async (index: number): Promise<T> => {
    if (index === keys.length) return operation(async()=>{for(const guard of guards) await guard();});
    const leased = await withMemberAlertLease(`push-resource:${keys[index]}`,async guard=>{guards.push(guard);try{return await take(index+1);}finally{guards.pop();}},{requireDurable:true});
    if (!leased.acquired) throw new Error('push_ownership_busy');
    return leased.result;
  };
  return take(0);
}

export async function sendOwnedExpoPushMessages(
  userId: string, devices: unknown, messages: ExpoPushMessage[],
  adapters: { repository?: PushOwnershipRepository; lease?: typeof withPushOwnershipLease; send?: typeof sendExpoPushMessages } = {},
) {
  const candidates = normalizePushDevices(devices).filter(d=>d.enabled && messages.some(m=>m.to===d.expoPushToken));
  return (adapters.lease || withPushOwnershipLease)(candidates,async assertHeld=>{
    // Deduplicate the same alert/token without changing distinct alerts or provider retry policy.
    const unique = [...new Map(messages.map(m=>[`${m.to}\0${m.dedupeKey}`,m])).values()];
    const result: Awaited<ReturnType<typeof sendExpoPushMessages>> = { accepted: 0, rejected: 0, tickets: [], invalidTokens: [] };
    for (let index=0; index<unique.length; index+=100) {
      await assertHeld();
      const allowed = new Set((await ownedPushDevices(userId,candidates,adapters.repository)).map(d=>d.expoPushToken));
      const chunk = unique.slice(index,index+100).filter(m=>allowed.has(m.to));
      // A slow read or earlier provider request cannot authorize a later batch under a lost lease.
      await assertHeld();
      if (!chunk.length) continue;
      const sent = await (adapters.send || sendExpoPushMessages)(chunk);
      result.accepted += sent.accepted;
      result.rejected += sent.rejected;
      result.tickets.push(...sent.tickets);
      result.invalidTokens.push(...sent.invalidTokens);
    }
    result.invalidTokens = [...new Set(result.invalidTokens)];
    return result;
  });
}
