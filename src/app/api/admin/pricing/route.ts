import { requireOwnerApiAccess } from '@/lib/owner-auth';
import { coverageDatabase } from '@/lib/owner-workspace';
import { readReviewedPrices } from '@/lib/collection-price-repository';
import { validatePriceReview } from '@/lib/collection-price-review';
import { getBourbonBible } from '@/lib/bourbonBible';
export async function GET() {
  const owner = await requireOwnerApiAccess(); if (owner.error) return owner.error;
  try {
    const [prices,history,catalog,health] = await Promise.all([readReviewedPrices(),coverageDatabase().query('SELECT id,bottle_id,reference,review_note,reviewed_at FROM collection_price_history ORDER BY id DESC LIMIT 100'),getBourbonBible(),coverageDatabase().query('SELECT summary,checked_at FROM collection_price_health ORDER BY day DESC LIMIT 1')]);
    const reviewed = new Map(prices.map(p=>[p.bottleId,p]));
    const demand = new Map<string,number>();
    const holdings=await coverageDatabase().query(`SELECT bottle_id, COUNT(DISTINCT user_id)::int AS members FROM member_collection_bottles WHERE COALESCE((payload->>'sealedQuantity')::int,0)+COALESCE((payload->>'openedQuantity')::int,0)>0 GROUP BY bottle_id`) as Array<{bottle_id:string;members:number}>;
    for(const holding of holdings)demand.set(holding.bottle_id,holding.members);
    const bottles=catalog.map(b=>({id:b.id,name:b.canonicalName,members:demand.get(b.id)||0,reference:reviewed.get(b.id)||null})).sort((a,b)=>b.members-a.members || a.name.localeCompare(b.name));
    return Response.json({bottles,history,health:(health as Array<Record<string,unknown>>)[0]||null}, {headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Pricing workspace is temporarily unavailable.'},{status:503});}
}
export async function POST(request: Request) {
  const owner=await requireOwnerApiAccess();if(owner.error)return owner.error;
  const body=await request.json().catch(()=>null);
  let reference;
  try { reference=validatePriceReview(body?.reference); } catch(error) { return Response.json({error:error instanceof Error?error.message:'Invalid price reference.'},{status:400}); }
  try {
    const catalog=await getBourbonBible();
    if(!catalog.some(b=>b.id===reference.bottleId && b.canonicalName===reference.names[0])) return Response.json({error:'Choose the exact current catalog ID and name.'},{status:400});
    const note=typeof body.note==='string'?body.note.trim().slice(0,1000):'';
    if(note.length<10)return Response.json({error:'Add a review note describing the evidence and edition/size match.'},{status:400});
    await coverageDatabase().query('INSERT INTO collection_price_history(bottle_id,reference,actor_id,review_note) VALUES($1,$2::jsonb,$3,$4)',[reference.bottleId,JSON.stringify(reference),owner.userId,note]);
    return Response.json({ok:true});
  }catch{return Response.json({error:'Price review could not be saved. Refresh before retrying.'},{status:503});}
}
