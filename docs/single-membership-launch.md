# Single paid membership

Barrel Proof is the only membership offered to new customers, at $6/month.
Free retains its existing limits. Every active paid billing tier receives the
complete paid feature set. Existing Founder access and recognition remain valid.

## Existing Stripe subscriptions

Legacy Standard subscriptions keep their existing Stripe subscription and price
IDs. No subscription migration, invoice adjustment, or customer metadata rewrite
is required to grant full access. Existing Standard monthly billing remains $3.
Cancellation stops future renewals; full access continues until the paid period
ends. After expiration, customers start a new $6 subscription. Resuming renewal
before expiration retains the original subscription price.

The billing portal uses a dedicated configuration that permits payment-method
updates, invoices, and cancellation at period end. Subscription switching is
disabled so a legacy customer cannot unintentionally replace their rate.

Existing annual memberships, gifts, reward redemptions, and Founder purchases
remain recognizable. New gift purchases and new Founder/Standard checkouts are
retired. Existing gift redemption and fulfillment remain available. Membership
reward credit amounts continue to follow the real billing plan ($3 or $6), while
both confer full access.

## Store purchases

New native purchase readiness and the paywall offer only Barrel monthly. Historical
Standard/annual transaction IDs remain recognized for restore and reconciliation.
The owner reports no paid Apple subscribers; that report is not a provider audit.
Store catalog changes must verify real subscriber state before retiring products.

## Provider verification still required

With live Stripe access, confirm current subscription counts and prices, archive
retired prices for new purchases without updating existing subscription items,
and expire stale open checkout sessions/payment links for retired plans. Check
the provider catalog separately from source tests and deployment. No live billing
provider changes are implied by this source change.

## Loading artwork

The feed placeholder uses a continuous bottle with shoulders, a cap, rounded base,
and quiet glass/label details. The checked-in SVG is rasterized at 3x for native
Image support without an additional native module. Existing reduced-motion and
app-background animation controls are retained.
