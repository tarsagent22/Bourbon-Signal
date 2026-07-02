import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ManualAlertRow = {
  email: string;
  channels: string;
  state: string;
  bottle: string;
  rarityTier?: string;
  priority?: string;
  alertType: string;
  location: string;
  quantity?: number | string;
  eventType: string;
  freshnessHours?: number | string;
  source?: string;
};

type ClerkUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{ id: string; email_address: string }>;
  public_metadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(value: unknown) {
  const digits = asString(value).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return asString(value).trim();
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local?.slice(0, 3) || "***"}***@${domain || "hidden"}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "configured phone";
}

function primaryEmail(user: ClerkUser) {
  const primary = user.email_addresses?.find((email) => email.id === user.primary_email_address_id) || user.email_addresses?.[0];
  return primary?.email_address || "";
}

function dedupeKey(row: ManualAlertRow) {
  return ["manual", row.state, row.bottle, row.eventType, row.location, row.quantity || 0]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function smsBody(row: ManualAlertRow) {
  const qty = asNumber(row.quantity);
  const detail = row.alertType === "board shipment/watch"
    ? `${qty || "New"} bottle${qty === 1 ? "" : "s"} in board shipment/watch data. Board-level signal; verify before driving.`
    : `${qty || "Some"} bottle${qty === 1 ? "" : "s"} reported. Verify before driving.`;
  return `Bourbon Signal alert: ${row.bottle} at ${row.location}, ${row.state}. ${detail} Reply STOP to unsubscribe.`.slice(0, 320);
}

function emailHtml(row: ManualAlertRow) {
  const qty = asNumber(row.quantity);
  const caveat = row.alertType === "board shipment/watch"
    ? "This is board-level shipment intelligence, not a guaranteed shelf count. Verify before driving."
    : "This is source-backed store-level inventory. Verify before driving.";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#120d08;color:#f8efe1;padding:24px"><div style="max-width:620px;margin:auto;background:#1d140c;border:1px solid #6d4b24;border-radius:16px;padding:24px"><p style="color:#d8a94f;text-transform:uppercase;letter-spacing:.12em;font-size:12px">Bourbon Signal alert</p><h1 style="margin:0 0 12px;color:#fff">${row.bottle}</h1><p style="font-size:18px;color:#f8efe1"><strong>${row.location}</strong>, ${row.state}</p><p style="color:#d9c7a7">${qty ? `${qty} bottle${qty === 1 ? "" : "s"} reported.` : "Fresh signal reported."}</p><p style="color:#d9c7a7">${caveat}</p><p style="color:#9f8a6b;font-size:13px">Source: ${row.source || "Bourbon Signal engine"}</p><p><a href="https://bourbonsignal.com/dashboard" style="display:inline-block;background:#d8a94f;color:#120d08;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Open dashboard</a></p></div></body></html>`;
}

async function clerkFetch(path: string, init: RequestInit = {}) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY missing");
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Clerk ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  return payload;
}

async function findUserByEmail(email: string): Promise<ClerkUser | null> {
  const payload = await clerkFetch(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
  const data = Array.isArray(payload) ? payload : payload?.data || [];
  return data[0] || null;
}

async function sendEmail(to: string, row: ManualAlertRow) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Bourbon Signal <alerts@alerts.bourbonsignal.com>",
      to: [to],
      reply_to: "support@bourbonsignal.com",
      subject: `Bourbon Signal: ${row.bottle} at ${row.location}`,
      html: emailHtml(row),
      headers: { "X-Entity-Ref-ID": `manual-alert-${dedupeKey(row)}`.slice(0, 190) },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(`Resend ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  return payload.id || payload.data?.id || null;
}

async function sendSms(to: string, row: ManualAlertRow) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  const from = process.env.TWILIO_FROM_NUMBER || "";
  if (!accountSid || !authToken) throw new Error("Twilio credentials missing");
  if (!serviceSid && !from) throw new Error("Twilio sender missing");
  const params = new URLSearchParams({ To: to, Body: smsBody(row) });
  if (serviceSid) params.set("MessagingServiceSid", serviceSid);
  else params.set("From", from);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  return { sid: payload.sid || null, status: payload.status || null };
}

async function updateMetadata(user: ClerkUser, row: ManualAlertRow, sent: { emailId?: string | null; sms?: { sid: string | null; status: string | null } | null; onsite?: boolean }) {
  const now = new Date().toISOString();
  const key = dedupeKey(row);
  const privateMetadata = user.private_metadata || {};
  const alertInbox = (privateMetadata.alertInbox && typeof privateMetadata.alertInbox === "object" ? privateMetadata.alertInbox : {}) as Record<string, unknown>;
  const alertDelivery = (privateMetadata.alertDelivery && typeof privateMetadata.alertDelivery === "object" ? privateMetadata.alertDelivery : {}) as Record<string, unknown>;
  const recentInbox = Array.isArray(alertInbox.recent) ? alertInbox.recent : [];
  const recentDelivery = Array.isArray(alertDelivery.recent) ? alertDelivery.recent : [];
  const nextInbox = sent.onsite ? [{
    id: Buffer.from(`${user.id}:${key}:${now}`).toString("base64url"),
    userId: user.id,
    dedupeKey: key,
    bottleName: row.bottle,
    state: row.state,
    storeLabel: row.location,
    matchedArea: row.location,
    eventType: row.eventType,
    rarityTier: row.rarityTier || null,
    quantity: asNumber(row.quantity) || null,
    score: row.priority === "major" ? 100 : 80,
    priorityClass: row.priority === "standard" ? "standard" : "major",
    createdAt: now,
    readAt: null,
    archivedAt: null,
    emailDeliveredAt: sent.emailId ? now : null,
    emailModeAtSend: sent.emailId ? "major_only" : null,
  }, ...recentInbox].slice(0, 50) : recentInbox;
  const newRecords = [] as Array<Record<string, unknown>>;
  if (sent.emailId) newRecords.push({ dedupeKey: key, deliveredAt: now, channel: "email", emailMode: "major_only", messageId: sent.emailId });
  if (sent.sms) newRecords.push({ dedupeKey: key, deliveredAt: now, channel: "sms", smsMode: "major_only", messageId: sent.sms.sid, status: sent.sms.status });
  const nextDelivery = [...newRecords, ...recentDelivery].slice(0, 100);
  await clerkFetch(`/users/${user.id}/metadata`, {
    method: "PATCH",
    body: JSON.stringify({
      private_metadata: {
        ...privateMetadata,
        alertInbox: { ...alertInbox, recent: nextInbox, lastSyncedAt: now },
        alertDelivery: { ...alertDelivery, recent: nextDelivery, lastRunAt: now },
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.MANUAL_ALERT_SECRET;
  const supplied = req.headers.get("x-manual-alert-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 10) as ManualAlertRow[] : [];
  const results = [];
  for (const row of rows) {
    const user = await findUserByEmail(row.email);
    if (!user) {
      results.push({ email: maskEmail(row.email), ok: false, error: "user_not_found" });
      continue;
    }
    const userEmail = primaryEmail(user);
    const publicMetadata = user.public_metadata || {};
    const sms = ((publicMetadata.notificationPreferences as Record<string, unknown> | undefined)?.sms || {}) as Record<string, unknown>;
    const channels = String(row.channels || "").split("+").map((c) => c.trim()).filter(Boolean);
    const result: Record<string, unknown> = { email: maskEmail(userEmail), bottle: row.bottle, location: row.location, channels };
    let emailId: string | null = null;
    let smsResult: { sid: string | null; status: string | null } | null = null;
    if (channels.includes("email")) {
      emailId = await sendEmail(userEmail, row);
      result.emailId = emailId;
    }
    if (channels.includes("sms")) {
      const phone = normalizePhone(sms.phone);
      if (!sms.enabled || !sms.verified || !phone) throw new Error(`SMS not enabled/verified for ${maskEmail(userEmail)}`);
      smsResult = await sendSms(phone, row);
      result.smsSid = smsResult.sid;
      result.smsStatus = smsResult.status;
      result.smsTo = maskPhone(phone);
    }
    await updateMetadata(user, row, { onsite: channels.includes("on-site"), emailId, sms: smsResult });
    result.onSite = channels.includes("on-site");
    result.ok = true;
    results.push(result);
  }
  return NextResponse.json({ ok: true, count: results.length, results });
}
