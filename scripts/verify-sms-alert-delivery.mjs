import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const delivery = read('src/lib/alert-delivery.ts');
const prefs = read('src/lib/notification-preferences.ts');
const route = read('src/app/api/alerts/deliver/route.ts');

for (const phrase of [
  'ALERT_SMS_DELIVERY_ENABLED',
  'ALERT_SMS_ALLOWED_RECIPIENTS',
  'ALERT_DELIVERY_MAX_SMS_PER_RUN',
  'ALERT_DELIVERY_MAX_SMS_PER_USER',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'sendTwilioSms',
  'smsDeliveryEnabled',
  'smsWouldSend',
  'smsSent',
  'skippedSmsDeliveryDisabled',
  'skippedSmsRecipientNotAllowed',
]) {
  if (!delivery.includes(phrase)) fail(`alert-delivery.ts missing SMS rollout primitive: ${phrase}`);
}

if (!/MessagingServiceSid/.test(delivery)) {
  fail('Twilio sends should prefer MessagingServiceSid for A2P/campaign routing.');
}

if (!/Body/.test(delivery) || !/Reply STOP/.test(delivery)) {
  fail('SMS alert body should include conservative STOP-safe copy.');
}

if (!/smsBaselineDedupeKeys/.test(delivery) || !/lastSmsBaselineAt/.test(delivery)) {
  fail('SMS delivery must have its own baseline/dedupe metadata separate from email.');
}

if (!/notificationPrefs\.sms\.enabled/.test(delivery)) {
  fail('Delivery worker must respect user SMS notification preferences.');
}

if (!/notificationPrefs\.sms\.verified/.test(delivery)) {
  fail('Delivery worker must require verified SMS preference before sending.');
}

if (!/phone\?: string/.test(prefs) || !/verified: boolean/.test(prefs)) {
  fail('Notification preferences must persist SMS phone and verification status.');
}

if (!/baselineSms/.test(route) && !/baseline_sms/.test(route)) {
  fail('/api/alerts/deliver must expose a baselineSms option before broad SMS activation.');
}

console.log('SMS alert delivery guardrails verified.');
