import { getBottleById } from "@/lib/bourbonBible";
import { validateReviewedBottleArtwork } from "../../../../../../shared/bottle-artwork";

// Public decorative assets only. Submission evidence and member photos never enter this route.
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params;
  if (!/^owner-[a-zA-Z0-9-]{1,100}$/.test(id)) return new Response(null,{status:404});
  try {
    const bottle = await getBottleById(id);
    const artwork = validateReviewedBottleArtwork(bottle?.artwork);
    if (!artwork) return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
    return new Response(null,{status:302,headers:{Location:artwork.url,"Cache-Control":"public, max-age=300"}});
  } catch { return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}}); }
}
