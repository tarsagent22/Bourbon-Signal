import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { classifyCompanyMember, companyMemberPrimaryEmail } from '@/lib/company-control-room';
import { communityDisplayNameFromMetadata } from '@/lib/community-display-name';
export async function GET(request: Request) {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase().slice(0,100) || '';
  if (!q) return Response.json({ members: [] }, { headers: { 'Cache-Control':'private, no-store' } });
  try {
    const matches: Array<Record<string, unknown>> = [];
    for (let offset=0; ;offset+=100) {
      const page=await owner.client.users.getUserList({limit:100,offset,orderBy:'+created_at'});
      for (const user of page.data) {
        const metadata=user.publicMetadata || {}; const member=classifyCompanyMember(user);
        const email=companyMemberPrimaryEmail(user); const name=communityDisplayNameFromMetadata(metadata) || [user.firstName,user.lastName].filter(Boolean).join(' ');
        const founder=metadata.founderNumber; const number=founder || metadata.memberNumber;
        if (`${email} ${name} ${number || ''}`.toLowerCase().includes(q)) matches.push({id:user.id,email,name,number,numberLabel:founder?'Founder':'Member',tier:member.effectiveTier,status:member.status,createdAt:user.createdAt,lastSignInAt:user.lastSignInAt});
      }
      if (matches.length>=50 || offset+page.data.length>=page.totalCount || !page.data.length) break;
    }
    return Response.json({members:matches.slice(0,50)}, {headers:{'Cache-Control':'private, no-store'}});
  } catch { return Response.json({error:'Member search is temporarily unavailable.'},{status:503}); }
}
