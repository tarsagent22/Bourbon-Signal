import { Resend } from "resend";
import type { AreaPreferences } from "@/app/api/user/preferences/route";
import type { DropEvent } from "@/lib/drops";

const resendApiKey = process.env.RESEND_API_KEY;

export const ALERT_FROM = "Bourbon Signal <alerts@bourbonsignal.com>";
export const ALERT_REPLY_TO = "support@bourbonsignal.com";
export const ALERT_DUPLICATE_WINDOW_HOURS = 24;

export interface AlertCandidate {
  drop: DropEvent;
  matchedState: string;
  matchedArea: string;
  bottleName: string;
  storeLabel: string;
  dedupeKey: string;
}

export interface AlertRecipient {
  userId: string;
  email: string;
  firstName?: string | null;
  tier?: string | null;
  areaPreferences?: AreaPreferences | null;
}

export function getResendClient() {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  return new Resend(resendApiKey);
}

export function normalizeBottleName(drop: DropEvent) {
  return (drop.tracked_brand_name || drop.brand_name || "Unknown Bottle").trim();
}

export function normalizeStoreLabel(drop: DropEvent) {
  const storeName = drop.store_name?.trim();
  const city = drop.store_city?.trim();
  const board = drop.board_name?.trim();
  const address = drop.store_address?.trim();

  if (storeName && city) return `${storeName}, ${city}`;
  if (storeName) return storeName;
  if (city && board) return `${city}, ${board}`;
  if (city) return city;
  if (board) return board;
  if (address) return address;
  return "Tracked location";
}

export function buildAlertDedupeKey(recipientUserId: string, drop: DropEvent) {
  const bottle = normalizeBottleName(drop).toLowerCase();
  const store = (drop.store_id || drop.store_address || drop.store_name || drop.board_name || "unknown-store").toLowerCase();
  return `${recipientUserId}::${bottle}::${store}`;
}

export function matchDropToPreferences(drop: DropEvent, prefs?: AreaPreferences | null): { matched: boolean; matchedState?: string; matchedArea?: string } {
  if (!prefs) return { matched: false };

  const state = (drop.state || drop.state_code || "").toUpperCase();
  if (!state) return { matched: false };
  if (prefs.states.length > 0 && !prefs.states.includes(state)) {
    return { matched: false };
  }

  if (state === "NC") {
    const board = (drop.board_name || drop.store_county || "").trim();
    if (prefs.ncBoards.length === 0) return { matched: true, matchedState: state, matchedArea: board || "North Carolina" };
    const matchedBoard = prefs.ncBoards.find((candidate) => board.toLowerCase().includes(candidate.toLowerCase()));
    return matchedBoard
      ? { matched: true, matchedState: state, matchedArea: matchedBoard }
      : { matched: false };
  }

  if (state === "VA") {
    const city = (drop.store_city || "").trim();
    if (prefs.vaCities.length === 0) return { matched: true, matchedState: state, matchedArea: city || "Virginia" };
    const matchedCity = prefs.vaCities.find((candidate) => candidate.toLowerCase() === city.toLowerCase());
    return matchedCity
      ? { matched: true, matchedState: state, matchedArea: matchedCity }
      : { matched: false };
  }

  if (state === "PA") {
    const storeId = (drop.store_id || "").trim();
    const county = (drop.store_county || "").trim();

    if (prefs.paStores.length > 0) {
      const matchedStore = prefs.paStores.find((candidate) => candidate === storeId);
      return matchedStore
        ? { matched: true, matchedState: state, matchedArea: matchedStore }
        : { matched: false };
    }

    if (prefs.paCounties.length === 0) return { matched: true, matchedState: state, matchedArea: county || "Pennsylvania" };
    const matchedCounty = prefs.paCounties.find((candidate) => candidate.toLowerCase() === county.toLowerCase());
    return matchedCounty
      ? { matched: true, matchedState: state, matchedArea: matchedCounty }
      : { matched: false };
  }

  return { matched: true, matchedState: state, matchedArea: drop.store_city || drop.board_name || state };
}
