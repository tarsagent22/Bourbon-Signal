# Shopify cross-state pilot evidence

Status: production deployment verified; repeated scheduled collection acceptance pending.

The lead completed three initial read-only investigations with GPT-6.1 Sol agents, selected the usable Shopify connector, separated collector, integration and verification work, and centrally reconciled shared files. Only the lead released production. Source expansion remains paused until the acceptance record passes.

## Decisions

- Reuse public Shopify parsing, canonical matching, the durable source scheduler, source ownership gates and the normal customer feed and coverage pipelines.
- Verify Mission Trails in San Diego and Jensen's in Miami. Both premises existed in coverage before this work. The new connection is Jensen's independent scheduled refresh, not a newly discovered physical store.
- Keep Mission Trails' general pickup policy distinct from Jensen's exact variant pickup offer. Both represent binary retailer availability with unknown shelf quantity.
- Restrict Jensen's to reviewed Elijah Craig 18 Year product 15414448390218, variant 67703590977610, 750 ml. Exclude the Buffalo Trace product whose description says 375 ml.
- Keep CityHive routes with access denials in their recorded cooldowns. Partnership, chain and platform opportunities are research only. No business contact, purchase or agreement occurred.
- Preserve broad snapshot quality checks and the single production-release lane. No due time resets or manual collection count as unattended proof.

## Release and checks

[PR 817](https://github.com/tarsagent22/Bourbon-Signal/pull/817) passed the full required [CI run](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39874034699) and independent review before the guarded expected-head merge. Source head: 941324e737057c0ab8989bf41cd27050b2c7f2be. Production merge: be8ad383b04d08882fe753958a95be2e118dd707. Their Git trees match. The merged commit also passed [CI](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39875195855).

The production health response confirmed commit be8ad383b04d08882fe753958a95be2e118dd707 and deployment dpl_5tSH8dKgvMwkAxyuufueCETny1tF. Its alert cron was healthy at 00:08 UTC. The broader engine snapshot remained stale following its independent rollback; this is not a nationwide health success claim.

Relevant local checks passed: 135 focused tests, TypeScript, the production build, coverage tests and the engine data-plane suite. Required CI exercised actual SQL lease behavior and source failure, freshness, ownership, backoff and disable regressions. These are test proofs; no production disable experiment was performed.

## Measurement rules

The baseline at 23:30:54 UTC reported 729 current contract inventory store identities across eight states, 430 state and city pairs, 1,270 observed identities including 541 stale, and 5,575 directory entries. The export had 24 configured states and 188 canonical bottles. These counts are separate and are not an independent census of physical stores with working connections.

The pilot will report unique premises, independent functioning connections, canonical bottle identities and store/bottle pairs separately. Expected scope is two existing premises, one new independent connection, one exact variant pickup premise and one general pickup-policy premise. Actual scheduled runs and matching receipts must supply the final bottle breadth, collection cost and freshness.

## Verification evidence

The first Jensen collection was genuinely scheduled, accepted at 00:00:23.089 UTC, generation 1, run a3cb9536-589e-408a-ac2c-935a38fefd5c. It produced one current EC18 observation in two requests and 11,112 bytes, with zero bootstrap projected candidates. Its feed and coverage identity receipts matched in [verification artifact 39875683243](https://github.com/tarsagent22/Bourbon-Signal/actions/runs/39875683243/artifacts/12467354141).

California's generation 562 preceded this deployment and cannot count as a newly instrumented collection. Its three retained projection candidates are not three new emissions. Supplemental SELECT-only queue evidence must map the exact current run and generation, preserve each generation's own immutable capture, include legacy identity aliases and observe at least five minutes after collection. Unknown, conflicting or nonzero results remain pending.

Queue aggregates describe surviving new queue rows and recorded delivery attempts for the mapped keys within explicit observed windows. They do not prove zero projection output, reservation calls, deleted records, unrecorded provider calls, future attempts or phone display. No member records, candidate IDs, provider IDs or payloads are read by this proof.

GitHub monitor artifacts remain valuable even when the overall monitor is red for the unrelated Del Mesa schema failure or missing Ohio artifact. Capture-step success and exact pilot receipts are checked separately. The signed receipt returns only public inventory identities from the normal customer pipelines; browser rendering and physical-device interaction are not claimed.

## Follow-on work

After acceptance, evaluate at most one additional Shopify premise with fresh exact pickup proof and the same bounded cost and freshness checks. This is a backlog decision, not source activation. Keep denied CityHive routes behind cooldown and access proof. Treat Bottlecapps/BottlePOS and chain feeds as partnership research until access is explicitly agreed. Preserve state and official-system work for gaps, including shipment intelligence as its own class.

Known follow-up issues from the audit include broader snapshot rollback/freshness, the Del Mesa schema incident, missing Ohio browser evidence, and the legacy Florida size extraction limitation outside the new Jensen partition. No unrelated repair or expansion is included in this pilot.
