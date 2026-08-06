"use client";

import { useEffect, useState } from "react";
import { FOUNDER_SHIPPING_STATE_CODES } from "@/lib/founder-shipping";
import styles from "./MemberShippingProfile.module.css";

type ShippingRecord = {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  phone: string;
  status: "submitted" | "confirmed" | "packed" | "shipped";
  trackingNumber: string | null;
};

type ShippingResponse = {
  record?: ShippingRecord | null;
  defaultRecipientName?: string;
  error?: string;
};

function displayPhone(phone: string | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : phone;
}

export default function MemberShippingProfile({ isFounder }: { isFounder: boolean }) {
  const [data, setData] = useState<ShippingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/member/shipping", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as ShippingResponse;
        if (!response.ok) throw new Error(payload.error || "Shipping information is unavailable.");
        return payload;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Shipping information is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/member/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({})) as ShippingResponse;
      if (!response.ok) throw new Error(result.error || "Shipping information could not be saved.");
      setData((current) => ({ ...(current || {}), ...result }));
      setMessage("Shipping information saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Shipping information could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const record = data?.record || null;
  const locked = record?.status === "packed" || record?.status === "shipped";

  return (
    <section id="shipping" className={styles.card} aria-labelledby="shipping-heading">
      <p className={styles.eyebrow}>Paid member profile</p>
      <h2 id="shipping-heading">Shipping information</h2>
      <p className={styles.lede}>
        Save the U.S. address and required phone number Bourbon Signal should use if we send you member items or gifts.
        {isFounder ? " We’ll use this for your founder’s glass." : ""}
      </p>

      {loading ? <p className={styles.loading} role="status">Loading shipping information…</p> : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {!loading && !error && locked ? (
        <div className={styles.shipped}>
          <strong>{record.status === "shipped" ? "Your current item has shipped." : "Your current item is being prepared for shipping."}</strong>
          {record.trackingNumber ? <p>Tracking: {record.trackingNumber}</p> : null}
          <p>The address is locked while fulfillment is underway.</p>
        </div>
      ) : null}

      {!loading && !error && !locked ? (
        <form className={styles.form} onSubmit={save}>
          <input type="hidden" name="countryCode" value="US" />
          <label className={styles.full}>
            <span>Recipient name</span>
            <input name="recipientName" autoComplete="name" maxLength={120} defaultValue={record?.recipientName || data?.defaultRecipientName || ""} required />
          </label>
          <label className={styles.full}>
            <span>Street address</span>
            <input name="addressLine1" autoComplete="address-line1" maxLength={160} defaultValue={record?.addressLine1 || ""} required />
          </label>
          <label className={styles.full}>
            <span>Apartment, suite, etc. <em>Optional</em></span>
            <input name="addressLine2" autoComplete="address-line2" maxLength={160} defaultValue={record?.addressLine2 || ""} />
          </label>
          <label className={styles.city}>
            <span>City</span>
            <input name="city" autoComplete="address-level2" maxLength={100} defaultValue={record?.city || ""} required />
          </label>
          <label>
            <span>State</span>
            <select name="stateCode" autoComplete="address-level1" defaultValue={record?.stateCode || ""} required>
              <option value="" disabled>Select</option>
              {FOUNDER_SHIPPING_STATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label>
            <span>ZIP code</span>
            <input name="postalCode" autoComplete="postal-code" inputMode="numeric" maxLength={10} defaultValue={record?.postalCode || ""} required />
          </label>
          <label className={styles.full}>
            <span>Phone number</span>
            <input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={displayPhone(record?.phone)} required />
            <small>Required for carrier or delivery questions.</small>
          </label>
          <div className={styles.country}><span>Country</span><strong>United States only</strong></div>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : record ? "Update shipping information" : "Save shipping information"}</button>
          <p className={styles.privacy}>Your address and phone are private, visible only in the owner fulfillment view, and used only when Bourbon Signal ships something to you.</p>
        </form>
      ) : null}
    </section>
  );
}
