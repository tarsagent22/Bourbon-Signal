export function ohlqBlockedReason(value = '') {
  const text = String(value || '').toLowerCase();
  return /cloudflare|access denied|restrict access|forbidden|rate limit|error 1015|temporarily banned|\b403\b|\b429\b/.test(text);
}

export function ohlqResultIsAccessBlocked(result = {}) {
  return result?.status === 403
    || result?.status === 429
    || ohlqBlockedReason(result?.error)
    || ohlqBlockedReason(result?.title);
}
