import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

function argValue(prefix) {
  const arg = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return arg ? arg.slice(prefix.length + 1) : '';
}

function loadEnv(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return false;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!raw || raw.trim().startsWith('#') || !raw.includes('=')) continue;
    const [key, ...rest] = raw.split('=');
    let value = rest.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) process.env[key.trim()] = value;
  }
  return true;
}

const requestedEnv = argValue('--env');
const envCandidates = [requestedEnv, '.env.production.local', '.env.local'].filter(Boolean);
for (const candidate of envCandidates) {
  if (loadEnv(path.resolve(candidate))) break;
}

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const TEST_EMAIL = argValue('--test').trim().toLowerCase();
const LIMIT_VALUE = Number(argValue('--limit') || '0');
const LIMIT = Number.isFinite(LIMIT_VALUE) && LIMIT_VALUE > 0 ? LIMIT_VALUE : Infinity;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID || '5ae51e44-6c4d-4312-ae1b-f353dc723899';
const UNSUBSCRIBE_SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || '';
const SUBJECT = 'A quick note about your Bourbon Signal account';
const FROM = 'Chandler Todd <chandler@bourbonsignal.com>';
const REPLY_TO = 'chandler@bourbonsignal.com';
const SITE_URL = 'https://www.bourbonsignal.com';
const TEMPLATE_PATH = 'emails/newsletters/outbox/2026-07-15-free-member-conversion-preview.html';
const CAMPAIGN_ID = 'free-member-conversion-2026-07-15-v3';
const EXCLUDED_EMAILS = new Set(['chandler@bourbonsignal.com', 'chandlertodd22@gmail.com']);
const EXCLUDED_ROLES = new Set(['admin', 'retailer', 'vendor']);

if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
if (!TEST_EMAIL && !CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is required for audience segmentation');
if (!UNSUBSCRIBE_SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET or RESEND_API_KEY is required');

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function primaryEmail(user) {
  const emails = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
  const primary = emails.find((email) => email.id === user.primary_email_address_id) || emails[0];
  return normalizedEmail(primary?.email_address);
}

function mergedMetadata(user) {
  return {
    ...(user?.unsafe_metadata && typeof user.unsafe_metadata === 'object' ? user.unsafe_metadata : {}),
    ...(user?.private_metadata && typeof user.private_metadata === 'object' ? user.private_metadata : {}),
    ...(user?.public_metadata && typeof user.public_metadata === 'object' ? user.public_metadata : {}),
  };
}

function normalizeTier(value) {
  if (value === 'standard' || value === 'barrel') return value;
  if (value === 'bottled-in-bond' || value === 'founder' || value === 'lifetime') return 'bottled-in-bond';
  if (value === 'monthly' || value === 'annual') return 'standard';
  return 'free';
}

function isPaidMember(user) {
  const metadata = mergedMetadata(user);
  const tier = normalizeTier(metadata.tier ?? metadata.membershipTier);
  const status = String(metadata.membershipStatus || 'free');
  const plan = metadata.plan ?? metadata.billingPlan;
  if (tier === 'free') return false;
  if (status === 'active' || status === 'trialing' || status === 'lifetime') return true;
  return tier === 'bottled-in-bond'
    && (plan === 'bib_lifetime' || plan === 'founder')
    && !['canceled', 'unpaid', 'past_due', 'incomplete_expired'].includes(status);
}

function excludedAccount(user, email) {
  if (!email || EXCLUDED_EMAILS.has(email)) return true;
  const metadata = mergedMetadata(user);
  const roles = [metadata.role, metadata.accountType, metadata.userType]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return roles.some((role) => EXCLUDED_ROLES.has(role));
}

function unsubscribeUrl(email) {
  const normalized = normalizedEmail(email);
  const sig = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(normalized).digest('hex');
  return `${SITE_URL}/unsubscribe?email=${encodeURIComponent(normalized)}&sig=${sig}`;
}

function textFromHtml(html, unsubscribe) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/h[12]>|<\/li>|<\/tr>|<\/td>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + `\n\nUnsubscribe here: ${unsubscribe}\n`;
}

async function apiFetch(url, options = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, options);
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    if (response.ok) return payload;
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after') || '0');
      await new Promise((resolve) => setTimeout(resolve, Math.max(350, retryAfter * 1000)));
      continue;
    }
    const safeMessage = typeof payload === 'string' ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300);
    throw new Error(`${options.method || 'GET'} ${new URL(url).pathname} failed ${response.status}: ${safeMessage}`);
  }
  throw new Error(`${options.method || 'GET'} ${new URL(url).pathname} exhausted retries`);
}

async function allClerkUsers() {
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const batch = await apiFetch(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users;
}

async function activeAudienceEmails() {
  const emails = new Set();
  let after = '';
  for (;;) {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const payload = await apiFetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts?${query}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const data = Array.isArray(payload?.data) ? payload.data : [];
    for (const contact of data) {
      const email = normalizedEmail(contact?.email);
      if (email && contact?.unsubscribed !== true) emails.add(email);
    }
    if (!payload?.has_more || data.length === 0) break;
    after = String(data.at(-1)?.id || '');
    if (!after) break;
  }
  return emails;
}

async function founderSpotsRemaining() {
  try {
    const payload = await apiFetch(`${SITE_URL}/api/founder-spots`);
    return Number.isFinite(payload?.remaining) ? payload.remaining : 'Limited';
  } catch {
    return 'Limited';
  }
}

function renderedHtml(template, email, founderRemaining) {
  return template
    .replaceAll('{{unsubscribeUrl}}', unsubscribeUrl(email))
    .replaceAll('{{founderSpotsRemaining}}', String(founderRemaining));
}

async function sendOne(email, template, founderRemaining, mode) {
  const unsubscribe = unsubscribeUrl(email);
  const html = renderedHtml(template, email, founderRemaining);
  const hash = crypto.createHash('sha256').update(normalizedEmail(email)).digest('hex').slice(0, 24);
  return apiFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${CAMPAIGN_ID}-${mode}-${hash}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: email,
      reply_to: REPLY_TO,
      subject: TEST_EMAIL ? `[TEST] ${SUBJECT}` : SUBJECT,
      html,
      text: textFromHtml(html, unsubscribe),
      headers: {
        'List-Unsubscribe': `<${unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'campaign', value: CAMPAIGN_ID },
        { name: 'segment', value: TEST_EMAIL ? 'test' : 'free-members' },
      ],
    }),
  });
}

const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
for (const required of ['{{unsubscribeUrl}}', '{{founderSpotsRemaining}}']) {
  if (!template.includes(required)) throw new Error(`${TEMPLATE_PATH} is missing ${required}`);
}
const founderRemaining = await founderSpotsRemaining();

if (TEST_EMAIL) {
  const result = await sendOne(TEST_EMAIL, template, founderRemaining, 'test');
  console.log(JSON.stringify({ mode: 'test', subject: `[TEST] ${SUBJECT}`, sent: 1, providerMessageId: result?.id || null, founderSpotsRemaining: founderRemaining }, null, 2));
  process.exit(0);
}

const [users, activeAudience] = await Promise.all([allClerkUsers(), activeAudienceEmails()]);
const freeMembers = new Set();
let paidExcluded = 0;
let roleOrAdminExcluded = 0;
for (const user of users) {
  const email = primaryEmail(user);
  if (isPaidMember(user)) {
    paidExcluded += 1;
    continue;
  }
  if (excludedAccount(user, email)) {
    roleOrAdminExcluded += 1;
    continue;
  }
  freeMembers.add(email);
}
const recipients = [...freeMembers].filter((email) => activeAudience.has(email)).sort().slice(0, LIMIT);
const summary = {
  apply: APPLY,
  verify: VERIFY,
  campaign: CAMPAIGN_ID,
  subject: SUBJECT,
  clerkUsers: users.length,
  freeMemberCandidates: freeMembers.size,
  activeAudienceContacts: activeAudience.size,
  paidExcluded,
  roleOrAdminExcluded,
  recipients: recipients.length,
  founderSpotsRemaining: founderRemaining,
  sent: 0,
  failed: 0,
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const providerMessageIds = [];
for (let index = 0; index < recipients.length; index += 1) {
  try {
    const result = await sendOne(recipients[index], template, founderRemaining, 'full');
    if (result?.id) providerMessageIds.push(result.id);
    summary.sent += 1;
  } catch (error) {
    summary.failed += 1;
    console.error(`recipient ${index + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 125));
}

if (VERIFY && providerMessageIds.length > 0) {
  const events = {};
  let checkFailed = 0;
  for (const id of providerMessageIds) {
    try {
      const message = await apiFetch(`https://api.resend.com/emails/${id}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      const event = String(message?.last_event || 'unknown');
      events[event] = (events[event] || 0) + 1;
    } catch {
      checkFailed += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  summary.providerEvents = events;
  summary.providerChecksFailed = checkFailed;
}

console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0 || (VERIFY && summary.providerChecksFailed > 0)) process.exit(1);
