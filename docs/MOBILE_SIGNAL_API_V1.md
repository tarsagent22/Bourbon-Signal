# Mobile Signal API v1

This is the shared transport boundary for the web application and Expo app. Both clients use the same Signal objects, access checks, posting rules, and private Hunt Outcome contract.

## Authentication

- `GET /api/v1/signals` and `GET /api/v1/signals/:id` support the existing signed-out preview.
- Mutations require a Clerk session cookie or Clerk bearer session token.
- Private responses use `Cache-Control: private, no-store`, explicit CDN no-store headers, and `Vary: Cookie, Authorization`.

## Endpoints

### List Signals

`GET /api/v1/signals?limit=60&cursor=<opaque>`

- `limit` remains optional and accepts 1-100, preserving existing callers.
- A full authenticated page returns `hasMore` and an opaque `nextCursor`.
- Pass `nextCursor` back unchanged; clients must not decode or construct it.
- `400 INVALID_CURSOR` means the cursor is malformed.
- `409 CURSOR_RESET_REQUIRED` means the feed changed during pagination; clear the list and refresh from page one.
- Signed-out preview responses do not offer continuation beyond the preview boundary.

### Read member state

`GET /api/v1/me/profile`

Requires a Clerk session cookie or bearer session token. Returns only the privacy-safe `Founder #N` / `Member #N` identity when available, authoritative membership tier/label, and the two app-critical entitlement flags (`fullFeed` and `canSubmitSignals`). It never returns email, name, Clerk ID, or internal member IDs.

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

### Record an optional Hunt Outcome

`GET /api/v1/signals/:id/outcome` returns only the signed-in member’s current response for an accessible availability Signal. `POST /api/v1/signals/:id/outcome` accepts `found_it`, `gone_when_checked`, `didnt_go`, or `null` for removal.

The Expo app shows this optional private row only after the Signal’s availability window has ended. It is never a modal, blocking step, list-card control, or dedicated push. A selection replaces the member’s earlier value for the same availability episode and can be edited quietly. Outcomes do not change Signal validity, Community standing, or alert delivery.

### Read and update Radar and Cellar preferences

`GET /api/user/preferences` returns server-authoritative Cellar access, collection entries, Radar areas, notification preferences, and bottle watch preferences. `POST /api/user/preferences` accepts partial writes with the existing collection version/conflict contract.

Cellar may display no more than three factual Hunt Next suggestions derived from explicit member evidence. The client must call the preference write only after the member chooses `Watch for another` or `Watch this bottle`; rendering or refreshing suggestions must never auto-watch.

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
