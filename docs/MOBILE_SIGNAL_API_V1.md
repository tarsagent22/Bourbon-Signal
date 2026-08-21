# Mobile Signal API v1

This is the transport boundary for the future native client. The current web application and a future Expo app use the same Signal objects and posting rules.

## Authentication

- `GET /api/v1/signals` and `GET /api/v1/signals/:id` support the existing signed-out preview.
- Mutations require a Clerk session cookie or Clerk bearer session token.
- Private responses use `Cache-Control: private, no-store`, explicit CDN no-store headers, and `Vary: Cookie, Authorization`.

## Endpoints

### List Signals

`GET /api/v1/signals?limit=60`

The initial list contract accepts only `limit` (1-100) and returns the canonical `bourbon-signal/signal@1` feed contract. Cursor pagination and server-side filters remain a later additive extension; clients should not assume undocumented parameters.

### Read one Signal

`GET /api/v1/signals/:id`

Returns:

```json
{
  "contractVersion": "bourbon-signal/mobile-api@1",
  "signal": {}
}
```

The ID is the opaque canonical Signal ID returned by the list API.

### Create a member Signal

`POST /api/v1/signals`

Required header: `Idempotency-Key` (8-120 URL-safe characters). A retry with the same member, key, and body returns the original Signal. Reusing the key for a different body returns `409`.

```json
{
  "bottle": { "id": "optional-catalog-id", "name": "Bottle name" },
  "store": {
    "id": "optional-store-id",
    "name": "Store name",
    "address": "123 Main St",
    "city": "Charlotte",
    "state": "NC"
  },
  "reportMode": "seen_in_store",
  "price": 79.99,
  "note": "Optional member note"
}
```

Matched and unmatched bottle/store submissions pass through the established review, dedupe, entitlement, reward, and persistence workflow. The response includes the canonical Signal object that clients can insert directly into the feed.

A matched store (`store.id`) must include its canonical street address. Manual stores omit `store.id` and require city plus two-letter state; the existing review queue resolves them later.

### Act on a member Signal

`POST /api/v1/signals/:id/actions`

```json
{ "action": "helpful" }
```

Supported initial actions are `helpful`, `confirm`, `correct`, and `no_longer_there`. These preserve the existing durable positive/negative community reaction behavior. Other Signal source types return the stable `ACTION_NOT_AVAILABLE` response until their underlying action workflows are unified.

Action POSTs activate the requested state and are safe to retry; deactivation is deliberately deferred from this initial mobile contract.

## Public identity

New member submissions project only an existing durable `Founder #N` or `Member #N` identity from Clerk public metadata. Founder identity takes precedence. Names, emails, Clerk IDs, reward state, and private metadata never enter the v1 Signal response.

Existing records without an authoritative number remain labeled `Member`; the API does not invent or derive member numbers.

## Error envelope

```json
{
  "contractVersion": "bourbon-signal/api-error@1",
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable message",
    "retryable": false
  }
}
```

The framework-neutral contracts and fetch client live in:

- `src/lib/signals/signal-api-contract.ts`
- `src/lib/signals/signal-api-client.ts`

They are intentionally kept dependency-light so they can move into a shared package when `apps/mobile` is created. This milestone does not add a speculative workspace or native shell.
