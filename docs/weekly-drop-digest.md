# Account Newsletter Audience

Creating a Clerk account automatically adds the account's primary email address to the configured Resend audience through `/api/webhooks/clerk`.

The homepage does not render an email capture form. `/api/subscribe` remains available as the newsletter subscription API for controlled/manual enrollment, but it is not presented as a standalone homepage feature.

Production storage is Resend Audiences. The route does **not** send email; it only creates or updates a contact in the configured audience.

## Required environment variables

- `RESEND_API_KEY` — Resend API key with contacts/audience access.
- `RESEND_DIGEST_AUDIENCE_ID` — Resend Audience ID for weekly drop digest subscribers.

## Behavior

- Verifies Clerk `user.created` webhook signatures and rejects timestamps older than five minutes.
- Adds the new account's primary email to the Resend audience.
- Does not resubscribe an existing contact, preserving prior unsubscribe state.
- Normalizes emails to lowercase.
- Validates basic email format.
- Creates a Resend contact in `RESEND_DIGEST_AUDIENCE_ID`.
- An explicit `/api/subscribe` request resubscribes an existing contact.
- Opening `/unsubscribe` is read-only; a signed POST confirmation owns unsubscribe and explicit resubscribe mutations.
- Newsletter unsubscribe also records master email suppression for the matching Clerk member so opted-in product briefs cannot override the broader choice.
- Automatic Clerk account enrollment and the reconciliation script do not resubscribe existing contacts, preserving prior unsubscribe state.
- Does not attach custom Resend contact properties yet because Resend requires properties to be pre-created before writes.
- In non-production only, if `RESEND_DIGEST_AUDIENCE_ID` is missing, it falls back to local `data/subscribers.json` for development convenience.
- In production, missing Resend config returns a user-safe error and logs the config issue server-side.

## Important boundary

Audience enrollment does not itself send email, monitor email, reply to users, or perform support inbox work. Newsletter sends remain an explicit operator action and must include the tokenized unsubscribe link.

## Existing-account reconciliation

The Clerk-to-Resend sync is dry-run by default. After reviewing its user count, apply missing contacts with:

```bash
node scripts/sync-clerk-members-to-resend.mjs --apply
```

The sync creates missing contacts only and does not forcibly resubscribe existing contacts.
