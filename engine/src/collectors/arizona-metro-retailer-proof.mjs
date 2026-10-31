import { cityHiveUnsafeBottleMatchReason } from './safe-bottle-match.mjs';

export const PHOENIX_METRO_RETAILERS = Object.freeze([
  { id:'mesa-liquor', sourceLabel:'Mesa Liquor WooCommerce store inventory', baseUrl:'https://mesaliquorstore.com', merchantId:'mesa-liquor-woocommerce', store:{id:'mesa-liquor:1930-e-broadway',name:'Mesa Liquor',address:'1930 E Broadway Rd, Mesa, AZ 85204',street:'1930 E Broadway Rd',city:'Mesa',zip:'85204'} },
  { id:'best-liquor-tempe', sourceLabel:'Best Liquor Tempe WooCommerce store inventory', baseUrl:'https://bestliquortempe.com', merchantId:'best-liquor-tempe-woocommerce', store:{id:'best-liquor-tempe:3320-s-priest',name:'Best Liquor',address:'3320 S Priest Dr Suite #2, Tempe, AZ 85282',street:'3320 S Priest Dr Suite #2',city:'Tempe',zip:'85282'} },
  {id:'virginia-market-phoenix',sourceLabel:'Virginia Market Phoenix WooCommerce store inventory',baseUrl:'https://virginiamarketstore.com',merchantId:'virginia-market-woocommerce',store:{id:'virginia-market:702-e-virginia',name:'Virginia Market',address:'702 E Virginia Ave, Phoenix, AZ 85006',street:'702 E Virginia Ave',city:'Phoenix',zip:'85006',lat:33.4768522,lng:-112.0648288}},
]);
export const LIQUOR_WHEEL_PHOENIX = Object.freeze({id:'liquor-wheel-2-phoenix',sourceLabel:'Liquor Wheel 2 Phoenix pickup inventory',baseUrl:'https://liquorwheel2.com',merchantId:'100112',store:{id:'liquor-wheel-2-phoenix:2209-n-16th',name:'Liquor Wheel 2',address:'2209 North 16th Street, Phoenix, AZ 85006',street:'2209 North 16th Street',city:'Phoenix',zip:'85006'}});
export const metroRetailerSources = () => [...PHOENIX_METRO_RETAILERS,LIQUOR_WHEEL_PHOENIX].map(r=>({...r,stateCode:'AZ'}));
const normalized = value => String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const decode = value => String(value||'').replace(/&#(?:0*39|x27);|&apos;/gi,"'").replace(/&#8217;|&rsquo;/gi,"'").replace(/&amp;/gi,'&');
export function metroBottleKey(value) {
  return decode(value).toLowerCase().replace(/\b(\d{1,2})(?=years?\b)/g,'$1 ')
    .replace(/\bstraightrye\b/g,'straight rye').replace(/\bbbn\b/g,'bourbon').replace(/\bbrl\b/g,'barrel')
    .replace(/\b(\d{1,2})\s*(?:years?|yrs?|y)\b/g,'$1 year')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ml|liters?|l)\b/g,' ')
    .replace(/\b(?:kentucky|straight|bourbon|whiskey|whisky)\b/g,' ')
    .replace(/\bcolonel\b/g,' ').replace(/\bjr\.?\b/g,' ')
    .replace(/['â€™]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
const indexes=new WeakMap();
export function metroBottleMatch(rawName,bible) {
  if (!indexes.has(bible)) {
    const index=new Map();
    for(const record of bible.records||[]) for(const bottle of record.libraryIdentities||[]) for(const name of [bottle.canonicalName,...bottle.aliases]) {
      const key=metroBottleKey(name);if(!key)continue;
      if(!index.has(key))index.set(key,[]);
      index.get(key).push({record,bottle,canonical:name===bottle.canonicalName});
    }
    indexes.set(bible,index);
  }
  const entries=indexes.get(bible).get(metroBottleKey(rawName))||[];
  const canonical=entries.filter(e=>e.canonical);const selected=canonical.length?canonical:entries;
  if(new Set(selected.map(e=>e.bottle.id)).size!==1)return null;
  const records=new Map(selected.map(e=>[e.record.id,e.record]));
  if(records.size!==1)return null;
  const record=[...records.values()][0];
  const expanded=decode(rawName).replace(/\bstraightrye\b/gi,'straight rye').replace(/\bbbn\b/gi,'bourbon').replace(/\bbrl\b/gi,'barrel').replace(/\b(\d{1,2})(?=years?\b)/gi,'$1 ');
  return cityHiveUnsafeBottleMatchReason(expanded,record)?null:record;
}
export function metroLibraryTier(signal,bible) {
  if(!isMetroRetailerProof(signal))return null;
  const name=signal.sourceProductBinding?.identityName||signal.rawName;
  const record=metroBottleMatch(name,bible);if(!record||record.id!==signal.sourceProductBinding.canonicalBottleId)return null;
  const entries=indexes.get(bible).get(metroBottleKey(name))||[];const canonical=entries.filter(e=>e.canonical);
  const bottle=(canonical.length?canonical:entries)[0]?.bottle;
  if(bottle?.isAlertEligible!==true)return null;
  const tier=bottle.stateOverrides?.find(o=>o.jurisdiction==='AZ')?.tier||bottle.nationalTier;
  return ({regular:'standard',common:'standard',highly_allocated:'unicorn',unicorn:'unicorn',allocated:'allocated',limited:'limited'})[tier] || null;
}
export function metroPremiseMatches(query,store) {
  const raw=String(query||'');const start=raw.search(/\d/);if(start<0)return false;
  const value=normalized(raw.slice(start));const expected=normalized(store.street+store.city+'AZ'+store.zip);
  return [expected,expected+'us',expected+'usa'].includes(value);
}
export function wooPremiseMap(html,retailer) {
  for(const m of String(html||'').matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {const u=new URL(decode(m[1]));if(!['maps.google.com','www.google.com'].includes(u.hostname))continue;
      const query=u.searchParams.get('q')||u.searchParams.get('daddr');
      if(query&&metroPremiseMatches(query,retailer.store))return query;
    }catch{}
  }
  return null;
}
export const priceOf=p=>p?.currency_code==='USD'&&Number(p.currency_minor_unit)===2&&/^\d+$/.test(String(p.price||''))?Number(p.price)/100:NaN;
export const hostOf=url=>{try{return new URL(url).hostname}catch{return null}};
export function wheelIdentityName(p,product) {
  return product?.id==='AZ-0505944457-BLANTON-S-BOURBON'&&p?.name==="Blanton's Bourbon"
    &&hostOf(p.image)==='res.cloudinary.com'&&String(p.image).includes('/alcohol/vendor/100112/catalog/product/')
    &&String(p.image).endsWith('/J/N/JNC3FYmhc_wcPM2vOQNCc7v1cCtiyGSx305phR9H0kI_d26993.png')
    ?"Blanton's Original Single Barrel":p?.name;
}
export function isMetroRetailerProof(row) {
  const retailer=[...PHOENIX_METRO_RETAILERS,LIQUOR_WHEEL_PHOENIX].find(r=>r.id===row.sourceChain);const p=row.sourceProductBinding;
  if(!retailer||row.sourceLabel!==retailer.sourceLabel&&row.source!==retailer.sourceLabel||row.merchantId!==retailer.merchantId
    ||row.storeId!==retailer.store.id||row.storeAddress!==retailer.store.address||hostOf(row.sourceUrl)!==hostOf(retailer.baseUrl)
    ||p?.schemaVersion!==1||p.storeId!==row.storeId||p.storeAddress!==row.storeAddress||p.merchantId!==row.merchantId
    ||p.productId!==String(row.productId||row.raw?.product?.id)||p.rawName!==row.rawName||!p.canonicalBottleId
    ||!(p.canonicalName===row.canonicalName||p.rawName===row.canonicalName)
    ||!(p.canonicalBottleId===row.canonicalBottleId||p.rawName===row.canonicalName)
    ||p.price!==row.price||p.observedAt!==row.observedAt||!Number.isFinite(Date.parse(row.observedAt))||Number(row.quantity||0)!==0||row.quantityIsExact!==false)return false;
  if(p.source==='arizona-woocommerce')return (retailer.store.lat===undefined||(Number(row.lat)===retailer.store.lat&&Number(row.lng)===retailer.store.lng))&&metroPremiseMatches(p.premiseMapQuery,retailer.store)&&p.premiseUrl===retailer.baseUrl+'/contact/'
    &&hostOf(p.productQueryUrl)===hostOf(retailer.baseUrl)&&new URL(p.productQueryUrl).pathname==='/wp-json/wc/store/v1/products'
    &&String(p.product?.id)===p.productId&&decode(p.product.name)===p.rawName&&p.product.permalink===row.sourceUrl
    &&p.product.is_in_stock===true&&p.product.is_purchasable===true&&p.product.is_on_backorder===false&&priceOf(p.product.prices)===p.price
    &&! /\b(?:pack|case|bundle|miniature|sample)\b/i.test(p.product.name)
    &&[...String(p.product.name).matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/gi)].length>0
    &&[...String(p.product.name).matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/gi)].every(m=>{const size=Number(m[1])*(m[2].toLowerCase()==='l'?1000:1);return size>=375&&size<=1750});
  const offer=p.product?.offers;
  return retailer===LIQUOR_WHEEL_PHOENIX&&p.source==='arizona-promenade'&&p.pickupAvailable===true
    &&p.identityName===wheelIdentityName(p.product,p.publishedProduct)
    &&p.premise?.['@id']===retailer.baseUrl+'/'&&p.premise?.name===retailer.store.name&&p.premise?.address?.streetAddress===retailer.store.street&&p.premise?.address?.postalCode===retailer.store.zip
    &&p.premise?.address?.addressLocality===retailer.store.city&&p.premise?.address?.addressRegion==='AZ'
    &&Number.isFinite(Number(p.premise?.geo?.latitude))&&Number.isFinite(Number(p.premise?.geo?.longitude))
    &&Number(row.lat)===Number(p.premise.geo.latitude)&&Number(row.lng)===Number(p.premise.geo.longitude)
    &&p.product?.name===p.rawName&&p.publishedProduct?.id===p.productId&&p.publishedProduct?.name===p.rawName
    &&Number(p.publishedProduct?.price)===p.price&&offer?.availability==='https://schema.org/InStock'&&offer?.priceCurrency==='USD'
    &&Number(offer.price)===p.price&&offer?.seller?.url===row.sourceUrl&&offer?.seller?.name===retailer.store.name
    &&p.productId!=='AZ-0520726389-GEORGE-T-STAGG-BARREL-PROOF-UNFILTERED';
}

