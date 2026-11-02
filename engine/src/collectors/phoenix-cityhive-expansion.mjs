import { standardInventoryBottleIdentity } from '../core/standard-bottle-identity.mjs';
import { libraryIdentityKey } from '../core/library-catalog.mjs';

const source = (id, chainName, host, merchantId, premiseAddress) => Object.freeze({
  id, chainName, sourceLabel: `${chainName} Phoenix metro CityHive store inventory`,
  baseUrl: `https://${host}`, merchantIds: [merchantId], premiseAddress,
  strictPremise: true, maxPages: 4,
  urls: [`https://${host}/shop/?subtype=bourbon&limit=18`, `https://${host}/shop/?subtype=whiskey&limit=18`,
    ...['weller','blanton','eagle rare','e.h. taylor','stagg','van winkle','michter','elijah craig'].map(term => `https://${host}/shop/?ch-query=${encodeURIComponent(term)}&limit=18`)],
});

export const PHOENIX_CITYHIVE_EXPANSION_SOURCES = Object.freeze([
  source('fiesta-liquor-mesa', 'Fiesta Liquor', 'fiestaliquormesa.com', '6060f456872ef86371210d24', '753 S Alma School Rd #1, Mesa, AZ 85210, USA'),
  source('extramile-liquors-chandler', 'Chandler Chevron and ExtraMile', 'extramileliquors.com', '66c8c223d933721cd7586082', '7000 W Chandler Blvd, Chandler, AZ 85226, USA'),
]);

export function phoenixExpansionPremise(source, configs) {
  return configs.map(c => c?.merchant || c).find(m => m?.id === source.merchantIds[0]
    && m.name === source.chainName && m.address?.full_address === source.premiseAddress
    && m.accept_orders === true && (m.pickup === true || m.delivery === true)) || null;
}

export function phoenixExpansionOption(source, merchant, product, option) {
  let url;
  try { url = new URL(option?.product_url); } catch { return false; }
  const size = option?.option_params?.size;
  const ml = size?.measure === 'ml' ? Number(size.quantity) : size?.measure === 'l' ? Number(size.quantity) * 1000 : NaN;
  return Boolean(merchant && option?.merchant_id === merchant.id && option.full_address === source.premiseAddress
    && option.product_id === product?.id && /^[a-f0-9]{24}$/.test(product?.id || '')
    && /^[a-f0-9]{64}$/.test(option.option_id || '')
    && url.origin === source.baseUrl && /^\/shop\/product\/[a-z0-9-]+\/[a-f0-9]{24}$/.test(url.pathname)
    && url.pathname.endsWith('/' + product.id) && url.searchParams.get('option-id') === option.option_id
    && Number.isFinite(ml) && ml >= 375 && ml <= 1750
    && Number.isSafeInteger(option.quantity) && option.quantity > 0 && option.quantity < 100
    && typeof option.price === 'number' && Number.isFinite(option.price) && option.price > 0
    && option.preorder_details == null
    && (option.allowed_offer_types == null || Array.isArray(option.allowed_offer_types)
      && option.allowed_offer_types.some(type=>type==='pick_up'&&merchant.pickup===true||type==='delivery'&&merchant.delivery===true))
    && !/\b(?:bundle|pack|case|miniature|sample)\b/i.test(option.option_display_data?.name || product.name || '')
    && Array.isArray(product.merchants) && product.merchants.some(m => m.merchant_id === merchant.id
      && m.full_address === source.premiseAddress && m.offer_types?.some(type => type === 'pick_up' && merchant.pickup === true || type === 'delivery' && merchant.delivery === true))
    && Array.isArray(option.coordinates) && option.coordinates.length === 2
    && option.coordinates.every((v, i) => Number.isFinite(v) && v === merchant.address?.location?.coordinates?.[i]));
}

export function isPhoenixCityHiveExpansionProof(row) {
  const source = PHOENIX_CITYHIVE_EXPANSION_SOURCES.find(s => s.id === row.sourceChain);
  const proof = row.sourceProductBinding;
  const standard = standardInventoryBottleIdentity(proof?.canonicalName);
  const canonicalMatches = proof?.canonicalBottleId === row.canonicalBottleId && proof?.canonicalName === row.canonicalName
    || standard && standard.id === row.canonicalBottleId && standard.name === row.canonicalName;
  if (!source || row.state !== 'AZ' || (row.eventType || row.type) !== 'cityhive_store_inventory_result'
    || proof?.schemaVersion !== 1 || row.sourceLabel !== source.sourceLabel && row.source !== source.sourceLabel
    || row.storeId !== `${source.id}:${source.merchantIds[0]}` || row.merchantId !== source.merchantIds[0]
    || row.storeAddress !== source.premiseAddress || proof?.source !== 'phoenix-cityhive-expansion'
    || proof.observedAt !== row.observedAt || proof.productId !== row.productId || proof.optionId !== (row.variantId || row.optionId)
    || proof.rawName !== row.rawName || !canonicalMatches
    || proof.price !== row.price || proof.quantity !== row.quantity || row.quantityIsExact !== true
    || !Number.isFinite(Date.parse(row.observedAt))) return false;
  const merchant = phoenixExpansionPremise(source, [proof.merchant]);
  const product = proof.product;
  const option = proof.option;
  let request;
  try { request = new URL(row.sourceUrl); } catch { return false; }
  return phoenixExpansionOption(source, merchant, product, option)
    && request.origin === source.baseUrl && request.pathname === '/shop/'
    && request.searchParams.get('merchant-id') === row.merchantId
    && option.option_id === (row.variantId || row.optionId) && option.product_id === row.productId
    && (option.option_display_data?.name || product.name) === row.rawName
    && option.price === row.price && option.quantity === row.quantity
    && row.lat === option.coordinates[1] && row.lng === option.coordinates[0];
}

export function phoenixExpansionLibraryTier(row, record) {
  if(!isPhoenixCityHiveExpansionProof(row)||record?.id!==row.sourceProductBinding.canonicalBottleId)return null;
  const canonical=libraryIdentityKey(row.sourceProductBinding.canonicalName);
  const matches=(record.libraryIdentities||[]).filter(bottle=>[bottle.canonicalName,...(bottle.aliases||[])].some(name=>libraryIdentityKey(name)===canonical));
  if(new Set(matches.map(bottle=>bottle.id)).size!==1||matches[0].isAlertEligible===false)return 'standard';
  const bottle=matches[0],tier=bottle.stateOverrides?.find(o=>o.jurisdiction==='AZ')?.tier||bottle.nationalTier;
  return ({regular:'standard',allocated:'allocated',limited:'limited',highly_allocated:'unicorn',unicorn:'unicorn'})[tier]||'standard';
}
