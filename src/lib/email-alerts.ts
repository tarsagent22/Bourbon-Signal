import { Resend } from "resend";
import type { AreaPreferences } from "@/app/api/user/preferences/route";
import type { DropEvent } from "@/lib/drops";
import { locationMatchesAny, normalizeStateCodeParam } from "@/lib/location-normalization";
import { californiaAreaMatchesFields } from "@/lib/california-area";
import { nevadaAreaMatchesFields } from "@/lib/nevada-area";
import { newYorkAreaMatchesFields } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields } from "@/lib/colorado-area";
import {
  CHARLOTTE_METRO_BOARD_GROUP,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
} from "@/lib/demand-metro-areas";
import { matchedNcAbcBoardPreference } from "@/lib/nc-abc-boards";

const resendApiKey = process.env.RESEND_API_KEY;

export const ALERT_FROM = "Bourbon Signal Alerts <alerts@bourbonsignal.com>";
export const ALERT_REPLY_TO = "chandler@bourbonsignal.com";
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

  const state = normalizeStateCodeParam(drop.state || drop.state_code) || "";
  if (!state) return { matched: false };
  if (prefs.states.length > 0 && !prefs.states.includes(state)) {
    return { matched: false };
  }

  if (state === "NC") {
    const board = (drop.locationName || drop.display_location || drop.board_name || drop.store_county || "").trim();
    if (prefs.ncBoards.length === 0) return { matched: true, matchedState: state, matchedArea: board || "North Carolina" };
    const fields = [
      drop.locationName,
      drop.display_location,
      drop.store_name,
      drop.store_address,
      drop.store_city,
      drop.store_county,
      drop.board_name,
    ];
    if (demandMetroBoardGroupMatchesFields(fields, prefs.ncBoards)) {
      return { matched: true, matchedState: state, matchedArea: CHARLOTTE_METRO_BOARD_GROUP };
    }
    const matchedBoard = matchedNcAbcBoardPreference(
      fields,
      prefs.ncBoards.filter((candidate) => candidate !== CHARLOTTE_METRO_BOARD_GROUP),
    );
    return matchedBoard
      ? { matched: true, matchedState: state, matchedArea: matchedBoard }
      : { matched: false };
  }

  if (state === "GA" || state === "TN") {
    const areas = state === "GA" ? prefs.gaAreas : prefs.tnAreas;
    const label = state === "GA" ? "Atlanta Metro" : "Nashville Metro";
    const fields = [drop.locationName, drop.display_location, drop.store_name, drop.store_address, drop.store_city, drop.store_county, drop.board_name];
    if (areas.length === 0) return { matched: true, matchedState: state, matchedArea: drop.store_city || label };
    return demandMetroAreaMatchesFields(state, fields, areas)
      ? { matched: true, matchedState: state, matchedArea: label }
      : { matched: false };
  }

  if (state === "CA") {
    const fields = [drop.locationName, drop.display_location, drop.store_name, drop.store_address, drop.store_city, drop.store_county, drop.board_name];
    if (prefs.caAreas.length === 0) return { matched: true, matchedState: state, matchedArea: drop.store_city || "California" };
    return californiaAreaMatchesFields(fields, prefs.caAreas)
      ? { matched: true, matchedState: state, matchedArea: "San Diego" }
      : { matched: false };
  }

  if (state === "NV") {
    const fields = [drop.locationName, drop.display_location, drop.store_name, drop.store_address, drop.store_city, drop.store_county, drop.board_name];
    if (prefs.nvAreas.length === 0) return { matched: true, matchedState: state, matchedArea: drop.store_city || "Nevada" };
    const matchedArea = prefs.nvAreas.find((area) => nevadaAreaMatchesFields(fields, [area]));
    return matchedArea ? { matched: true, matchedState: state, matchedArea } : { matched: false };
  }

  if (state === "NY") {
    const fields = [drop.locationName, drop.display_location, drop.store_name, drop.store_address, drop.store_city, drop.store_county, drop.board_name];
    return newYorkAreaMatchesFields(fields, prefs.nyAreas.length ? prefs.nyAreas : ["New York City"])
      ? { matched: true, matchedState: state, matchedArea: "New York City" }
      : { matched: false };
  }

  if (state === "CO") {
    const fields = [drop.locationName, drop.display_location, drop.store_name, drop.store_address, drop.store_city, drop.store_county, drop.board_name];
    return coloradoAreaMatchesFields(fields, prefs.coAreas.length ? prefs.coAreas : ["Denver Metro"])
      ? { matched: true, matchedState: state, matchedArea: "Denver Metro" }
      : { matched: false };
  }

  if (state === "VA" || state === "OH" || state === "IA" || state === "ID" || state === "SC") {
    const cityPrefs = state === "VA" ? prefs.vaCities : state === "OH" ? prefs.ohCities : state === "IA" ? prefs.iaCities : state === "ID" ? prefs.idCities : prefs.scAreas;
    const fallbackLabel = state === "VA" ? "Virginia" : state === "OH" ? "Ohio" : state === "IA" ? "Iowa" : state === "ID" ? "Idaho" : "South Carolina";
    const city = (drop.store_city || drop.store_county || drop.display_location || drop.board_name || "").trim();
    if (cityPrefs.length === 0) return { matched: true, matchedState: state, matchedArea: city || fallbackLabel };
    const matchedCity = cityPrefs.find((candidate) => locationMatchesAny([
      drop.locationName,
      drop.display_location,
      drop.store_name,
      drop.store_address,
      drop.store_city,
      drop.store_county,
      drop.board_name,
    ], [candidate]));
    return matchedCity
      ? { matched: true, matchedState: state, matchedArea: matchedCity }
      : { matched: false };
  }

  if (state === "PA") {
    const storeId = (drop.store_id || "").trim();
    const county = (drop.store_county || "").trim();
    const city = (drop.store_city || "").trim();

    if (prefs.paStores.length > 0) {
      const matchedStore = prefs.paStores.find((candidate) => candidate === storeId);
      return matchedStore
        ? { matched: true, matchedState: state, matchedArea: matchedStore }
        : { matched: false };
    }

    if (prefs.paCounties.length === 0) return { matched: true, matchedState: state, matchedArea: city || county || "Pennsylvania" };
    const matchedArea = prefs.paCounties.find((candidate) => locationMatchesAny([city, county, drop.display_location, drop.locationName], [candidate]));
    return matchedArea
      ? { matched: true, matchedState: state, matchedArea }
      : { matched: false };
  }

  return { matched: true, matchedState: state, matchedArea: drop.store_city || drop.board_name || state };
}
