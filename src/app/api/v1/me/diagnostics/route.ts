import {auth} from '@clerk/nextjs/server';
import {nativeDiagnostic} from '../../../../../../shared/native-diagnostics';
import {NativeDiagnosticsRepository} from '@/lib/native-diagnostics';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){
 const {userId}=await auth();if(!userId)return Response.json({error:'Sign in to continue.'},{status:401,headers});
 const raw=await request.text();if(raw.length>1024)return Response.json({error:'Invalid diagnostic.'},{status:400,headers});
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return Response.json({error:'Invalid diagnostic.'},{status:400,headers});}
 const packet=nativeDiagnostic(parsed);if(!packet)return Response.json({error:'Invalid diagnostic.'},{status:400,headers});
 try{await new NativeDiagnosticsRepository().record(userId,packet);return Response.json({ok:true},{headers});}
 catch{return Response.json({error:'Diagnostics temporarily unavailable.'},{status:503,headers});}
}
