import fs from 'fs';
import crypto from 'crypto';

function loadEnv(path) {
  if (!fs.existsSync(path)) return;
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!raw || raw.trim().startsWith('#') || !raw.includes('=')) continue;
    const [key, ...rest] = raw.split('=');
    let value = rest.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) process.env[key.trim()] = value;
  }
}

loadEnv('.env.production.local');

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : Infinity;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID || '5ae51e44-6c4d-4312-ae1b-f353dc723899';
const SUBJECT = 'Bourbon Signal • Weekly update';
const FROM = 'Chandler Todd <chandler@bourbonsignal.com>';
const REPLY_TO = 'chandler@bourbonsignal.com';
const SITE_URL = 'https://www.bourbonsignal.com';
const SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || '';
const TEMPLATE_PATH = 'emails/newsletters/outbox/2026-07-08-weekly-update-approved-preview.html';

if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
if (!AUDIENCE_ID) throw new Error('RESEND_DIGEST_AUDIENCE_ID is required');
if (!SECRET) throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET or RESEND_API_KEY is required');

function unsubscribeUrl(email) {
  const normalized = email.trim().toLowerCase();
  const sig = crypto.createHmac('sha256', SECRET).update(normalized).digest('hex');
  return `${SITE_URL}/unsubscribe?email=${encodeURIComponent(normalized)}&sig=${sig}`;
}

function textFromHtml(html, unsubscribe) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/h[12]>|<\/li>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + `\n\nUnsubscribe here: ${unsubscribe}\n`;
}

async function resendFetch(path, options = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${res.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  return payload;
}

async function audienceContacts() {
  const payload = await resendFetch(`/audiences/${AUDIENCE_ID}/contacts`);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .filter((contact) => contact?.email && contact.unsubscribed !== true)
    .map((contact) => String(contact.email).trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

async function sendOne(email, htmlTemplate) {
  const unsubscribe = unsubscribeUrl(email);
  const html = htmlTemplate.replaceAll('{{unsubscribeUrl}}', unsubscribe);
  return resendFetch('/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: email,
      reply_to: REPLY_TO,
      subject: SUBJECT,
      html,
      text: textFromHtml(html, unsubscribe),
      headers: {
        'List-Unsubscribe': `<${unsubscribe}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
}

const htmlTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
if (!htmlTemplate.includes('{{unsubscribeUrl}}')) throw new Error(`${TEMPLATE_PATH} must contain {{unsubscribeUrl}}`);
const contacts = (await audienceContacts()).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
const summary = { apply: APPLY, audienceId: AUDIENCE_ID, subject: SUBJECT, recipients: contacts.length, sent: 0, errors: [] };

if (!APPLY) {
  console.log(JSON.stringify({ ...summary, sample: contacts.slice(0, 5) }, null, 2));
} else {
  for (const email of contacts) {
    try {
      await sendOne(email, htmlTemplate);
      summary.sent += 1;
      if (summary.sent % 25 === 0) console.log(`sent ${summary.sent}/${contacts.length}`);
    } catch (error) {
      summary.errors.push({ email, message: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exit(1);
}
