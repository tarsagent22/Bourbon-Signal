function asTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

export function buildConditionalHeaders(metadata = {}) {
  const headers = {};
  if (metadata.etag) headers['if-none-match'] = metadata.etag;
  if (metadata.lastModified) headers['if-modified-since'] = metadata.lastModified;
  return headers;
}

export function decideCollectorProbe(metadata = {}, options = {}) {
  const now = asTime(options.now || new Date().toISOString());
  const nextProbe = asTime(metadata.nextProbeAt);
  if (metadata.disabled && !options.force) return { decision: 'skip_disabled', headers: {}, reason: metadata.disabledReason || 'disabled' };
  if (!options.force && now != null && nextProbe != null && now < nextProbe) {
    return { decision: 'skip_not_due', headers: {}, nextProbeAt: metadata.nextProbeAt };
  }
  return { decision: 'probe', headers: buildConditionalHeaders(metadata), reason: options.force ? 'forced' : 'due' };
}

export function updateCollectorMetadata(previous = {}, response = {}, options = {}) {
  const checkedAt = response.checkedAt || new Date().toISOString();
  const cadenceMs = Math.max(0, Number(options.cadenceMs ?? 0));
  const notModified = response.status === 304;
  const sameHash = Boolean(response.contentHash && previous.contentHash && response.contentHash === previous.contentHash);
  const changed = response.status >= 200 && response.status < 300 && !notModified && !sameHash;
  const failed = response.status === 0 || response.status >= 400 || Boolean(response.error);
  return {
    ...previous,
    ...(response.etag ? { etag: response.etag } : {}),
    ...(response.lastModified ? { lastModified: response.lastModified } : {}),
    ...(response.contentHash ? { contentHash: response.contentHash } : {}),
    lastCheckedAt: checkedAt,
    lastStatus: response.status ?? null,
    lastError: response.error || null,
    nextProbeAt: new Date(Date.parse(checkedAt) + cadenceMs).toISOString(),
    consecutiveFailures: failed ? Number(previous.consecutiveFailures || 0) + 1 : 0,
    consecutiveUnchanged: failed ? Number(previous.consecutiveUnchanged || 0) : changed ? 0 : Number(previous.consecutiveUnchanged || 0) + 1,
    ...(changed ? { lastChangedAt: checkedAt } : {})
  };
}
