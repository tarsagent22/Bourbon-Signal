import { resolveEffectiveMembershipTier } from "./entitlements.ts";

export const FOUNDER_SHIPPING_STATUSES = ["submitted", "confirmed", "packed", "shipped"] as const;
export type FounderShippingStatus = typeof FOUNDER_SHIPPING_STATUSES[number];
export const FOUNDER_SHIPPING_CARRIERS = ["UPS", "USPS", "FedEx"] as const;
export type FounderShippingCarrier = typeof FOUNDER_SHIPPING_CARRIERS[number];

export interface FounderShippingAddress {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  phone: string;
  countryCode: "US";
}

export type FounderShippingSubmission = FounderShippingAddress;

export type FounderShippingValidation =
  | { ok: true; value: FounderShippingAddress }
  | { ok: false; error: string };

export type FounderFulfillmentValidation =
  | { ok: true; value: { status: FounderShippingStatus; carrier: FounderShippingCarrier | null; trackingNumber: string | null } }
  | { ok: false; error: string };

export const FOUNDER_SHIPPING_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const US_STATE_CODES = new Set<string>(FOUNDER_SHIPPING_STATE_CODES);

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function founderNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const record = metadata as Record<string, unknown>;
  return record[key];
}

export function memberShippingEligibility(metadata: unknown) {
  const tier = resolveEffectiveMembershipTier(metadata);
  const number = founderNumber(metadataValue(metadata, "founderNumber"))
    || founderNumber(metadataValue(metadata, "memberNumber"));
  const eligible = tier !== "free";
  return {
    eligible,
    founderNumber: eligible && tier === "bottled-in-bond" ? number : null,
  };
}

export function founderShippingEligibility(metadata: unknown) {
  const eligibility = memberShippingEligibility(metadata);
  return {
    eligible: eligibility.eligible && eligibility.founderNumber !== null,
    founderNumber: eligibility.founderNumber,
  };
}

export function normalizeFounderShippingSubmission(input: Record<string, unknown>): FounderShippingValidation {
  const recipientName = text(input.recipientName);
  const addressLine1 = text(input.addressLine1);
  const addressLine2 = text(input.addressLine2);
  const city = text(input.city);
  const stateCode = text(input.stateCode).toUpperCase();
  const postalCode = text(input.postalCode);
  const countryCode = text(input.countryCode).toUpperCase();
  const phoneText = text(input.phone);
  const phoneDigits = phoneText.replace(/\D/g, "");
  const domesticPhone = phoneDigits.length === 11 && phoneDigits.startsWith("1")
    ? phoneDigits.slice(1)
    : phoneDigits;

  if (recipientName.length > 120) return { ok: false, error: "Recipient name is too long." };
  if (addressLine1.length > 160 || addressLine2.length > 160) return { ok: false, error: "Shipping address is too long." };
  if (city.length > 100) return { ok: false, error: "City name is too long." };
  if (phoneText.length > 40) return { ok: false, error: "Phone number is too long." };
  if (recipientName.length < 2) return { ok: false, error: "Enter the recipient name." };
  if (addressLine1.length < 4) return { ok: false, error: "Enter a complete street address." };
  if (city.length < 2) return { ok: false, error: "Enter the city." };
  if (!US_STATE_CODES.has(stateCode)) return { ok: false, error: "Choose a valid U.S. state or the District of Columbia." };
  if (!/^\d{5}(?:-\d{4})?$/.test(postalCode)) return { ok: false, error: "Enter a valid U.S. ZIP code." };
  if (countryCode !== "US") return { ok: false, error: "Shipping is available in the United States only." };
  if (!/^\d{10}$/.test(domesticPhone)) return { ok: false, error: "Enter a valid U.S. phone number." };

  return {
    ok: true,
    value: {
      recipientName,
      addressLine1,
      addressLine2: addressLine2 || null,
      city,
      stateCode,
      postalCode,
      phone: `+1${domesticPhone}`,
      countryCode: "US",
    },
  };
}

export function normalizeFounderShippingStatus(value: unknown): FounderShippingStatus | null {
  return FOUNDER_SHIPPING_STATUSES.includes(value as FounderShippingStatus)
    ? value as FounderShippingStatus
    : null;
}

export function normalizeFounderFulfillment(input: Record<string, unknown>): FounderFulfillmentValidation {
  const status = normalizeFounderShippingStatus(input.status);
  if (!status) return { ok: false, error: "Choose a valid fulfillment status." };
  const carrierInput = text(input.carrier).toLowerCase();
  const carrier = carrierInput === "ups" ? "UPS"
    : carrierInput === "usps" ? "USPS"
      : carrierInput === "fedex" ? "FedEx"
        : null;
  const trackingNumber = text(input.trackingNumber).replace(/\s+/g, "");
  const hasShipmentDetails = Boolean(carrierInput || trackingNumber);
  if (hasShipmentDetails && !carrier) return { ok: false, error: "Choose UPS, USPS, or FedEx." };
  if (hasShipmentDetails && !trackingNumber) return { ok: false, error: "Enter the tracking number." };
  if (trackingNumber && !/^[A-Za-z0-9-]{5,160}$/.test(trackingNumber)) return { ok: false, error: "Enter a valid tracking number." };
  if (status === "shipped" && (!carrier || !trackingNumber)) {
    return { ok: false, error: "Carrier and tracking number are required before marking this shipment shipped." };
  }
  return { ok: true, value: { status, carrier, trackingNumber: trackingNumber || null } };
}

export function founderShippingTrackingUrl(carrier: unknown, trackingNumber: unknown) {
  const normalized = normalizeFounderFulfillment({ status: "shipped", carrier, trackingNumber });
  if (!normalized.ok || !normalized.value.carrier || !normalized.value.trackingNumber) return null;
  const number = encodeURIComponent(normalized.value.trackingNumber);
  if (normalized.value.carrier === "UPS") return `https://www.ups.com/track?loc=en_US&tracknum=${number}`;
  if (normalized.value.carrier === "USPS") return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
  return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
}
