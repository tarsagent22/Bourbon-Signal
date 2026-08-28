# Persistent OHLQ worker

The OHLQ worker is a deterministic browser collector. It makes no OpenAI or other model calls.

## Security model

- The worker never solves, clicks, or bypasses a Cloudflare challenge.
- A human may complete OHLQ's normal security verification in the dedicated browser profile when OHLQ requires it.
- Cookies, CSRF values, browser storage, request headers, and profile paths are never uploaded.
- Only a bounded, schema-validated set of first-party OHLQ product and Ohio store-availability fields can cross the ingestion boundary.
- Uploads require a bearer capability validated by its pinned SHA-256 digest, a fresh Ed25519 signature, a deterministic upload ID, a fresh artifact, at least 10 successful products, and at least 500 store rows.
- The signed upload body is gzip-compressed on the wire with strict compressed and expanded size limits; encrypted Blob payloads are compressed before AES-256-GCM encryption to keep storage bounded.
- Artifacts, upload receipts, and freshness manifests are immutable; the reader selects the newest reverse-epoch manifest, so an older concurrent upload cannot replace newer evidence.
- Production revalidates the content digest and freshness before atomically replacing the cached OHLQ browser artifact.
- Missing, stale, partial, blocked, or malformed artifacts leave the prior non-alertable fallback unchanged.

## Local paths

The default persistent state is outside the repository:

`%LOCALAPPDATA%\BourbonSignal\ohlq-worker\`

It contains the Chrome profile, local cooldown, last collected artifact, lock, and status. Never commit this directory.

## Required configuration

The bearer capability is `HMAC-SHA256(CRON_SECRET, "bourbon-signal/ohlq-worker-capability@1")`. Production stores only its SHA-256 digest. Upload bodies are signed with a deterministic Ed25519 key derived locally from `CRON_SECRET` (or supplied explicitly as `OHLQ_WORKER_SIGNING_PRIVATE_KEY`); production stores only the public key.

- The local worker derives the bearer and signing key from the existing local `CRON_SECRET`.
- GitHub Actions receives only the bearer capability as `OHLQ_WORKER_ARTIFACT_SECRET`.
- Vercel needs no shared worker credential; its existing `CRON_SECRET` is used only to encrypt Blob objects at rest.

The worker endpoint defaults to `https://www.bourbonsignal.com/api/source/ohlq/artifact`.

## Human bootstrap

Run:

```bash
npm run ohlq:worker:bootstrap
```

If OHLQ presents its security verification page, complete it normally in the opened Chrome window. The worker leaves that dedicated browser open and does nothing to the challenge. Rerun the bootstrap command until it returns `bootstrap_ready`.

## Deterministic collection

Run:

```bash
npm run ohlq:worker
```

A successful run validates and uploads the sanitized artifact. It consumes browser CPU, memory, and network only; it consumes no model tokens.

## Unattended Windows worker

The scheduled worker uses `scripts/run-ohlq-worker-task.ps1`. The wrapper:

- decrypts `%LOCALAPPDATA%\BourbonSignal\ohlq-worker\worker-credential.dpapi` with Windows DPAPI into memory only;
- prevents overlapping runs with the `Local\BourbonSignalOhlqWorker` mutex;
- terminates a run that exceeds the configured 45-minute bound;
- clears the credential environment and zeroes decrypted memory in `finally`.

The Windows task must run this wrapper only. It must not run or publish the full engine; GitHub Actions is the sole production snapshot release lane.

## Production handoff

The production refresh runs `scripts/fetch-ohlq-worker-artifact.mjs` before state collection. Targeted Ohio, scheduled, and full refreshes require a fresh authenticated artifact and fail closed before collection/publication when it is unavailable. Targeted non-Ohio refreshes may proceed without hydrating Ohio.
