import { authorizeOpsBearer, getDedicatedScorecardReadSecret } from '@/lib/ops-auth';
import { runSourceScheduler, sourceSchedulerHealth } from '@/lib/source-scheduler';
import { pollRuntimeSourceLanes } from '@/lib/source-lane-runtime';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request: Request) {
  const header=request.headers.get('authorization');
  const monitor=new URL(request.url).searchParams.has('monitor');
  if(!authorizeOpsBearer(header,process.env.CRON_SECRET) && !authorizeOpsBearer(header,process.env.SOURCE_SCHEDULER_SECRET) && !(monitor && authorizeOpsBearer(header,getDedicatedScorecardReadSecret()))) return Response.json({error:'Unauthorized'},{status:401});
  try {
    const result=monitor?await sourceSchedulerHealth(true):(await Promise.all([runSourceScheduler(),pollRuntimeSourceLanes(false)]))[0];
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }
  catch {return Response.json({error:'Source scheduler unavailable'},{status:503});}
}
