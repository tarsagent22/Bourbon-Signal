import { neon } from '@neondatabase/serverless';

export type NumberedUser = { id: string; createdAt: number; publicMetadata: Record<string, unknown> };
type NumberClient = { users: {
  getUserList(input: {limit:number; offset:number; orderBy:'+created_at'}): Promise<{data:NumberedUser[]; totalCount:number}>;
  updateUserMetadata(id:string, patch:{publicMetadata:{memberNumber:number; memberNumberVersion:string}}): Promise<unknown>;
} };
type NumberRow = {user_id:string; member_number:string|number};
type Query = {query(sql:string, params?:unknown[]): Promise<unknown>};
export function memberNumberRepository(database?:Query) {
  const url = process.env.BOURBON_QUEUE_DATABASE_URL || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!database && !url) throw new Error('Member-number storage is unavailable.');
  const sql = database || neon(url!);
  return {
    async get(id:string) {
      const rows = await sql.query('SELECT member_number FROM member_numbers WHERE user_id=$1',[id]) as NumberRow[];
      return rows.length ? Number(rows[0].member_number) : null;
    },
    async reconcile(users:NumberedUser[]) {
      const rows = users.map(user=>{
        if(!user.id || !Number.isFinite(user.createdAt)) throw new Error('Invalid signup record.');
        const metadata=user.publicMetadata;
        const number=Number(metadata.memberNumber);
        const founder=Number(metadata.founderNumber)>0 || metadata.tier==='bottled-in-bond' || metadata.plan==='bib_lifetime';
        return {user_id:user.id,created_at:new Date(user.createdAt).toISOString(),existing_number:!founder && Number.isSafeInteger(number) && number>0 ? number : null};
      });
      return await sql.query('SELECT user_id,member_number FROM reconcile_member_numbers($1::jsonb)',[JSON.stringify(rows)]) as NumberRow[];
    },
  };
}
export async function listNumberedUsers(client:NumberClient) {
  const users:NumberedUser[]=[]; const seen=new Set<string>();
  for(let offset=0;;) {
    const page=await client.users.getUserList({limit:100,offset,orderBy:'+created_at'});
    for(const user of page.data) {if(seen.has(user.id)) throw new Error('Repeated signup page.'); seen.add(user.id); users.push(user);}
    offset+=page.data.length;
    if(offset>=page.totalCount) break;
    if(!page.data.length || offset>1_000_000) throw new Error('Signup roster could not be completed.');
  }
  return users;
}
export async function ensureMemberNumber<User extends NumberedUser>(client:NumberClient,user:User,repository=memberNumberRepository()) {
  let number=await repository.get(user.id);
  if(!number) {
    const users=await listNumberedUsers(client);
    if(!users.some(candidate=>candidate.id===user.id)) users.push(user);
    number=Number((await repository.reconcile(users)).find(row=>row.user_id===user.id)?.member_number);
  }
  if(number == null || !Number.isSafeInteger(number) || number<=0) throw new Error('Member number could not be assigned.');
  if(user.publicMetadata.memberNumber!==number || user.publicMetadata.memberNumberVersion!=='signup-order-v1') {
    await client.users.updateUserMetadata(user.id,{publicMetadata:{memberNumber:number,memberNumberVersion:'signup-order-v1'}});
  }
  return {...user,publicMetadata:{...user.publicMetadata,memberNumber:number,memberNumberVersion:'signup-order-v1'}};
}
