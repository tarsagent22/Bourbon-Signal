import { auth } from '@clerk/nextjs/server';
import { CommunitySafetyRepository, communityReportReason } from '@/lib/community-safety';
import { createCommunitySightingsRepository } from '@/lib/community-sightings-repository';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
export async function GET() {
  const {userId}=await auth();
  if(!userId)return Response.json({error:'Sign in to manage blocked members.'},{status:401,headers});
  try{return Response.json({blocks:await new CommunitySafetyRepository().listBlocks(userId)},{headers});}
  catch{return Response.json({error:'Blocked members are temporarily unavailable.'},{status:503,headers});}
}
export async function POST(request:Request) {
  const {userId}=await auth();
  if(!userId)return Response.json({error:'Sign in to continue.'},{status:401,headers});
  const body=await request.json().catch(()=>null);
  if(!body || !['report','block','unblock'].includes(body.action))return Response.json({error:'Choose a valid action.'},{status:400,headers});
  try {
    const safety=new CommunitySafetyRepository();
    if(body.action==='unblock'){
      if(typeof body.memberId!=='string'||!/^user_[A-Za-z0-9]{1,100}$/.test(body.memberId))return Response.json({error:'Invalid blocked member.'},{status:400,headers});
      await safety.unblock(userId,body.memberId);
    } else {
      const signalId=typeof body.signalId==='string'?body.signalId:'';
      if(!/^member:[A-Za-z0-9._:-]{1,160}$/.test(signalId))return Response.json({error:'Choose a Community sighting.'},{status:400,headers});
      const sighting=await createCommunitySightingsRepository().getSighting(signalId.slice(7));
      if(!sighting?.reporterUserId)return Response.json({error:'This sighting is unavailable.'},{status:404,headers});
      if(body.action==='block'){
        if(sighting.reporterUserId===userId)return Response.json({error:'You cannot block your own account.'},{status:400,headers});
        await safety.block(userId,sighting.reporterUserId);
      } else {
        const reason=communityReportReason(body.reason);
        if(!reason)return Response.json({error:'Choose a report reason.'},{status:400,headers});
        if(!await safety.report(userId,sighting.id,reason))return Response.json({error:'Please try again tomorrow or contact support@bourbonsignal.com.'},{status:429,headers});
      }
    }
    return Response.json({ok:true},{headers});
  }catch{return Response.json({error:'Your change could not be saved. Please try again.'},{status:503,headers});}
}
