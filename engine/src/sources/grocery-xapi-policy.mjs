import { createHash } from 'node:crypto';

// Deliberately empty. Preparation evidence never activates production authority.
export const GROCERY_XAPI_SOURCES = Object.freeze([]);
export const groceryXapiHash = value => createHash('sha256').update(stable(value)).digest('hex');
function stable(value) { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const isGroceryXapiManagedRow = row => [row?.sourceRuntimeId,row?.sourceChain,row?.sourcePollId].some(value=>String(value || '').startsWith('xapi:')) || [row?.sourceCollectorVersion,row?.raw?.collectorVersion].some(v => String(v || '').startsWith('grocery-xapi-'));
const get = (map, id) => map?.get?.(id) || map?.[id];
const tuple = row => JSON.stringify([String(row.productId ?? ''), String(row.variantId ?? '')]);

/** Compile only explicitly reviewed inputs. Hashes bind configuration, SKU scope and runtime. */
export function compileGroceryXapiDescriptors({ definitions = [], admissions = [], runtimeVersion, runtimeSha256 } = {}) {
  if (!Array.isArray(definitions) || !Array.isArray(admissions)) throw new TypeError('Invalid XAPI registry');
  if (!definitions.length && !admissions.length) return Object.freeze([]);
  if (!/^grocery-xapi-[a-z0-9.-]+$/.test(runtimeVersion || '') || !hash(runtimeSha256)) throw new TypeError('Invalid XAPI runtime authority');
  const seen = new Set();
  const descriptors = definitions.map(input => {
    const d = structuredClone(input), p = d?.premise;
    if (!['NV','CA','AZ'].includes(d?.state) || !['safeway','albertsons','vons'].includes(d.banner)
      || typeof d.merchantId !== 'string' || typeof p?.zip !== 'string' || d.host !== `www.${d.banner}.com` || !/^\d{2,6}$/.test(d.merchantId || '')
      || d.id !== `xapi:${d.state.toLowerCase()}:${d.banner}:${d.merchantId}` || seen.has(d.id)
      || p?.state !== d.state || p.storeId !== `${d.banner}:${d.merchantId}`
      || !['name','address','city','zip'].every(key => text(p[key])) || !/^\d{5}$/.test(p.zip)
      || !Number.isFinite(d.expiryHours) || d.expiryHours <= 0 || d.expiryHours > 1
      || !Array.isArray(d.bindings) || !d.bindings.length) throw new TypeError('Invalid XAPI definition');
    seen.add(d.id);
    const keys = new Set();
    for (const b of d.bindings) {
      if (!['productId','variantId','canonicalBottleId','canonicalName','rawName'].every(key => text(b[key]))
        || b.volumeMl !== 750 || b.packageCount !== 1 || keys.has(tuple(b))) throw new TypeError('Invalid XAPI binding');
      keys.add(tuple(b));
    }
    const configSha256 = groceryXapiHash(d), matches = admissions.filter(a => a?.sourceId === d.id);
    if (matches.length !== 1) throw new TypeError('Missing or duplicate XAPI admission');
    const admission = structuredClone(matches[0]);
    if (admission.configSha256 !== configSha256 || admission.runtimeSha256 !== runtimeSha256
      || admission.runtimeVersion !== runtimeVersion || admission.bindingsSha256 !== groceryXapiHash(d.bindings)
      || !Number.isFinite(Date.parse(admission.reviewedAt)) || !Number.isFinite(Date.parse(admission.expiresAt))
      || Date.parse(admission.expiresAt) <= Date.parse(admission.reviewedAt)) throw new TypeError('XAPI admission authority mismatch');
    // Arizona's customer guard already recognizes exact banner/merchant/store
    // identities. Retain that alias while the independent runtime ID owns the
    // reviewed tuple; no public guard is relaxed for a new source.
    const chain=d.state==='AZ'?d.banner:d.id;
    const bannerName={safeway:'Safeway',albertsons:'Albertsons',vons:'Vons'}[d.banner];
    const marketName={AZ:'Arizona',NV:'Nevada',CA:'California'}[d.state];
    return freeze({ id:d.id, kind:'grocery-xapi', state:d.state, chain,
      sourceLabel:`${bannerName} ${marketName} XAPI store inventory`,
      cadence:1800, expiryHours:d.expiryHours, failClosedOnError:true, noImmediateRetry:true, accessDeniedPauseSeconds:86400, rateLimitedPauseSeconds:14400, storeIds:[p.storeId], productIds:[...new Set(d.bindings.map(b=>b.productId))], variantIds:[...new Set(d.bindings.map(b=>b.variantId))], definition:d, configSha256, runtimeSha256, runtimeVersion, admission, admissionSha256:groceryXapiHash(admission) });
  });
  if (admissions.length !== descriptors.length) throw new TypeError('Unbound XAPI admission');
  return Object.freeze(descriptors);
}

/** @param {{descriptors?: any[], lookup?: any, policySnapshotId?: string, enabledSourceIds?: string[], now?: number, blockedStates?: string[]}} [options] */
export function createGroceryXapiPolicy({descriptors=GROCERY_XAPI_SOURCES,lookup,policySnapshotId,enabledSourceIds=[],now=Date.now(),blockedStates=[]}={}) {
  if (!Array.isArray(descriptors) || !Array.isArray(enabledSourceIds) || !Array.isArray(blockedStates) || !Number.isFinite(now)) throw new TypeError('Invalid XAPI policy context');
  const compiled = new Map(), enabled = new Set(enabledSourceIds), blocked = new Set(blockedStates);
  for (const descriptor of descriptors) {
    const [rebuilt] = compileGroceryXapiDescriptors({definitions:[descriptor.definition],admissions:[descriptor.admission],runtimeVersion:descriptor.runtimeVersion,runtimeSha256:descriptor.runtimeSha256});
    const {disabled, ...authority} = descriptor;
    if ((disabled !== undefined && typeof disabled !== 'boolean') || stable(rebuilt) !== stable(authority) || compiled.has(descriptor.id)) throw new TypeError('Modified XAPI descriptor');
    compiled.set(descriptor.id,freeze({...rebuilt,disabled:disabled === true}));
  }
  if (enabled.size !== enabledSourceIds.length || [...enabled].some(id => !compiled.has(id))) throw new TypeError('Unadmitted XAPI enabled source');
  const partitionOwner = row => [...compiled.values()].find(s => row?.state===s.state && row.sourceChain===s.chain && row.storeId===s.definition.premise.storeId && s.definition.bindings.some(b=>tuple(b)===tuple(row)));
  const managed = row => isGroceryXapiManagedRow(row) || Boolean(partitionOwner(row));
  function evaluateObservation(row) {
    const owned = managed(row), source = compiled.get(row?.sourceRuntimeId) || partitionOwner(row);
    const reject = reason => Object.freeze({owned,eligible:false,reason,sourceId:source?.id || null});
    if (!owned) return reject('legacy_or_unmanaged');
    if (!source) return reject('not_admitted');
    const d=source.definition,p=d.premise,raw=row.raw || {};
    if (source.disabled || !enabled.has(source.id)) return reject('source_disabled');
    if (blocked.has(d.state)) return reject('state_blocked');
    if (Date.parse(source.admission.reviewedAt)>now || Date.parse(source.admission.expiresAt)<=now) return reject('admission_expired');
    if (!text(policySnapshotId) || row.sourcePolicySnapshotId!==policySnapshotId) return reject('current_policy_mismatch');
    if (row.sourceRuntimeId!==source.id || row.sourceConfigSha256!==source.configSha256 || row.sourceAdmissionSha256!==source.admissionSha256
      || row.sourceRuntimeSha256!==source.runtimeSha256 || row.sourceCollectorVersion!==source.runtimeVersion) return reject('row_authority_mismatch');
    if ([row.configSha256,raw.configSha256].filter(v=>v!==undefined).some(v=>v!==source.configSha256)
      || [row.admissionSha256,raw.admissionSha256].filter(v=>v!==undefined).some(v=>v!==source.admissionSha256)
      || [row.runtimeSha256,raw.runtimeSha256].filter(v=>v!==undefined).some(v=>v!==source.runtimeSha256)
      || [raw.collectorVersion].filter(v=>v!==undefined).some(v=>v!==source.runtimeVersion)) return reject('conflicting_authority');
    if (row.state!==d.state || row.stateCode!==d.state || row.merchantId!==d.merchantId || row.sourceChain!==source.chain
      || row.storeId!==p.storeId || norm(row.storeName)!==norm(p.name) || norm(row.storeAddress)!==norm(p.address)
      || norm(row.city)!==norm(p.city) || (row.zip || row.postalCode)!==p.zip) return reject('premises_mismatch');
    if ([row.address].filter(v=>v!==undefined).some(v=>norm(v)!==norm(p.address)) || [row.postalCode].filter(v=>v!==undefined).some(v=>v!==p.zip)
      || [raw.merchantId].filter(v=>v!==undefined).some(v=>v!==d.merchantId)
      || [raw.chain].filter(v=>v!==undefined).some(v=>v!==source.chain)) return reject('conflicting_premises');
    const b=d.bindings.find(binding=>tuple(binding)===tuple(row));
    if (!b || row.sourceUrl!==`https://${d.host}/shop/product-details.${b.productId}.html`
      || row.sourceProductBinding!==groceryXapiHash(b)) return reject('product_binding_mismatch');
    if ([raw.product?.id,raw.product?.pid].filter(v=>v!==undefined).some(v=>String(v)!==b.productId)
      || [raw.variant?.id].filter(v=>v!==undefined).some(v=>String(v)!==b.variantId)
      || [row.canonicalId,row.bottleId].filter(v=>v!==undefined).some(v=>v!==b.canonicalBottleId)) return reject('conflicting_product_identity');
    const record=get(lookup?.byState?.[d.state]?.byId,b.canonicalBottleId);
    const globalRecord=get(lookup?.byId,b.canonicalBottleId);
    if (!globalRecord || (globalRecord.id || globalRecord.canonical_id)!==b.canonicalBottleId || norm(globalRecord.canonical || globalRecord.canonical_name || globalRecord.name)!==norm(b.canonicalName)) return reject('current_global_canonical_mismatch');
    if (!record || (record.id || record.canonical_id)!==b.canonicalBottleId || !['limited','allocated','unicorn'].includes(record.tier)
      || norm(record.canonical || record.canonical_name || record.name)!==norm(b.canonicalName)
      || row.canonicalBottleId!==b.canonicalBottleId || norm(row.canonicalName)!==norm(b.canonicalName)
      || norm(row.rawName)!==norm(b.rawName) || row.tier!==record.tier) return reject('current_canonical_mismatch');
    if (raw.volumeMl!==b.volumeMl || raw.packageCount!==1 || raw.fulfillmentPolicyVerified!==true) return reject('unsupported_package_or_fulfillment');
    if (row.completeSnapshot!==false || row.absenceIsOutOfStock!==false) return reject('invalid_search_scope');
    if (row.stale===true || row.sourceStale===true || row.hidden===true || row.inert===true || raw.staleFallback===true || raw.cacheFallback===true) return reject('stale_or_inert');
    for (const clock of [row.observedAt,row.lastConfirmedAt,row.sourceObservedAt,raw.observedAt,raw.lastConfirmedAt].filter(v=>v!==undefined)) {
      const time=Date.parse(clock); if (!Number.isFinite(time) || time>now || now-time>d.expiryHours*3600000) return reject('observation_expired');
    }
    if (!text(row.observedAt)) return reject('observation_expired');
    if ([row.sourceObservedAt,raw.observedAt].filter(v=>v!==undefined).some(v=>Date.parse(v)!==Date.parse(row.observedAt))
      || (row.lastConfirmedAt!==undefined && raw.lastConfirmedAt!==undefined && Date.parse(row.lastConfirmedAt)!==Date.parse(raw.lastConfirmedAt))) return reject('conflicting_observation_clock');
    if (row.eventType!=='retailer_store_inventory_result' || row.locationPrecision!=='store_level') return reject('invalid_inventory_proof');
    if (['in_stock','out_of_stock'].includes(row.availabilityStatus)) {
      if (row.sourceAvailabilityVerified!==true) return reject('invalid_inventory_proof');
      if (row.availabilityStatus==='out_of_stock' && (row.quantity!==0 || row.quantityIsExact!==true || raw.reportedQuantity!==0 || row.inventorySemantics!=='exact_retailer_quantity' || row.canAlertAsInventory!==false)) return reject('invalid_negative_count');
    } else if (!['unknown','omitted_first_page'].includes(row.availabilityStatus) || row.quantity!==0 || row.canAlertAsInventory!==false) return reject('invalid_unknown_observation');
    return Object.freeze({owned:true,eligible:true,reason:'accepted_observation_identity',sourceId:source.id,marketTier:record.tier});
  }
  function evaluate(row) {
    const result=evaluateObservation(row); if (!result.eligible) return result;
    if (row.availabilityStatus!=='in_stock' || !Number.isSafeInteger(row.quantity) || row.quantity<=0 || row.quantity>=100
      || row.quantityIsExact!==true || row.inventorySemantics!=='exact_retailer_quantity'
      || row.raw.reportedQuantity!==row.quantity || row.canAlertAsInventory===false) return Object.freeze({...result,eligible:false,reason:'invalid_positive_count'});
    return Object.freeze({...result,reason:'accepted_exact_store_count'});
  }
  return Object.freeze({owns:managed,evaluate,evaluateObservation,eligible:row=>evaluate(row).eligible});
}
