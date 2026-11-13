# Feed serving and latency

The market feed reads a verified inventory snapshot and applies the current source heads, retailer submissions, membership, and row expiry. A published snapshot is already compressed in Blob; the server reuses its normalized rows in a bounded worker cache. A cold worker loads and normalizes it once, without serializing and recompressing the full feed or restarting the load on a cache size failure.

Every request reads current source heads. PostgreSQL returns the requested row family only when the worker has not seen its accepted revision. A failure, disable, accepted empty result, or elapsed confirmation window still takes effect without waiting for a payload cache to expire. Source health and feed trace writes do not grant inventory access.

To check production, make several requests to the canonical `/api/v1/signals?view=market&limit=30` URL. Record status, wall time, row count, and `Server-Timing`. Compare `prepare` with `desc="build"` and `desc="cache"` separately; `base`, `runtime`, `retailers`, and `filter` show where the request spent time. The three reads overlap, so their durations should not be added. Preserve `private, no-store` on the response. HTTP timings do not measure native launch or first paint.

November 13 baseline: 12.77 and 12.93 seconds for two build responses, and 2.43, 2.93, and 3.52 seconds for three cache responses. The active drops export measured 60,771,960 bytes plaintext and 3,415,851 bytes encrypted. An aggregate read of source jobs measured roughly 8 MB of stored projection JSON; a heads-only query returned about 1 KB. These are individual observations, not a fleet percentile.
