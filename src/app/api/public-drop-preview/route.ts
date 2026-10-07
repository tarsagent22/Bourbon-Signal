import {readPublicMarketingFeed} from '@/lib/public-marketing-feed';
export const dynamic='force-dynamic';
export async function GET(request:Request){const headers={'Cache-Control':'public, max-age=30, stale-while-revalidate=60'};if(new URL(request.url).search)return Response.json({error:'This public preview does not support filters.'},{status:400,headers});const feed=await readPublicMarketingFeed();return Response.json(feed,{status:feed.unavailable?503:200,headers});}
