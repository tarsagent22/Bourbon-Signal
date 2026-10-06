import {auth,clerkClient} from '@clerk/nextjs/server';
import {feedbackInput} from '../../../../../../shared/member-feedback';
import {verifiedPrimaryClerkEmail} from '@/lib/owner-auth';
import {MemberFeedbackRepository} from '@/lib/member-feedback';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const {userId}=await auth();if(!userId)return Response.json({error:'Sign in to send feedback.'},{status:401,headers});
 const raw=await request.text();if(raw.length>12000)return Response.json({error:'Feedback is too long.'},{status:400,headers});
 let data;try{data=feedbackInput(JSON.parse(raw));}catch{data=null;}
 if(!data)return Response.json({error:'Describe your feedback in 10–2,000 characters.'},{status:400,headers});
 try{
  const user=await (await clerkClient()).users.getUser(userId);
  const result=await new MemberFeedbackRepository().submit(userId,data,user.fullName||user.username||'Member',verifiedPrimaryClerkEmail(user));
  if(result==='limited')return Response.json({error:'You have sent 10 messages today. Try again tomorrow or email support@bourbonsignal.com.'},{status:429,headers});
  if(result==='conflict')return Response.json({error:'This submission changed. Return to the form and send it again.'},{status:409,headers});
  if(result!=='saved')throw new Error('Feedback not saved');
  return Response.json({ok:true,id:data.id},{headers});
 }catch{return Response.json({error:'Feedback could not be sent. Your message is still in the form; please retry.'},{status:503,headers});}
}
