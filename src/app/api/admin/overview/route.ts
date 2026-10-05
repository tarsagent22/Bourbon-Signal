import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { getCoverageRequestRepository } from '@/lib/coverage-request-repository';
import { readBottleContributionQueue } from '@/lib/bottle-contributions';
import { GET as readSightingQueue } from '../sightings/route';
import { createSignalPointsRepository } from '@/lib/signal-points-repository';
import { listFounderShippingForOwner } from '@/lib/founder-shipping-repository';
import { readSiteExport } from '@/lib/site-engine-contract';
export async function GET() {
  const owner=await requireOwnerApiAccess();if(owner.error)return owner.error;
  const tasks={coverage:()=>getCoverageRequestRepository().listDemandForOwner().then(rs=>rs.filter(r=>r.status==='requested').length),community:async()=>{const response=await readSightingQueue();if(!response.ok)throw new Error('Queue unavailable');const data=await response.json();return data.sightings.length;},bottles:()=>readBottleContributionQueue().then(q=>q.contributions.filter(r=>r.status==='new'||r.status==='needs_human').length),rewards:()=>createSignalPointsRepository().listOwnerQueue().then(rs=>rs.length),founderShipping:()=>listFounderShippingForOwner().then(rs=>rs.filter(r=>r.status!=='shipped').length),service:()=>readSiteExport('stats')};
  const results=await Promise.allSettled(Object.values(tasks).map(fn=>fn()));
  const data=Object.fromEntries(Object.keys(tasks).map((key,i)=>[key,results[i].status==='fulfilled'?(results[i] as PromiseFulfilledResult<unknown>).value:null]));
  return Response.json({...data,checkedAt:new Date().toISOString(),unavailable:Object.keys(tasks).filter((_,i)=>results[i].status==='rejected')},{headers:{'Cache-Control':'private, no-store'}});
}
