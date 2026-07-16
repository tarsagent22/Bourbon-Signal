const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isProtectedDashboardResponse(status, location) {
  if (!REDIRECT_STATUSES.has(Number(status)) || typeof location !== 'string') return false;
  return /^\/sign-(?:in|up)(?:\?|$)/.test(location) && /(?:^|[?&])redirect_url=(?:%2F|\/)dashboard(?:&|$)/i.test(location);
}
