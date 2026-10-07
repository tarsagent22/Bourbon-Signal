import {auth} from '@clerk/nextjs/server';
export const dynamic='force-dynamic';
export async function GET(){
 const {userId}=await auth(); const headers={'Cache-Control':'private, no-store'};
 if(!userId)return Response.json({error:'Account required'},{status:401,headers});
 return Response.json({standardMonthly:{eligible:false,reason:'retired'},barrelMonthly:{eligible:false,reason:'retired'}},{headers});
}
