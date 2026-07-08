# Bourbon Signal newsletter workflow

## Template

- `emails/newsletters/templates/cream-editorial-newsletter.html` is the reusable cream/editorial newsletter format Chandler approved.
- Keep `{{unsubscribeUrl}}` in the footer link. The send script replaces it with each recipient's signed `/unsubscribe` URL.

## Tonight's approved newsletter

- `emails/newsletters/outbox/2026-07-08-weekly-update-approved-preview.html`
- Subject: `Bourbon Signal • Weekly update`
- Sender: `Chandler Todd <chandler@bourbonsignal.com>`

Dry-run recipient count:

```bash
vercel env pull .env.production.local --environment=production --yes
node scripts/send-approved-newsletter.mjs
```

Send when Chandler explicitly says to send:

```bash
vercel env pull .env.production.local --environment=production --yes
node scripts/send-approved-newsletter.mjs --apply
```

Optional small test blast:

```bash
node scripts/send-approved-newsletter.mjs --apply --limit=3
```

## Resend audience sync

Backfill all Clerk members into the Resend audience:

```bash
vercel env pull .env.production.local --environment=production --yes
node scripts/sync-clerk-members-to-resend.mjs --apply
```

The script creates missing contacts only. Existing contacts are not forcibly resubscribed, so prior unsubscribes are respected.

## Recommended list behavior

Do not hard-delete unsubscribe contacts from Resend for normal marketing opt-outs. Set `unsubscribed: true` instead. That preserves the suppression state and avoids accidentally re-adding someone during a future member sync. Resubscribe only through the explicit resubscribe link on `/unsubscribe?action=resubscribe` or another clear opt-in flow.
