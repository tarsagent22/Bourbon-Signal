import assert from 'node:assert/strict';
import { normalizeNotificationPreferences } from '../src/lib/notification-preferences.ts';

const legacy = normalizeNotificationPreferences({
  email: { enabled: true, mode: 'daily_roundup' },
});
assert.equal(legacy.email.enabled, false, 'legacy daily-roundup users must not be silently converted into real-time email delivery');
assert.equal(legacy.email.mode, 'major_only');

const all = normalizeNotificationPreferences({ email: { enabled: true, mode: 'all' } });
assert.deepEqual(all.email, { enabled: true, mode: 'all' });

const majorOnly = normalizeNotificationPreferences({ email: { enabled: true, mode: 'major_only' } });
assert.deepEqual(majorOnly.email, { enabled: true, mode: 'major_only' });

console.log('Notification preference migration tests passed.');
