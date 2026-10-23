import { authorizeOpsBearer, getDedicatedScorecardReadSecret } from '@/lib/ops-auth';
import { runSourceScheduler, sourceSchedulerHealth, pollSourceRegistry } from '@/lib/source-scheduler';
import { readSourcePremisesBaseline } from '@/lib/source-premises-baseline';
import { readVerifiedRetailerPremisesBaseline } from '@/lib/retailer-premises-baseline';
import { createProductionAlertQueueSqlExecutor } from '@/lib/alert-queue/runtime';
import { SOURCE_LANES } from '@/lib/source-lane';
import { pollRuntimeSourceLanes } from '@/lib/source-lane-runtime';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request: Request) {
  const header=request.headers.get('authorization');
  const monitor=new URL(request.url).searchParams.has('monitor');
  const readOnly=new URL(request.url).searchParams.has('read');
  const params=new URL(request.url).searchParams, premises=params.has('premises');
  if(!authorizeOpsBearer(header,process.env.CRON_SECRET) && !authorizeOpsBearer(header,process.env.SOURCE_SCHEDULER_SECRET) && !((monitor || readOnly) && authorizeOpsBearer(header,getDedicatedScorecardReadSecret()))) return Response.json({error:'Unauthorized'},{status:401});
  if(premises && (params.get('premises')!=='1' || params.get('read')!=='1' || monitor || [...params.keys()].some(key=>!['read','premises'].includes(key)) || params.getAll('read').length!==1 || params.getAll('premises').length!==1)) return Response.json({error:'Invalid read-only premises query'},{status:400});
  try {
    if(premises) {
      const executor=createProductionAlertQueueSqlExecutor();
      // Each projection has its own SQL statement clock; neither read collects
      // or writes, and a failed supplement never returns a partial baseline.
      const [sources,retailerPremises]=await Promise.all([
        readSourcePremisesBaseline(executor,{registry:[...pollSourceRegistry(),
          ...SOURCE_LANES.map(source=>({id:source.id,state:'SC',kind:'source-lane',expiryHours:1,disabled:process.env.SOURCE_LANE_STORAGE_ENABLED!=='1' || process.env.SOURCE_LANE_POLL_ENABLED!=='1'}))]}),
        readVerifiedRetailerPremisesBaseline(executor),
      ]);
      const result={...sources,retailerPremises,releaseCommit:process.env.VERCEL_GIT_COMMIT_SHA || null};
      if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw new Error('Premises response bound');
      return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
    }
    const trigger=authorizeOpsBearer(header,process.env.CRON_SECRET) && request.headers.get('user-agent')?.startsWith('vercel-cron/')?'scheduled':'manual_or_rescue';
    const result=readOnly?await sourceSchedulerHealth(false):monitor?await sourceSchedulerHealth(true):(await Promise.all([runSourceScheduler({trigger}),pollRuntimeSourceLanes(false)]))[0];
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }
  catch {return Response.json({error:'Source scheduler unavailable'},{status:503});}
}
