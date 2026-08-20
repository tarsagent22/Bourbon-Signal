import { createHash, createHmac, randomBytes } from "node:crypto";
import { render } from "@react-email/render";
const loadedEmail = await import("../src/components/emails/MissingStateCommunityEmail.tsx");
const emailModule = { ...loadedEmail, ...((loadedEmail as { default?: object }).default || {}) } as typeof loadedEmail;
const { MissingStateCommunityEmail } = emailModule;
const loadedPolicy = await import("../src/lib/missing-state-community-email.ts");
const policyModule = { ...loadedPolicy, ...((loadedPolicy as { default?: object }).default || {}) } as typeof loadedPolicy;
const { MISSING_STATE_COMMUNITY_CAMPAIGN_ID, MISSING_STATE_COMMUNITY_SUBJECT, classifyMissingStateCommunityRecipient, safeMissingStateFirstName } = policyModule;
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
  campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID,
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
  return Boolean(result && typeof result === "object" && typeof result.unsubscribed === "boolean" && result.unsubscribed === false);
}
async function providerHistory() {
  const recentRecipients = new Set<string>();
  const trialEmailRecipients = new Set<string>();
  const cutoff = now.getTime() - 7 * 24 * 60 * 60_000;
  const trialSubjects = new Set([
    "try bourbon signal free for 7 days",
    "try bourbon signal free for 7 days + earn signal points",
  ]);
  let after = "";
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const payload = await api(`https://api.resend.com/emails?${query}`, {
      headers: { Authorization: `Bearer ${resendSecret}`, "User-Agent": "BourbonSignal/1.0" },
    });
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data) || typeof payload.has_more !== "boolean") {
      throw new Error("Provider history returned an unexpected response shape.");
    }
    const rows = payload.data;
    for (const row of rows) {
      const createdAt = Date.parse(String(row?.created_at || ""));
      if (!Number.isFinite(createdAt)) throw new Error("Provider history returned an invalid timestamp.");
      if (typeof row?.subject !== "string") throw new Error("Provider history returned an invalid subject.");
      const addresses = Array.isArray(row?.to) ? row.to : [row?.to];
      if (!addresses.length || addresses.some((address: unknown) => typeof address !== "string" || !address.trim())) {
        throw new Error("Provider history returned an invalid recipient.");
      }
      for (const address of addresses) {
        const recipient = address.trim().toLowerCase();
        if (createdAt >= cutoff) recentRecipients.add(recipient);
        if (trialSubjects.has(row.subject.trim().toLowerCase())) trialEmailRecipients.add(recipient);
      }
    }
    if (!payload.has_more) return { recentRecipients, trialEmailRecipients };
    if (!rows.length) throw new Error("Provider history pagination is incomplete.");
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
  return createHmac("sha256", signingSecret).update(`${MISSING_STATE_COMMUNITY_CAMPAIGN_ID}:${userId}`).digest("base64url").slice(0, 32);
}
function emailBinding(email: string) {
  return createHmac("sha256", signingSecret).update(`${MISSING_STATE_COMMUNITY_CAMPAIGN_ID}:mailbox:${email}`).digest("hex");
}
function unsubscribeUrl(email: string) {
  const sig = createHmac("sha256", signingSecret).update(email).digest("hex");
  return `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&sig=${sig}`;
}
function oneClickUnsubscribeUrl(email: string) {
  const sig = createHmac("sha256", signingSecret).update(email).digest("hex");
  return `${siteUrl}/api/newsletter/preferences?email=${encodeURIComponent(email)}&sig=${sig}`;
}
function clickUrl(userId: string, destination: "setup") {
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString();
  const token = createCampaignClickToken({ campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID, recipientId: recipientHash(userId), destination, expiresAt }, signingSecret);
  return `${siteUrl}/api/campaign/click?t=${encodeURIComponent(token)}`;
}
function deliveryMetadata(user: any) {
  const value = user?.private_metadata?.missingStateCommunityDelivery;
  return value && typeof value === "object" ? value : {};
}
async function updateDelivery(user: any, next: Record<string, unknown>) {
  return api(`https://api.clerk.com/v1/users/${encodeURIComponent(user.id)}/metadata`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json", "User-Agent": "BourbonSignal/1.0" },
    body: JSON.stringify({ private_metadata: { missingStateCommunityDelivery: { ...deliveryMetadata(user), ...next } } }),
  });
}
function plainText(input: { firstName: string | null; setupUrl: string; unsubscribeUrl: string }) {
  return `${input.firstName ? `Hey ${input.firstName},` : "Hey,"}\n\nI want Bourbon Signal to be useful where you actually shop. Tell us which state you hunt most often, then share any stores, cities, or areas you want us to prioritize.\n\nTell us where you hunt:\n${input.setupUrl}\n\nMember Sightings help nearby hunters when retailer inventory is incomplete, unpublished, or not confirmed. Eligible sightings earn 10–30 Signal Points based on rarity, plus badge and streak opportunities. You can use those points in our growing rewards catalog as new redemption options are added.\n\nThanks,\nChandler\nBourbon Signal\n\nBourbon Signal is intended for users 21+. We do not sell alcohol. Verify details when possible before making a purchase decision.\n\nUnsubscribe: ${input.unsubscribeUrl}\n`;
}

const [users, history] = await Promise.all([allUsers(), providerHistory()]);
const { recentRecipients, trialEmailRecipients } = history;
summary.enumerated = users.length;
if (VERIFY) {
  const events: Record<string, number> = {};
  let tracked = 0;
  for (const user of users) {
    const delivery = deliveryMetadata(user);
    if (delivery.campaignId !== MISSING_STATE_COMMUNITY_CAMPAIGN_ID || typeof delivery.providerMessageId !== "string") continue;
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
const candidates: Array<{ user: any; email: string; firstName: string | null }> = [];
for (const user of users) {
  const result = classifyMissingStateCommunityRecipient({
    id: user.id,
    publicMetadata: user.public_metadata,
    privateMetadata: user.private_metadata,
    unsafeMetadata: user.unsafe_metadata,
    banned: user.banned,
    locked: user.locked,
  });
  if (result.status !== "eligible") { skipped(result.status); continue; }
  if (priorLifecycleTooRecent(user)) { skipped("skipped_recent_lifecycle_email"); continue; }
  const email = emailFor(user);
  if (!email) { skipped("skipped_invalid_recipient"); continue; }
  if (excludedEmails.has(email) || permanentlyExcluded(email)) { skipped("skipped_owner_excluded"); continue; }
  if (trialEmailRecipients.has(email)) { skipped("skipped_trial_email_provider_history"); continue; }
  if (recentRecipients.has(email)) { skipped("skipped_recent_provider_email"); continue; }
  if (!(await activeProviderContact(email))) { skipped("skipped_provider_suppressed_or_missing"); continue; }
  candidates.push({ user, email, firstName: safeMissingStateFirstName(user.first_name) });
}
const durableClear = await durableTrialClearUserIds(candidates.map((candidate) => candidate.user.id));
const durableCandidates = candidates.filter((candidate) => {
  if (durableClear.has(candidate.user.id)) return true;
  skipped("skipped_durable_trial_or_paid_history");
  return false;
});
summary.eligible = durableCandidates.length;
const selected = durableCandidates
  .sort((a, b) => createHash("sha256").update(`${MISSING_STATE_COMMUNITY_CAMPAIGN_ID}:${a.user.id}`).digest("hex").localeCompare(createHash("sha256").update(`${MISSING_STATE_COMMUNITY_CAMPAIGN_ID}:${b.user.id}`).digest("hex")))
  .slice(0, requestedLimit);
summary.selected = selected.length;
const manifestHash = createHash("sha256").update(selected.map((row) => `${row.user.id}:${emailBinding(row.email)}`).join("\n")).digest("hex");
summary.manifestHash = manifestHash;
summary.candidateHandles = selected.map((row) => createHash("sha256").update(row.user.id).digest("hex").slice(0, 12));

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
if (manifestHash !== expectedManifestHash) throw new Error("Candidate manifest changed; run a fresh plan and review it before apply.");

for (const candidate of selected) {
  try {
    const fresh = await api(`https://api.clerk.com/v1/users/${encodeURIComponent(candidate.user.id)}`, { headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" } });
    const recheck = classifyMissingStateCommunityRecipient({ id: fresh.id, publicMetadata: fresh.public_metadata, privateMetadata: fresh.private_metadata, unsafeMetadata: fresh.unsafe_metadata, banned: fresh.banned, locked: fresh.locked });
    const freshEmail = emailFor(fresh);
    const durablePreSend = await durableTrialClearUserIds([fresh.id]);
    if (recheck.status !== "eligible" || !durablePreSend.has(fresh.id) || freshEmail !== candidate.email || excludedEmails.has(freshEmail) || permanentlyExcluded(freshEmail) || trialEmailRecipients.has(freshEmail) || recentRecipients.has(freshEmail) || priorLifecycleTooRecent(fresh) || !(await activeProviderContact(freshEmail))) {
      skipped("skipped_pre_send_recheck");
      continue;
    }
    const reservedAt = new Date().toISOString();
    await updateDelivery(fresh, { campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID, status: "reserved", reservedAt });
    const reservedUser = await api(`https://api.clerk.com/v1/users/${encodeURIComponent(candidate.user.id)}`, { headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" } });
    const reservation = deliveryMetadata(reservedUser);
    if (reservation.campaignId !== MISSING_STATE_COMMUNITY_CAMPAIGN_ID || reservation.status !== "reserved" || reservation.reservedAt !== reservedAt) {
      throw new Error("Durable delivery reservation was not confirmed.");
    }
    const reservedEmail = emailFor(reservedUser);
    const [finalDurableClear, finalHistory, finalProviderActive] = await Promise.all([
      durableTrialClearUserIds([reservedUser.id]),
      providerHistory(),
      activeProviderContact(reservedEmail),
    ]);
    const finalUser = await api(`https://api.clerk.com/v1/users/${encodeURIComponent(reservedUser.id)}`, { headers: { Authorization: `Bearer ${clerkSecret}`, "User-Agent": "BourbonSignal/1.0" } });
    const finalReservation = deliveryMetadata(finalUser);
    const finalPrivateMetadata = { ...(finalUser.private_metadata || {}) };
    delete finalPrivateMetadata.missingStateCommunityDelivery;
    const finalEligibility = classifyMissingStateCommunityRecipient({
      id: finalUser.id,
      publicMetadata: finalUser.public_metadata,
      privateMetadata: finalPrivateMetadata,
      unsafeMetadata: finalUser.unsafe_metadata,
      banned: finalUser.banned,
      locked: finalUser.locked,
    });
    const finalEmail = emailFor(finalUser);
    if (finalReservation.campaignId !== MISSING_STATE_COMMUNITY_CAMPAIGN_ID
      || finalReservation.status !== "reserved"
      || finalReservation.reservedAt !== reservedAt
      || finalEligibility.status !== "eligible"
      || finalEmail !== candidate.email
      || !finalDurableClear.has(finalUser.id)
      || !finalProviderActive
      || finalHistory.trialEmailRecipients.has(finalEmail)
      || finalHistory.recentRecipients.has(finalEmail)
      || excludedEmails.has(finalEmail)
      || permanentlyExcluded(finalEmail)
      || priorLifecycleTooRecent(finalUser)) {
      await updateDelivery(finalUser, { campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID, status: "cancelled", reservedAt, cancelledAt: new Date().toISOString(), cancelReason: "pre_send_recheck" });
      skipped("skipped_final_pre_send_recheck");
      continue;
    }
    const setupUrl = clickUrl(finalUser.id, "setup");
    const unsubscribe = unsubscribeUrl(finalEmail);
    const oneClickUnsubscribe = oneClickUnsubscribeUrl(finalEmail);
    const firstName = safeMissingStateFirstName(finalUser.first_name);
    const html = await render(MissingStateCommunityEmail({ firstName, setupUrl, unsubscribeUrl: unsubscribe }));
    const idempotencyKey = `${MISSING_STATE_COMMUNITY_CAMPAIGN_ID}-${createHash("sha256").update(finalUser.id).digest("hex").slice(0, 24)}`;
    const provider = await api("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendSecret}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, "User-Agent": "BourbonSignal/1.0" },
      body: JSON.stringify({
        from: "Chandler from Bourbon Signal <chandler@bourbonsignal.com>",
        to: [finalEmail],
        reply_to: "chandler@bourbonsignal.com",
        subject: MISSING_STATE_COMMUNITY_SUBJECT,
        html,
        text: plainText({ firstName, setupUrl, unsubscribeUrl: unsubscribe }),
        headers: { "List-Unsubscribe": `<${oneClickUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "campaign", value: MISSING_STATE_COMMUNITY_CAMPAIGN_ID }, { name: "segment", value: "missing-state-no-trial-email" }],
      }),
    });
    const deliveredAt = new Date().toISOString();
    await updateDelivery(finalUser, { campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID, status: "delivered", reservedAt, deliveredAt, providerMessageId: provider?.id || idempotencyKey, campaign_email_clicks: true });
    summary.sent = Number(summary.sent) + 1;
    summary.delivered = Number(summary.delivered) + 1;
  } catch {
    summary.errors = Number(summary.errors) + 1;
  }
}
console.log(JSON.stringify(summary, null, 2));
if (Number(summary.errors) > 0) process.exit(1);

