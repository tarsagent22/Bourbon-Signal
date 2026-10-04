import { NextRequest, NextResponse } from "next/server";
import { getBourbonBible } from "@/lib/bourbonBible";
import { siteExportHeaders } from "@/lib/site-engine-contract";
import { getPublicScarcityLabel, getScarcityBadges } from "@/lib/bottle-scarcity";
import { BOTTLE_SCARCITY_SOURCE_REGISTRY } from "@/data/bottle-scarcity-overrides";

export async function GET(req: NextRequest) {
  const catalog = await getBourbonBible();
  if (req.nextUrl.searchParams.get("view") === "picker") {
    const bottles = catalog.map(({ id, canonicalName, brand, producer, proof, ageStatement, availability, nationalTier, aliases }) => ({ id, canonicalName, brand, producer, proof, ageStatement, availability, nationalTier, aliases }));
    return NextResponse.json({ bottles, total: bottles.length }, { headers: siteExportHeaders("local-export") });
  }
  const bottles = catalog.map((bottle) => ({
    id: bottle.id,
    canonicalName: bottle.canonicalName,
    photo: bottle.photo,
    brand: bottle.brand,
    producer: bottle.producer,
    category: bottle.category,
    proof: bottle.proof,
    ageStatement: bottle.ageStatement,
    msrp: bottle.msrp,
    availability: bottle.availability,
    nationalTier: bottle.nationalTier,
    scarcityLabel: getPublicScarcityLabel(bottle),
    nationalConfidence: bottle.nationalConfidence,
    releaseCadence: bottle.releaseCadence,
    distributionScope: bottle.distributionScope,
    scarcitySourceIds: bottle.scarcitySourceIds,
    scarcityLastReviewedAt: bottle.scarcityLastReviewedAt,
    stateOverrides: bottle.stateOverrides,
    releaseBadges: getScarcityBadges(bottle),
    buyerVerdict: bottle.buyerVerdict,
    aliases: bottle.aliases,
    isSignalTracked: bottle.isSignalTracked,
    isAlertEligible: bottle.isAlertEligible,
    summary: bottle.summary,
    guidance: bottle.guidance,
  }));

  return NextResponse.json({
    bottles,
    total: bottles.length,
    scarcityModel: {
      tiers: ["regular", "limited", "allocated", "highly_allocated", "unicorn"],
      stateOverridesRequireEvidence: true,
      sources: BOTTLE_SCARCITY_SOURCE_REGISTRY,
    },
  }, { headers: siteExportHeaders("local-export") });
}
