import { createHash, createHmac, randomBytes } from "node:crypto";
import { render } from "@react-email/render";
const loadedEmail = await import("../src/components/emails/LowCoverageCommunityEmail.tsx");
const emailModule = { ...loadedEmail, ...((loadedEmail as { default?: object }).default || {}) } as typeof loadedEmail;
const { LowCoverageCommunityEmail } = emailModule;
const loadedPolicy = await import("../src/lib/low-coverage-community-email.ts");
const policyModule = { ...loadedPolicy, ...((loadedPolicy as { default?: object }).default || {}) } as typeof loadedPolicy;
const { LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, LOW_COVERAGE_COMMUNITY_SUBJECT, classifyLowCoverageCommunityRecipient, safeCommunityFirstName } = policyModule;
const loadedClicks = await import("../src/lib/campaign-click-tracking.ts");
const clickModule = { ...loadedClicks, ...((loadedClicks as { default?: object }).default || {}) } as typeof loadedClicks;
const { createCampaignClickToken } = clickModule;

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
if (APPLY && VERIFY) throw new Error("Choose plan, --apply, or --verify; modes are mutually exclusive.");
const value = (name: string) => process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const requestedLimit = Number(value("--limit") || "10");
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) throw new Error("--limit must be an integer from 1 to 20.");
const expectedManifestHash = value("--manifest-hash");
if (APPLY && !expectedManifestHash) throw new Error("--apply requires the exact --manifest-hash from a fresh plan.");

const clerkSecret = process.env.CLERK_SECRET_KEY?.trim() || "";
const resendSecret = process.env.RESEND_API_KEY?.trim() || "";
const audienceId = process.env.RESEND_DIGEST_AUDIENCE_ID?.trim() || "5ae51e44-6c4d-4312-ae1b-f353dc723899";
const signingSecret = (process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || resendSecret).trim();
const exclusionSource = process.env.LOW_COVERAGE_COMMUNITY_EXCLUDED_EMAILS?.trim() || "";
const PERMANENT_EXCLUDED_EMAIL_HASHES = new Set([
  "65aa7743dd52c4850305bbd6b6c4f8fef933aca1083dbcc6aee6592ef874420e",
]);
if (!clerkSecret || !resendSecret || !audienceId || signingSecret.length < 32) throw new Error("Campaign provider configuration is incomplete.");
if (APPLY && !exclusionSource) throw new Error("LOW_COVERAGE_COMMUNITY_EXCLUDED_EMAILS is required for apply mode.");
const excludedEmails = new Set(exclusionSource.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
const siteUrl = "https://www.bourbonsignal.com";
const now = new Date();
const summary: Record<string, unknown> = {
  mode: VERIFY ? "verify" : APPLY ? "apply" : "plan",
  campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID,
  limit: requestedLimit,
  enumerated: 0,
  eligible: 0,
  selected: 0,
  sent: 0,
  delivered: 0,
  errors: 0,
  skipped: {} as Record<string, number>,
};

function skipped(key: string) {
  const counts = summary.skipped as Record<string, number>;
  counts[key] = (counts[key] || 0) + 1;
}
function emailFor(user: any) {
  const rows = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
  const primary = rows.find((row: any) => row.id === user.primary_email_address_id);
  if (!primary || primary.verification?.status !== "verified") return "";
  return String(primary.email_address || "").trim().toLowerCase();
}
function permanentlyExcluded(email: string) {
  return PERMANENT_EXCLUDED_EMAIL_HASHES.has(createHash("sha256").update(email).digest("hex"));
}
async function api(url: string, options: RequestInit = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, options);
    const body = await response.text();
    let payload: any = null;
    try { payload = body ? JSON.parse(body) : null; } catch { payload = body; }
    if (response.ok) return payload;
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${options.method || "GET"} ${new URL(url).pathname} failed ${response.status}`);
  }
  throw new Error("Provider request exhausted retries.");
}
async function allUsers() {
  const users: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api(`https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=-created_at`, {
      headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" },
    });
    if (!Array.isArray(page) || !page.length) break;
    users.push(...page);
    if (page.length < 100) break;
  }
  return users;
}
async function coverageRows() {
  const payload = await api(`${siteUrl}/api/coverage`);
  if (!Array.isArray(payload?.states)) throw new Error("Production coverage contract is unavailable.");
  return payload.states.map((row: any) => ({ code: String(row.code), name: String(row.name), coverageStrength: String(row.coverageStrength) }));
}
async function durableTrialClearUserIds(userIds: string[]) {
  const clear = new Set<string>();
  for (let offset = 0; offset < userIds.length; offset += 20) {
    const batch = userIds.slice(offset, offset + 20);
    const rawBody = JSON.stringify({ userIds: batch, nonce: randomBytes(16).toString("hex") });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", clerkSecret).update(`${timestamp}.${rawBody}`).digest("hex");
    const payload = await api(`${siteUrl}/api/ops/low-coverage-community-preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "BourbonSignal/1.0", "x-low-coverage-timestamp": timestamp, "x-low-coverage-signature": signature },
      body: rawBody,
    });
    const batchClear = Array.isArray(payload?.clearUserIds) ? payload.clearUserIds.filter((value: unknown): value is string => typeof value === "string") : [];
    if (batchClear.some((userId: string) => !batch.includes(userId))) throw new Error("Durable eligibility returned an unexpected user.");
    for (const userId of batchClear) clear.add(userId);
  }
  return clear;
}
async function activeProviderContact(email: string) {
  const result = await api(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts/${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${resendSecret}`, "User-Agent": "BourbonSignal/1.0" },
  }).catch(() => null);
  return Boolean(result && result.unsubscribed !== true);
}
async function recentProviderRecipients() {
  const recipients = new Set<string>();
  const cutoff = now.getTime() - 7 * 24 * 60 * 60_000;
  let after = "";
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const payload = await api(`https://api.resend.com/emails?${query}`, {
      headers: { Authorization: `Bearer ${resendSecret}`, "User-Agent": "BourbonSignal/1.0" },
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    let reachedCutoff = false;
    for (const row of rows) {
      const createdAt = Date.parse(String(row?.created_at || ""));
      if (!Number.isFinite(createdAt)) throw new Error("Provider history returned an invalid timestamp.");
      if (createdAt < cutoff) { reachedCutoff = true; continue; }
      const addresses = Array.isArray(row?.to) ? row.to : [row?.to];
      for (const address of addresses) {
        const recipient = String(address || "").trim().toLowerCase();
        if (recipient) recipients.add(recipient);
      }
    }
    if (reachedCutoff || !payload?.has_more || !rows.length) return recipients;
    after = String(rows.at(-1)?.id || "");
    if (!after) throw new Error("Provider history pagination is incomplete.");
  }
  throw new Error("Provider history exceeded the safe pagination bound.");
}
function priorLifecycleTooRecent(user: any) {
  const delivery = user?.private_metadata?.freeMemberDayTwoDelivery;
  const deliveredAt = typeof delivery?.deliveredAt === "string" ? Date.parse(delivery.deliveredAt) : Number.NaN;
  return Number.isFinite(deliveredAt) && now.getTime() - deliveredAt < 7 * 24 * 60 * 60_000;
}
function recipientHash(userId: string) {
  return createHmac("sha256", signingSecret).update(`${LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID}:${userId}`).digest("base64url").slice(0, 32);
}
function emailBinding(email: string) {
  return createHmac("sha256", signingSecret).update(`${LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID}:mailbox:${email}`).digest("hex");
}
function unsubscribeUrl(email: string) {
  const sig = createHmac("sha256", signingSecret).update(email).digest("hex");
  return `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&sig=${sig}`;
}
function oneClickUnsubscribeUrl(email: string) {
  const sig = createHmac("sha256", signingSecret).update(email).digest("hex");
  return `${siteUrl}/api/newsletter/preferences?email=${encodeURIComponent(email)}&sig=${sig}`;
}
function clickUrl(userId: string, destination: "coverage" | "sightings") {
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString();
  const token = createCampaignClickToken({ campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, recipientId: recipientHash(userId), destination, expiresAt }, signingSecret);
  return `${siteUrl}/api/campaign/click?t=${encodeURIComponent(token)}`;
}
function deliveryMetadata(user: any) {
  const value = user?.private_metadata?.lowCoverageCommunityDelivery;
  return value && typeof value === "object" ? value : {};
}
async function updateDelivery(user: any, next: Record<string, unknown>) {
  return api(`https://api.clerk.com/v1/users/${encodeURIComponent(user.id)}/metadata`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json", "User-Agent": "BourbonSignal/1.0" },
    body: JSON.stringify({ private_metadata: { lowCoverageCommunityDelivery: { ...deliveryMetadata(user), ...next } } }),
  });
}
function plainText(input: { firstName: string | null; stateName: string; coverageUrl: string; sightingsUrl: string; unsubscribeUrl: string }) {
  return `${input.firstName ? `Hey ${input.firstName},` : "Hey,"}\n\nBourbon Signal coverage in ${input.stateName} is still growing, and I'd like your input on where we should focus next.\n\nIf there's a store, city, or area you want us to monitor, tell me here:\n${input.coverageUrl}\n\nYou can also help other local hunters by posting a Member Sighting when you see a hard-to-get bottle. Sightings help when retailer inventory is incomplete, unpublished, or not confirmed.\n${input.sightingsUrl}\n\nThanks,\nChandler\nBourbon Signal\n\nBourbon Signal is intended for users 21+. We do not sell alcohol. Verify details when possible before making a purchase decision.\n\nUnsubscribe: ${input.unsubscribeUrl}\n`;
}

const [users, coverage, recentRecipients] = await Promise.all([allUsers(), coverageRows(), recentProviderRecipients()]);
summary.enumerated = users.length;
if (VERIFY) {
  const events: Record<string, number> = {};
  let tracked = 0;
  for (const user of users) {
    const delivery = deliveryMetadata(user);
    if (delivery.campaignId !== LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID || typeof delivery.providerMessageId !== "string") continue;
    tracked += 1;
    try {
      const message = await api(`https://api.resend.com/emails/${encodeURIComponent(delivery.providerMessageId)}`, {
        headers: { Authorization: `Bearer ${resendSecret}`, "User-Agent": "BourbonSignal/1.0" },
      });
      const event = String(message?.last_event || delivery.status || "unknown");
      events[event] = (events[event] || 0) + 1;
    } catch {
      events.verification_failed = (events.verification_failed || 0) + 1;
    }
  }
  summary.selected = tracked;
  summary.events = events;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(events.verification_failed ? 1 : 0);
}
const candidates: Array<{ user: any; email: string; stateCode: string; stateName: string; firstName: string | null }> = [];
for (const user of users) {
  const result = classifyLowCoverageCommunityRecipient({
    id: user.id,
    publicMetadata: user.public_metadata,
    privateMetadata: user.private_metadata,
    unsafeMetadata: user.unsafe_metadata,
    banned: user.banned,
    locked: user.locked,
  }, coverage);
  if (result.status !== "eligible") { skipped(result.status); continue; }
  if (priorLifecycleTooRecent(user)) { skipped("skipped_recent_lifecycle_email"); continue; }
  const email = emailFor(user);
  if (!email) { skipped("skipped_invalid_recipient"); continue; }
  if (excludedEmails.has(email) || permanentlyExcluded(email)) { skipped("skipped_owner_excluded"); continue; }
  if (recentRecipients.has(email)) { skipped("skipped_recent_provider_email"); continue; }
  if (!(await activeProviderContact(email))) { skipped("skipped_provider_suppressed_or_missing"); continue; }
  candidates.push({ user, email, stateCode: result.stateCode, stateName: result.stateName, firstName: safeCommunityFirstName(user.first_name) });
}
const durableClear = await durableTrialClearUserIds(candidates.map((candidate) => candidate.user.id));
const durableCandidates = candidates.filter((candidate) => {
  if (durableClear.has(candidate.user.id)) return true;
  skipped("skipped_durable_trial_or_paid_history");
  return false;
});
summary.eligible = durableCandidates.length;
const selected = durableCandidates
  .sort((a, b) => createHash("sha256").update(`${LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID}:${a.user.id}`).digest("hex").localeCompare(createHash("sha256").update(`${LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID}:${b.user.id}`).digest("hex")))
  .slice(0, requestedLimit);
summary.selected = selected.length;
const manifestHash = createHash("sha256").update(selected.map((row) => `${row.user.id}:${row.stateCode}:${emailBinding(row.email)}`).join("\n")).digest("hex");
summary.manifestHash = manifestHash;
summary.states = selected.reduce((counts: Record<string, number>, row) => ({ ...counts, [row.stateCode]: (counts[row.stateCode] || 0) + 1 }), {});
summary.candidateHandles = selected.map((row) => createHash("sha256").update(row.user.id).digest("hex").slice(0, 12));

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
if (manifestHash !== expectedManifestHash) throw new Error("Candidate manifest changed; run a fresh plan and review it before apply.");

for (const candidate of selected) {
  try {
    const fresh = await api(`https://api.clerk.com/v1/users/${encodeURIComponent(candidate.user.id)}`, { headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" } });
    const recheck = classifyLowCoverageCommunityRecipient({ id: fresh.id, publicMetadata: fresh.public_metadata, privateMetadata: fresh.private_metadata, unsafeMetadata: fresh.unsafe_metadata, banned: fresh.banned, locked: fresh.locked }, coverage);
    const freshEmail = emailFor(fresh);
    const durablePreSend = await durableTrialClearUserIds([fresh.id]);
    if (recheck.status !== "eligible" || recheck.stateCode !== candidate.stateCode || recheck.stateName !== candidate.stateName || !durablePreSend.has(fresh.id) || freshEmail !== candidate.email || excludedEmails.has(freshEmail) || permanentlyExcluded(freshEmail) || recentRecipients.has(freshEmail) || priorLifecycleTooRecent(fresh) || !(await activeProviderContact(freshEmail))) {
      skipped("skipped_pre_send_recheck");
      continue;
    }
    const reservedAt = new Date().toISOString();
    await updateDelivery(fresh, { campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, status: "reserved", reservedAt, stateCode: candidate.stateCode });
    const reservedUser = await api(`https://api.clerk.com/v1/users/${encodeURIComponent(candidate.user.id)}`, { headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" } });
    const reservation = deliveryMetadata(reservedUser);
    if (reservation.campaignId !== LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID || reservation.status !== "reserved" || reservation.reservedAt !== reservedAt) {
      throw new Error("Durable delivery reservation was not confirmed.");
    }
    const coverageUrl = clickUrl(fresh.id, "coverage");
    const sightingsUrl = clickUrl(fresh.id, "sightings");
    const unsubscribe = unsubscribeUrl(freshEmail);
    const oneClickUnsubscribe = oneClickUnsubscribeUrl(freshEmail);
    const firstName = safeCommunityFirstName(fresh.first_name);
    const html = await render(LowCoverageCommunityEmail({ firstName, stateCode: candidate.stateCode, stateName: candidate.stateName, coverageUrl, sightingsUrl, unsubscribeUrl: unsubscribe }));
    const idempotencyKey = `${LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID}-${createHash("sha256").update(fresh.id).digest("hex").slice(0, 24)}`;
    const provider = await api("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendSecret}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, "User-Agent": "BourbonSignal/1.0" },
      body: JSON.stringify({
        from: "Chandler from Bourbon Signal <chandler@bourbonsignal.com>",
        to: [freshEmail],
        reply_to: "chandler@bourbonsignal.com",
        subject: LOW_COVERAGE_COMMUNITY_SUBJECT(candidate.stateName),
        html,
        text: plainText({ firstName, stateName: candidate.stateName, coverageUrl, sightingsUrl, unsubscribeUrl: unsubscribe }),
        headers: { "List-Unsubscribe": `<${oneClickUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "campaign", value: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID }, { name: "segment", value: "verified-low-coverage" }],
      }),
    });
    const deliveredAt = new Date().toISOString();
    await updateDelivery(reservedUser, { campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, status: "delivered", reservedAt, deliveredAt, providerMessageId: provider?.id || idempotencyKey, stateCode: candidate.stateCode, campaign_email_clicks: true });
    summary.sent = Number(summary.sent) + 1;
    summary.delivered = Number(summary.delivered) + 1;
  } catch {
    summary.errors = Number(summary.errors) + 1;
  }
}
console.log(JSON.stringify(summary, null, 2));
if (Number(summary.errors) > 0) process.exit(1);
