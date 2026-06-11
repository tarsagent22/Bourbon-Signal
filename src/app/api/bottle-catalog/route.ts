import { NextResponse } from "next/server";
import { getBourbonBible } from "@/lib/bourbonBible";
import { siteExportHeaders } from "@/lib/site-engine-contract";

export async function GET() {
  const bottles = getBourbonBible().map((bottle) => ({
    id: bottle.id,
    canonicalName: bottle.canonicalName,
    brand: bottle.brand,
    producer: bottle.producer,
    category: bottle.category,
    proof: bottle.proof,
    ageStatement: bottle.ageStatement,
    msrp: bottle.msrp,
    availability: bottle.availability,
    buyerVerdict: bottle.buyerVerdict,
    aliases: bottle.aliases,
    isSignalTracked: bottle.isSignalTracked,
    isAlertEligible: bottle.isAlertEligible,
    summary: bottle.summary,
    guidance: bottle.guidance,
  }));

  return NextResponse.json({ bottles, total: bottles.length }, { headers: siteExportHeaders("local-export") });
}
