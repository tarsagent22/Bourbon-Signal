import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { CommunitySafetyRepository } from '@/lib/community-safety';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
  const access=await requireOwnerApiAccess(); if(access.error)return access.error;
  return Response.json({reports:await new CommunitySafetyRepository().pending()},{headers});
}
export async function PATCH(request:Request){
  const access=await requireOwnerApiAccess(); if(access.error)return access.error;
  const body=await request.json().catch(()=>null);
  if(typeof body?.sightingId!=='string'||! /^[A-Za-z0-9._:-]{1,160}$/.test(body.sightingId))return Response.json({error:'Invalid sighting.'},{status:400,headers});
  await new CommunitySafetyRepository().resolve(body.sightingId,access.userId);
  return Response.json({ok:true},{headers});
}
