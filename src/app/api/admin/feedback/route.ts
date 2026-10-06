import {requireOwnerApiAccess} from '@/lib/owner-auth';
import {MemberFeedbackRepository} from '@/lib/member-feedback';
import {FEEDBACK_STATUSES} from '../../../../../shared/member-feedback';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 const owner=await requireOwnerApiAccess();if(owner.error)return owner.error;
 const url=new URL(request.url),status=url.searchParams.get('status')||'new',offset=Number(url.searchParams.get('offset')||0);
 if((status!=='all'&&!FEEDBACK_STATUSES.includes(status as never))||!Number.isInteger(offset)||offset<0||offset>10000)return Response.json({error:'Invalid feedback filter.'},{status:400,headers});
 try{return Response.json(await new MemberFeedbackRepository().list(status as never,offset),{headers});}catch{return Response.json({error:'Feedback temporarily unavailable.'},{status:503,headers});}
}
export async function PATCH(request:Request){
 const owner=await requireOwnerApiAccess();if(owner.error)return owner.error;
 const raw=await request.text();if(raw.length>6000)return Response.json({error:'Invalid review.'},{status:400,headers});
 let body;try{body=JSON.parse(raw);}catch{body=null;}
 if(!body||typeof body.userId!=='string'||body.userId.length>160||typeof body.id!=='string'||! /^[a-f0-9-]{36}$/.test(body.id)||!FEEDBACK_STATUSES.includes(body.status)||typeof body.internalNote!=='string'||body.internalNote.length>1500)return Response.json({error:'Invalid feedback review.'},{status:400,headers});
 try{const ok=await new MemberFeedbackRepository().review(body.userId,body.id,body.status,body.internalNote);return Response.json(ok?{ok:true}:{error:'Feedback no longer exists.'},{status:ok?200:404,headers});}catch{return Response.json({error:'Review could not be saved. Retry.'},{status:503,headers});}
}
