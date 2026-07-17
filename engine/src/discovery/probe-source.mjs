import { adaptersForFingerprintIds, detectPlatformFingerprints } from './platform-fingerprints.mjs';
import { createProbeResult } from './probe-contract.mjs';

function textHas(value, pattern) {
  return pattern.test(String(value || ''));
}

function isBlocked(response) {
  return [401, 403, 407, 429].includes(response.status) || textHas(response.text, /(?:cloudflare|turnstile|captcha|access denied|forbidden|robots? verification|temporarily blocked)/i);
}

function classifyStatic(source, response) {
  const text = response.text || '';
  const sourceClass = String(source.sourceClass || '');
  const platformHints = detectPlatformFingerprints(`${response.url}\n${text.slice(0, 80_000)}`);
  if (isBlocked(response) || /\b(?:sign in|log in|account required)\b/i.test(text)) {
    return createProbeResult({ source, resultClass: 'blocked_terms_identity_ambiguity', method: 'static_http', status: response.status, platformHints, reason: 'Authentication, anti-bot, or access restriction detected.' });
  }
  if (!response.ok) return createProbeResult({ source, resultClass: 'rejected', method: 'static_http', status: response.status, platformHints, reason: `HTTP ${response.status}` });
  if (/\b(?:lottery|drawing|allocated release|limited release|release event)\b/i.test(`${sourceClass}\n${text}`)) {
    return createProbeResult({ source, resultClass: 'official_release_lottery_event', method: 'static_http', status: response.status, platformHints });
  }
  if (/"(?:quantity|inventory_quantity|available_quantity)"\s*:\s*\d+/i.test(text) || /\bquantity\s*[:=]\s*\d+/i.test(text)) {
    return createProbeResult({ source, resultClass: 'exact_quantity_candidate', method: 'static_http', status: response.status, platformHints });
  }
  if (/\b(?:in stock|available for pickup|orderable|add to cart)\b/i.test(text)) {
    return createProbeResult({ source, resultClass: 'binary_orderability', method: 'static_http', status: response.status, platformHints });
  }
  if (/\b(?:store availability|available at|select a store|store locator)\b/i.test(text)) {
    return createProbeResult({ source, resultClass: 'store_availability', method: 'static_http', status: response.status, platformHints });
  }
  if (/(?:application\/ld\+json|__NEXT_DATA__|window\.__[A-Z_]+__)/i.test(text) && /\b(?:bourbon|whiskey|product|catalog|collection)\b/i.test(text)) {
    return createProbeResult({ source, resultClass: 'catalog_watch', method: 'embedded_structured_data', status: response.status, platformHints });
  }
  if (/\b(?:bourbon|whiskey|product|catalog|collection)\b/i.test(text)) {
    return createProbeResult({ source, resultClass: 'catalog_watch', method: 'static_http', status: response.status, platformHints });
  }
  if (/<script\b/i.test(text) && /(?:id=["'](?:root|app)["']|__next|webpack)/i.test(text)) {
    return createProbeResult({ source, resultClass: 'browser_escalation_required', method: 'static_http', status: response.status, platformHints, browserEscalationEligible: true, reason: 'Rendered application shell did not expose a static source surface.' });
  }
  if (/\b(?:directory|find a store|locations)\b/i.test(text)) return createProbeResult({ source, resultClass: 'directory_only', method: 'static_http', status: response.status, platformHints });
  return createProbeResult({ source, resultClass: 'storefront_probeable', method: 'static_http', status: response.status, platformHints });
}

function publicAdapterUrls(source, platformHints) {
  let origin;
  try { origin = new URL(source.url).origin; } catch { return []; }
  return adaptersForFingerprintIds(platformHints)
    .flatMap((adapter) => adapter.publicProbePaths || [])
    .map((probePath) => new URL(probePath, origin).toString());
}

export async function probeSource(source, { httpClient, browserEscalationAttempted = false } = {}) {
  if (!httpClient?.get) throw new Error('A bounded HTTP client is required for source probing.');
  try {
    const staticResponse = await httpClient.get(source.url);
    const staticResult = classifyStatic(source, staticResponse);
    const apiUrls = [...new Set([...(source.publicApiUrls || []), ...publicAdapterUrls(source, staticResult.platformHints)])].slice(0, 2);
    if (staticResult.resultClass !== 'storefront_probeable' || !apiUrls.length) return staticResult;
    for (const apiUrl of apiUrls) {
      const apiResponse = await httpClient.get(apiUrl);
      const apiResult = classifyStatic({ ...source, url: apiUrl, sourceClass: 'public_platform_api' }, apiResponse);
      if (!['rejected', 'directory_only', 'storefront_probeable'].includes(apiResult.resultClass)) return { ...apiResult, method: 'public_platform_api' };
    }
    return staticResult;
  } catch (error) {
    return createProbeResult({
      source,
      resultClass: browserEscalationAttempted ? 'agent_investigation_required' : 'browser_escalation_required',
      method: 'static_http',
      browserEscalationEligible: !browserEscalationAttempted,
      reason: error instanceof Error ? error.message.slice(0, 240) : 'HTTP probe failed.',
    });
  }
}
