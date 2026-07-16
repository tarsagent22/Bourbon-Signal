import assert from 'node:assert/strict';
import {
  WeeklyIntelligencePreferenceConflict,
  applyNotificationPreferencesPatch,
  normalizeNotificationPreferences,
} from '../src/lib/notification-preferences.ts';
import {
  issueNewsletterResubscribeConfirmation,
  newsletterSignatureFor,
  verifyNewsletterPreferenceAuthorization,
} from '../src/lib/newsletter-preference-token.ts';

const legacy = normalizeNotificationPreferences({
  email: { enabled: true, mode: 'daily_roundup' },
});
assert.equal(legacy.email.enabled, false, 'legacy daily-roundup users must not be silently converted into real-time email delivery');
assert.equal(legacy.email.mode, 'major_only');

const all = normalizeNotificationPreferences({ email: { enabled: true, mode: 'all' } });
assert.deepEqual(all.email, { enabled: true, mode: 'all' });

const majorOnly = normalizeNotificationPreferences({ email: { enabled: true, mode: 'major_only' } });
assert.deepEqual(majorOnly.email, { enabled: true, mode: 'major_only' });

const suppressed = normalizeNotificationPreferences({
  onSite: { enabled: true },
  email: { enabled: true, mode: 'major_only' },
  weeklyIntelligence: {
    emailEnabled: false,
    optedInAt: '2026-07-01T12:00:00.000Z',
    unsubscribedAt: '2026-07-16T13:00:00.000Z',
    version: 2,
  },
});
const unrelatedSave = applyNotificationPreferencesPatch({
  existing: suppressed,
  requested: {
    email: { enabled: false, mode: 'major_only' },
    weeklyIntelligence: {
      emailEnabled: true,
      optedInAt: '2026-07-01T12:00:00.000Z',
      unsubscribedAt: null,
      version: 1,
    },
  },
  now: '2026-07-16T14:00:00.000Z',
});
assert.deepEqual(unrelatedSave.preferences.weeklyIntelligence, suppressed.weeklyIntelligence, 'a stale full-object save cannot imply weekly resubscribe');
assert.equal(Object.hasOwn(unrelatedSave.metadataPatch, 'weeklyIntelligence'), false, 'nested metadata patches omit weekly consent without an explicit action');
assert.deepEqual(unrelatedSave.metadataPatch.email, { enabled: false, mode: 'major_only' });

assert.throws(() => applyNotificationPreferencesPatch({
  existing: suppressed,
  requested: { weeklyIntelligence: { action: 'subscribe', expectedVersion: 1 } },
  now: '2026-07-16T14:00:00.000Z',
}), WeeklyIntelligencePreferenceConflict, 'resubscribe rejects a stale preference version');

const explicitResubscribe = applyNotificationPreferencesPatch({
  existing: suppressed,
  requested: { weeklyIntelligence: { action: 'subscribe', expectedVersion: 2 } },
  now: '2026-07-16T14:00:00.000Z',
});
assert.deepEqual(explicitResubscribe.preferences.weeklyIntelligence, {
  emailEnabled: true,
  optedInAt: '2026-07-16T14:00:00.000Z',
  unsubscribedAt: '2026-07-16T13:00:00.000Z',
  version: 3,
}, 'explicit current-version consent records a newer opt-in without deleting suppression history');
assert.equal(Object.hasOwn(explicitResubscribe.metadataPatch.weeklyIntelligence, 'unsubscribedAt'), false, 'resubscribe never clears unsubscribedAt in storage');

const newsletterSecret = 'newsletter-test-secret';
const email = 'member@example.com';
const legacyUnsubscribeSignature = newsletterSignatureFor(email, newsletterSecret);
assert.equal(verifyNewsletterPreferenceAuthorization({
  action: 'unsubscribe',
  email,
  unsubscribeSignature: legacyUnsubscribeSignature,
  secret: newsletterSecret,
  now: '2026-07-16T14:00:00.000Z',
}), true, 'existing unsubscribe links remain valid for suppression');
assert.equal(verifyNewsletterPreferenceAuthorization({
  action: 'resubscribe',
  email,
  unsubscribeSignature: legacyUnsubscribeSignature,
  secret: newsletterSecret,
  now: '2026-07-16T14:00:00.000Z',
}), false, 'an unsubscribe bearer token is suppression-only');

const confirmation = issueNewsletterResubscribeConfirmation({
  email,
  secret: newsletterSecret,
  now: '2026-07-16T14:00:00.000Z',
});
assert.equal(verifyNewsletterPreferenceAuthorization({
  action: 'resubscribe',
  email,
  unsubscribeSignature: legacyUnsubscribeSignature,
  confirmation,
  secret: newsletterSecret,
  now: '2026-07-16T14:05:00.000Z',
}), true, 'resubscribe accepts a fresh action-bound confirmation');
assert.equal(verifyNewsletterPreferenceAuthorization({
  action: 'resubscribe',
  email,
  confirmation,
  secret: newsletterSecret,
  now: '2026-07-16T14:11:00.000Z',
}), false, 'resubscribe confirmation expires quickly');
assert.equal(verifyNewsletterPreferenceAuthorization({
  action: 'unsubscribe',
  email,
  unsubscribeSignature: '',
  confirmation,
  secret: newsletterSecret,
  now: '2026-07-16T14:05:00.000Z',
}), false, 'a resubscribe confirmation cannot authorize unsubscribe');

console.log('Notification preference migration tests passed.');
