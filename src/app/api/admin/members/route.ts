import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { directoryPage } from '@/lib/admin-member-directory';
import type { CompanyMemberUser } from '@/lib/company-control-room';
import { MobileActivityRepository } from '@/lib/mobile-activity-repository';
const headers = { 'Cache-Control':'private, no-store' };
export async function GET(request: Request) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  const params = new URL(request.url).searchParams;
  try { directoryPage([],params); } catch { return Response.json({error:'Invalid directory filter.'},{status:400,headers}); }
  try {
    const users: CompanyMemberUser[] = [];
    for (let offset=0; ;offset+=100) {
      const page = await owner.client.users.getUserList({limit:100,offset,orderBy:'+created_at'});
      users.push(...page.data);
      if (!page.data.length || offset+page.data.length>=page.totalCount) break;
    }
    const activity = await new MobileActivityRepository().readMany(users.flatMap(user => user.id ? [user.id] : []));
    return Response.json(directoryPage(users,params,new Date(),activity),{headers});
  } catch { return Response.json({error:'Member directory is temporarily unavailable.'},{status:503,headers}); }
}
