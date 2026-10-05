import { authorizeOpsBearer } from '@/lib/ops-auth';
import { coverageDatabase } from '@/lib/owner-workspace';
import { readReviewedPrices } from '@/lib/collection-price-repository';
import { collectionPricingHealth } from '@/lib/collection-pricing-health';
import { getBourbonBible } from '@/lib/bourbonBible';
export const dynamic='force-dynamic';
// Scheduled aggregate check only. This credential cannot read the owner workspace or modify prices.
export async function GET(request:Request) {
 if(!authorizeOpsBearer(request.headers.get('authorization'),process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401});
 try {const [prices,catalog]=await Promise.all([readReviewedPrices(),getBourbonBible()]);
  const summary=collectionPricingHealth(prices,catalog.length);
  await coverageDatabase().query(`INSERT INTO collection_price_health(day,summary) VALUES(current_date,$1::jsonb) ON CONFLICT(day) DO UPDATE SET summary=EXCLUDED.summary,checked_at=now()`,[JSON.stringify(summary)]);
  return Response.json(summary,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Pricing health unavailable'},{status:503});}
}
