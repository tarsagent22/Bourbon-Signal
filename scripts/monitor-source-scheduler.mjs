const root=process.env.NEXT_PUBLIC_APP_URL || 'https://www.bourbonsignal.com';
const secret=process.env.SOURCE_SCHEDULER_SECRET || process.env.COMPANY_SCORECARD_READ_SECRET || process.env.CRON_SECRET;
if(!secret)throw new Error('Scheduler monitor capability missing.');
const response=await fetch(root+'/api/ops/source-scheduler?monitor=1',{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});
const health=response.ok?await response.json():{enabled:true,healthy:false,endpointStatus:response.status};
console.log(JSON.stringify({enabled:health.enabled,healthy:health.healthy,lateSources:health.lateSources,incidents:health.incidents?.map(i=>({source:i.source_id,reason:i.reason,occurrences:i.occurrences}))}));
if(health.enabled && !health.healthy) {
  // An independent GitHub trigger rescues an unavailable Vercel timing trigger.
  if(process.env.SOURCE_SCHEDULER_SECRET || process.env.CRON_SECRET) {
    const rescue=await fetch(root+'/api/ops/source-scheduler',{headers:{authorization:'Bearer '+(process.env.SOURCE_SCHEDULER_SECRET || process.env.CRON_SECRET)},signal:AbortSignal.timeout(110000)});
    console.log(JSON.stringify({rescueStatus:rescue.status}));
  }
  process.exitCode=1;
}
