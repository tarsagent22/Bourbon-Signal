import type { CollectionPriceReference } from './collection-value';
export function validatePriceReview(input: unknown, now = new Date()): CollectionPriceReference {
  const value = input && typeof input === "object" ? structuredClone(input) as CollectionPriceReference : null;
  if (!value || typeof value.bottleId !== 'string' || !value.bottleId || value.bottleId.length > 180 || !Array.isArray(value.names) || value.names.length !== 1 || typeof value.names[0] !== 'string' || !value.names[0].trim()) throw new Error('Choose an exact catalog bottle.');
  if (!value.msrp && !value.secondary) throw new Error('Enter an MSRP or secondary reference.');
  for (const price of [value.msrp, value.secondary].filter(Boolean)) {
    if (!price) continue;
    const date = Date.parse(price.date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(price.date) || !Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== price.date || date > now.getTime()) throw new Error('Use the original price date, not a future date.');
    let url: URL; try { url = new URL(price.source); } catch { throw new Error('Enter an HTTPS source link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || price.source.length > 1500) throw new Error('Enter an HTTPS source link.');
    if (typeof price.label !== "string" || !price.label.trim() || price.label.length > 240) throw new Error('Describe the source, release and bottle size.');
  }
  if (value.msrp && (!Number.isFinite(value.msrp.amount) || value.msrp.amount <= 0 || value.msrp.amount > 1000000)) throw new Error('Enter a valid manufacturer MSRP.');
  if (value.secondary && (!Number.isFinite(value.secondary.low) || !Number.isFinite(value.secondary.high) || value.secondary.low <= 0 || value.secondary.high < value.secondary.low || value.secondary.high > 1000000)) throw new Error('Enter a valid low/high secondary range.');
  if (value.secondary?.evidenceKind === 'completed_sales') {
    const observations=value.secondary.observations;
    if (!Array.isArray(observations) || observations.length<3 || observations.length>100) throw new Error('Completed-sale estimates need 3 to 100 dated sale observations.');
    const unique=new Set<string>();
    for(const sale of observations){const date=Date.parse(sale.date+'T00:00:00Z');let url:URL;try{url=new URL(sale.source);}catch{throw new Error('Each sale needs a source link.');}if(url.protocol!=='https:'||url.username||url.password||!Number.isFinite(sale.amount)||sale.amount<=0||sale.amount>1000000||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==sale.date||date>now.getTime()||now.getTime()-date>90*86400000)throw new Error('Each sale needs a valid price, HTTPS source and date within 90 days.');if(unique.has(sale.source))throw new Error('Each completed sale must have a unique source URL.');unique.add(sale.source);}
    const sorted=observations.map(s=>s.amount).sort((a,b)=>a-b);const quantile=(values:number[],p:number)=>{const n=(values.length-1)*p;const i=Math.floor(n);return values[i]+(values[Math.min(i+1,values.length-1)]-values[i])*(n-i);};
    const q1=quantile(sorted,.25),q3=quantile(sorted,.75),iqr=q3-q1;const retained=sorted.filter(n=>n>=q1-1.5*iqr&&n<=q3+1.5*iqr);
    value.secondary={...value.secondary,low:Math.round(quantile(retained,.1)*100)/100,high:Math.round(quantile(retained,.9)*100)/100,date:observations.map(o=>o.date).sort()[0],confidence:retained.length>=10&&new Set(observations.map(o=>new URL(o.source).hostname)).size>=2?'high':'medium'};
  } else if(value.secondary) value.secondary={...value.secondary,evidenceKind:'market_reference',confidence:'low',observations:undefined};
  return { bottleId: value.bottleId, names: [value.names[0].trim()], ...(value.msrp ? {msrp:value.msrp} : {}), ...(value.secondary ? {secondary:value.secondary} : {}) };
}
