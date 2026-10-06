import {requireOwnerApiAccess} from '@/lib/owner-auth';
import {NativeDiagnosticsRepository} from '@/lib/native-diagnostics';
export async function GET(){
 const access=await requireOwnerApiAccess();if(access.error)return access.error;
 try{return Response.json({diagnostics:await new NativeDiagnosticsRepository().recent()},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return Response.json({error:'Diagnostics temporarily unavailable.'},{status:503});}
}
