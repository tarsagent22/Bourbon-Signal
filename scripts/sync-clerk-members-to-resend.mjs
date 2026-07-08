import fs from 'fs';

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

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID || '5ae51e44-6c4d-4312-ae1b-f353dc723899';
const APPLY = process.argv.includes('--apply');

if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
if (!CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is required');
if (!AUDIENCE_ID) throw new Error('RESEND_DIGEST_AUDIENCE_ID is required');

function primaryEmail(user) {
  const emails = Array.isArray(user.email_addresses) ? user.email_addresses : [];
  const primary = emails.find((email) => email.id === user.primary_email_address_id) || emails[0];
  return String(primary?.email_address || '').trim().toLowerCase();
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} failed ${res.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  return payload;
}

async function getAllClerkEmails() {
  const emails = new Set();
  for (let offset = 0; ; offset += 100) {
    const users = await fetchJson(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!Array.isArray(users) || users.length === 0) break;
    for (const user of users) {
      const email = primaryEmail(user);
      if (email) emails.add(email);
    }
    if (users.length < 100) break;
  }
  return [...emails].sort();
}

async function createContact(email) {
  const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (res.ok) return { status: 'created', payload };
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (res.status === 409 || /already|exist/i.test(message)) return { status: 'exists', payload };
  throw new Error(`Resend contact create failed for ${email}: ${res.status} ${message}`);
}

const emails = await getAllClerkEmails();
const summary = { apply: APPLY, audienceId: AUDIENCE_ID, clerkEmails: emails.length, created: 0, existing: 0, errors: [] };

for (const email of emails) {
  if (!APPLY) continue;
  try {
    const result = await createContact(email);
    if (result.status === 'created') summary.created += 1;
    if (result.status === 'exists') summary.existing += 1;
  } catch (error) {
    summary.errors.push({ email, message: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify(summary, null, 2));
if (summary.errors.length) process.exit(1);
