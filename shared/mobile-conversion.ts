export const MOBILE_CONVERSION_EVENTS = [
  'first_open', 'app_active', 'signup_started', 'verification_sent', 'signup_verified', 'local_report_seen',
  'area_saved', 'bottle_check_completed', 'bottle_saved', 'paywall_viewed', 'checkout_started',
  'checkout_canceled', 'checkout_pending', 'checkout_error', 'membership_confirmed',
  'watch_ready', 'push_ready', 'alert_opened', 'preview_report_opened',
] as const;
export type MobileConversionEvent = typeof MOBILE_CONVERSION_EVENTS[number];
export type ConversionEntry = 'welcome' | 'local_preview' | 'first_run' | 'account' | 'local_feed' | 'saved_bottle' | 'report' | 'setup' | 'radar' | 'bottle_check';
const entries = new Set<ConversionEntry>(['welcome','local_preview','first_run','account','local_feed','saved_bottle','report','setup','radar','bottle_check']);
const guest = new Set<MobileConversionEvent>(['first_open','app_active','signup_started','verification_sent','signup_verified','local_report_seen']);
export type ConversionContext = { entry?: ConversionEntry; coverage?: 'current' | 'limited' | 'unknown' };
export function normalizeConversionEntry(value: unknown): ConversionEntry {
  return typeof value === 'string' && entries.has(value as ConversionEntry) ? value as ConversionEntry : 'account';
}

export function parseMobileConversion(input: unknown, signedIn: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const event = row.event as MobileConversionEvent;
  if (!MOBILE_CONVERSION_EVENTS.includes(event) || (!signedIn && !guest.has(event))) return null;
  if (typeof row.installation !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.installation)) return null;
  if (row.platform !== 'ios' && row.platform !== 'android') return null;
  return { event, installation: row.installation.toLowerCase(), platform: row.platform,
    entry: normalizeConversionEntry(row.entry), coverage: row.coverage === 'current' || row.coverage === 'limited' ? row.coverage : 'unknown' };
}
