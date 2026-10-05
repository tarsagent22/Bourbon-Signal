import type { CollectionPriceReference } from './collection-value';
export function collectionPricingHealth(prices: readonly CollectionPriceReference[], catalogCount:number, now=new Date()) {
 const age=(date:string)=> (now.getTime()-Date.parse(date+'T00:00:00Z'))/86400000;
 return {catalogCount,referencedBottles:prices.length,missingBoth:Math.max(0,catalogCount-prices.length),
  expiredMsrp:prices.filter(p=>p.msrp&&age(p.msrp.date)>730).length,
  expiredSecondary:prices.filter(p=>p.secondary&&age(p.secondary.date)>90).length,
  secondaryReviewDue:prices.filter(p=>p.secondary&&age(p.secondary.date)>=60).length,
  checkedAt:now.toISOString()};
}
