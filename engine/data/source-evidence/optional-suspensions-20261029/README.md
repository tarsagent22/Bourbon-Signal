# Optional source suspensions

These are access-failure records, not inventory evidence or state activation.
The original GitHub artifact ZIP bytes were downloaded read-only and verified
against the SHA-256 reported by GitHub. `policy.json` retains the workflow,
artifact, exact report/ledger digest, observed source binding, and original clock.
Failed workflow artifacts can establish an observed access failure; they cannot
establish successful inventory delivery.

- Run 40846038572, artifact 12887253807: ten individual Colorado retailer
  source-attempt results reported HTTP 429. The checked-in ledger is byte-exact.
  Its result-finished clocks are upper bounds, not invented response timestamps.
- Run 40608817441, artifact 12783258143: three exact New Hanover configured
  routes and two exact Tennessee ABC configured routes reported HTTP 403.
- The same original run recorded HTTP 403 on two Georgia GoToLiquorStore hosts:
  Beverage World of Cumming (1071) and The Wine Store (1279). The collector then
  skipped twelve unobserved independent hosts. Only the two observed exact
  bindings are suspended. No claim is made that the other twelve were denied.

The exact New Hanover URLs are also guarded at the NC text-transport boundary,
because board discovery and the specialized barrel collector can revisit them.
Other paths, WordPress REST, ABCgo, statewide shipment/warehouse sources and
Wake/High Point/Greensboro sources are independent and remain eligible.

Cold caches, elapsed cooldowns and force flags do not revive these bindings.
Original observations remain stale, non-alertable history with their source
clocks and quantities preserved. New independent sources and healthy sibling
lanes are unaffected. No verifier, lifecycle, inventory threshold or freshness
rule is changed. Resumption requires a separate reviewed change and new access
evidence.
