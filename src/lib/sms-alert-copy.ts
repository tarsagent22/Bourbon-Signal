export type SmsAlertCopyInput = {
  bottleNames: string[];
  storeLabel: string;
  state?: string;
  quantityLabel?: string;
  timestampLabel?: string;
  sourceCaveat: string;
};

const TWO_SEGMENT_GSM_CHARACTER_BUDGET = 306;

function asciiSmsText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactBottleName(value: string) {
  return asciiSmsText(value)
    .replace(/\bSmall Batch Straight Bourbon(?: Whiskey)?\b/gi, "Sm Batch Bourbon")
    .replace(/\bStraight Bourbon(?: Whiskey)? Small Batch\b/gi, "Bourbon Sm Batch")
    .replace(/\bKentucky Straight Bourbon(?: Whiskey)?\b/gi, "KY Bourbon")
    .replace(/\bStraight Bourbon(?: Whiskey)?\b/gi, "Bourbon")
    .replace(/\bBarrel Proof\b/gi, "BP")
    .replace(/\bCask Strength\b/gi, "CS")
    .replace(/\bBottled[ -]in[ -]Bond\b/gi, "BiB")
    .replace(/\bLimited Edition\b/gi, "LE")
    .replace(/\bSingle Barrel\b/gi, "SiB")
    .replace(/\bSmall Batch\b/gi, "Sm Batch")
    .replace(/\s+/g, " ")
    .trim();
}

function compactStoreLabel(value: string) {
  return asciiSmsText(value)
    .replace(/\bCounty ABC\s*-\s*/gi, "ABC, ")
    .replace(/\bRoad\b/gi, "Rd")
    .replace(/\bStreet\b/gi, "St")
    .replace(/\bAvenue\b/gi, "Ave")
    .replace(/\bBoulevard\b/gi, "Blvd")
    .replace(/\bDrive\b/gi, "Dr")
    .replace(/\bHighway\b/gi, "Hwy")
    .replace(/\bNorth\b/gi, "N")
    .replace(/\bSouth\b/gi, "S")
    .replace(/\bEast\b/gi, "E")
    .replace(/\bWest\b/gi, "W")
    .replace(/\.(?=,|\s)/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactQuantity(value: string) {
  return asciiSmsText(value)
    .replace(/\s+reported$/i, "")
    .trim();
}

function compactTimestamp(value: string) {
  return asciiSmsText(value)
    .replace(/^within the last hour$/i, "<1 hr ago")
    .replace(/^about\s+([0-9.]+)\s+hours?\s+ago$/i, "~$1 hrs ago")
    .replace(/^([0-9.]+)\s+hours?\s+ago$/i, "$1 hrs ago")
    .replace(/^within\s+([0-9.]+)\s+hours?$/i, "<$1 hrs ago")
    .trim();
}

function buildSms(input: SmsAlertCopyInput, compact: boolean) {
  const bottleNames = input.bottleNames
    .map((name) => compact ? compactBottleName(name) : asciiSmsText(name))
    .filter(Boolean);
  const storeLabel = compact ? compactStoreLabel(input.storeLabel) : asciiSmsText(input.storeLabel);
  const state = asciiSmsText(input.state || "").toUpperCase();
  const stateSuffix = state && !new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(storeLabel)
    ? `, ${state}`
    : "";
  const quantity = compact ? compactQuantity(input.quantityLabel || "") : asciiSmsText(input.quantityLabel || "");
  const timestamp = compact ? compactTimestamp(input.timestampLabel || "") : asciiSmsText(input.timestampLabel || "");
  const detail = [quantity, timestamp].filter(Boolean).join(compact ? "; " : " ");
  const detailSentence = detail ? ` ${detail}.` : "";
  const caveat = asciiSmsText(input.sourceCaveat).replace(/\.*$/, ".");

  return `Bourbon Signal: ${bottleNames.join("; ")} @ ${storeLabel}${stateSuffix}.${detailSentence} ${caveat} Reply STOP to unsubscribe.`
    .replace(/\s+/g, " ")
    .trim();
}

export function formatSmsAlert(input: SmsAlertCopyInput) {
  const full = buildSms(input, false);
  if (full.length <= TWO_SEGMENT_GSM_CHARACTER_BUDGET) return full;
  return buildSms(input, true);
}
