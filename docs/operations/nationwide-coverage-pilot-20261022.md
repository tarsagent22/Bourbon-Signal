# Nationwide inventory coverage pilot

The first pilot uses existing Shopify infrastructure at two premises: Mission Trails Wine and Spirits in San Diego, California, and Jensen's Liquors at 1646 SW 27th Avenue in Miami, Florida. Expansion pauses until repeated scheduled collection and matching customer results pass the acceptance checks. The lead coordinates shared changes and owns the sole production release; subagents do not merge, deploy, or activate sources.

## Decision and source boundaries

The October 22 audit found mature discovery, retailer parsers, source leases, freshness gates, and customer coverage measurements. Discovery fingerprints and directory records establish candidates; they do not establish inventory. The independent production scheduler was running NC shipment, Florida ABC, California Shopify, and Ohio artifact dependency jobs. New York and Colorado had no independent scheduler entries. Their later recorded CityHive denials superseded earlier positive captures and exclude them from this pilot.

Shopify is the strongest immediately usable shared platform. Mission Trails already uses the production scheduler and publishes online orderability with a separately fetched pickup policy for its named premises. That evidence does not prove an individual variant's pickup offer. Jensen's exposes a current variant pickup offer naming its exact Miami premises. Both remain binary retailer availability with unknown shelf counts. See [source and partnership research](nationwide-coverage-research-20261022.md).

Jensen's pilot is restricted to product `15414448390218`, variant `67703590977610`, Elijah Craig 18 Year, 750 ml. Two first-party requests collect full product metadata and the exact variant pickup section. The description supplies the size; its tasting notes never supply bottle identity. Buffalo Trace product `7793267081290` is 375 ml despite its title omitting size and is excluded. Historical captures supply reviewed identity only, never current availability.

## Baseline

At 23:30:54 UTC on October 22, the canonical coverage response for the retained 22:22:47 snapshot reported 729 current inventory store identities across eight states and 430 state and city pairs. It reported 1,270 observed inventory identities, including 541 stale, and 5,575 searchable directory entries. These are contract identities, not an independent physical-premises reconciliation. The export separately reported 24 configured states and 188 canonical bottles. State, directory, shipment, catalog, and functioning inventory counts must remain separate.

The latest broad refresh had rolled back when California's customer count fell below its guard. Independent source scheduling was punctual but not wholly healthy: Del Mesa had a schema incident and Ohio lacked its browser artifact. The pilot uses the existing independent scheduler without lowering broad publication checks or changing Ohio. Production run and source acceptance are separate claims.

## Implementation and acceptance

The new Jensen job runs on the existing 30 minute cadence with one hour expiry. Its partition owns only the reviewed store, product, and variant; unrelated Jensen and Florida ABC results remain separate. Access denial pauses this source for 24 hours, rate limiting for at least four hours, and Retry-After can extend backoff. Failure, expiry, policy loss, or an explicit disable suppresses current pilot stock and candidates. Set `JENSENS_SOURCE_POLL_ENABLED=0` for a narrow operational disable; keep the partition registered to prevent old stock reviving.

The durable source ledger records due times, generation, collection origin, request count, bytes, elapsed time, baseline status, observations, and candidate keys. First acceptance is silent. Reconfirmation preserves the availability episode. A narrowly signed receipt reads the normal feed and coverage pipelines and returns only the reviewed public inventory identities, source run, generation, and confirmation time. It cannot request cards, arbitrary sources, history, customer records, or extra filters.

The existing independent scheduler monitor captures source ledger and customer receipts into a retained GitHub Actions artifact. `scripts/capture-nationwide-pilot.mjs` performs the same bounded evidence capture without collecting sources or resetting due times. `scripts/lib/nationwide-pilot-acceptance.mjs` evaluates supplied evidence; it cannot authenticate an invented artifact or make a stale source current.

Acceptance requires two distinct genuinely due scheduled collections per source with advancing generations and timestamps; at least one current canonical bottle at each of the two reviewed premises; matching source generation and bottle identities in both customer surfaces; no bootstrap or duplicate opportunities; and measured requests, transfer, freshness, leases, isolation, backoff, and disable behavior. California's policy evidence and Florida's variant pickup evidence retain separate labels. Source access failures or unavailable customer receipts keep the pilot incomplete.

## Release and evidence record

Preparation is isolated at baseline `c9a33bf16e55e0a842b685a2559dfd3d6a54d48f`. Release must use a canonical finding, the objective wrapper, one PR, current-main required checks, independent review, and the exact-head merge guard. The existing platform sources require no mobile binary change.

Initial preflight, local checks, release identity, immutable unattended captures, and final acceptance are recorded separately. At preparation time, no new production collection or verified pilot completion is claimed. No businesses were contacted and no access or agreement was purchased. Follow-on work is a backlog until this pilot passes.
