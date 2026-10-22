import { authorizeOpsBearer, getDedicatedScorecardReadSecret } from '@/lib/ops-auth';
import { runSourceScheduler, sourceSchedulerHealth } from '@/lib/source-scheduler';
import { pollRuntimeSourceLanes } from '@/lib/source-lane-runtime';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request: Request) {
  const header=request.headers.get('authorization');
  const monitor=new URL(request.url).searchParams.has('monitor');
  const readOnly=new URL(request.url).searchParams.has('read');
  if(!authorizeOpsBearer(header,process.env.CRON_SECRET) && !authorizeOpsBearer(header,process.env.SOURCE_SCHEDULER_SECRET) && !((monitor || readOnly) && authorizeOpsBearer(header,getDedicatedScorecardReadSecret()))) return Response.json({error:'Unauthorized'},{status:401});
  try {
    const trigger=authorizeOpsBearer(header,process.env.CRON_SECRET) && request.headers.get('user-agent')?.startsWith('vercel-cron/')?'scheduled':'manual_or_rescue';
    const result=readOnly?await sourceSchedulerHealth(false):monitor?await sourceSchedulerHealth(true):(await Promise.all([runSourceScheduler({trigger}),pollRuntimeSourceLanes(false)]))[0];
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }
  catch {return Response.json({error:'Source scheduler unavailable'},{status:503});}
}
