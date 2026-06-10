# Weekly Drop Digest Capture

The homepage weekly drop digest form posts to `/api/subscribe`.

Production storage is Resend Audiences. The route does **not** send email; it only creates or updates a contact in the configured audience.

## Required environment variables

- `RESEND_API_KEY` — Resend API key with contacts/audience access.
- `RESEND_DIGEST_AUDIENCE_ID` — Resend Audience ID for weekly drop digest subscribers.

## Behavior

- Normalizes emails to lowercase.
- Validates basic email format.
- Creates a Resend contact in `RESEND_DIGEST_AUDIENCE_ID`.
- If the contact already exists, updates it as subscribed.
- Adds contact properties:
  - `source=homepage_weekly_drop_digest`
  - `subscribedAt=<ISO timestamp>`
- In non-production only, if `RESEND_DIGEST_AUDIENCE_ID` is missing, it falls back to local `data/subscribers.json` for development convenience.
- In production, missing Resend config returns a user-safe error and logs the config issue server-side.

## Important boundary

This capture flow does not monitor email, send email, reply to users, or perform support inbox work.
