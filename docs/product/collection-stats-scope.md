# Collection stats scope

Owner direction: basic stats for Free and Standard; advanced stats for Barrel Proof and Founder. Bottle Check is retired and is not a membership benefit.

## Basic stats

Total bottles, distinct owned whiskies, sealed/open/tasted-only counts, average personal rating, highest-rated owned bottles and a top-rated list. These remain available to everyone.

## Advanced stats proposal

Breakdowns by verified producer, proof, age and rarity; rating patterns; collection growth; recorded spending; Bourbon DNA from ratings and taste notes; recommendations with an explanation of why a bottle matches. Fields with insufficient data show their coverage rather than guessing.

Approximate collection worth is included in the proposed advanced benefit. Show MSRP and secondary-market estimates separately, alongside the number of bottles with pricing, bottles missing pricing and each pricing source's date. Quantity counts bottles actually owned, not tasted-only or finished bottles. An estimate for a partial collection must not appear to price the whole collection.

Before implementation, select a licensed/current secondary-price source and settle treatment of opened bottles. Suggested default: sealed bottles contribute to secondary value; opened bottles are shown separately. MSRP reflects published retail pricing, not a guaranteed selling price. Record spending separately from both estimates. Native recommendations and valuation are not shipped by the member-number/onboarding fix.

## Numbered identity

Permanent member numbers use signup order, independent of subscription status. Preserve legacy regular-member numbers if present. Founder numbers remain independent; a Founder displays the Founder number instead of the permanent member number. Signup webhook assigns identity; login/onboarding/profile/posting recover it if webhook projection is delayed. A durable registry serializes allocations and never reuses a deleted member's number. Account deletion anonymizes the registry identity while reserving the number.
