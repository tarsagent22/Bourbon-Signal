import {libraryIdentityKey} from '../core/library-catalog.mjs';

// A legacy seed tier must not override today's unique exact library identity.
// Missing/ambiguous library identities fail closed for these new integrations.
export function centralCityHiveRecordMarketTier(record,state) {
 if(!record||record.libraryAlertEligible===false)return 'standard';
 const canonical=(record.libraryIdentities||[]).filter(b=>libraryIdentityKey(b.canonicalName)===libraryIdentityKey(record.canonical));
 const identities=canonical.length?canonical:(record.libraryIdentities||[]).filter(b=>(b.aliases||[]).some(alias=>libraryIdentityKey(alias)===libraryIdentityKey(record.canonical)));
 if(new Set(identities.map(b=>b.id)).size!==1)return null;
 const identity=identities[0];if(identity.isAlertEligible===false)return 'standard';
 const overrides=(identity.stateOverrides||[]).filter(o=>o.jurisdiction===state);
 if(new Set(overrides.map(o=>o.tier)).size>1)return null;
 const tier=overrides[0]?.tier||identity.nationalTier;
 return ({regular:'standard',common:'standard',standard:'standard',limited:'limited',allocated:'allocated',highly_allocated:'unicorn',unicorn:'unicorn'})[tier]||null;
}
