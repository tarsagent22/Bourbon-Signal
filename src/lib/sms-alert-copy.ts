export type SmsAlertCopyInput = {
  bottleNames: string[];
  storeLabel: string;
  state?: string;
  locationScope?: "store" | "board";
  quantityLabel?: string;
  timestampLabel?: string;
  sourceCaveat: string;
};

export type SmsLocationEvidence = {
  locationPrecision?: unknown;
  actionabilityClass?: unknown;
  eventType?: unknown;
};

const TWO_SEGMENT_GSM_SEPTET_BUDGET = 306;
const GSM_BASIC_CHARACTERS = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""));
const GSM_EXTENSION_CHARACTERS = new Set("^{}\\[~]|€".split(""));

export function gsmSeptetLength(value: string) {
  let septets = 0;
  for (const character of value) {
    if (GSM_BASIC_CHARACTERS.has(character)) septets += 1;
    else if (GSM_EXTENSION_CHARACTERS.has(character)) septets += 2;
    else return Number.POSITIVE_INFINITY;
  }
  return septets;
}

function truncateGsmField(value: string, maxSeptets: number) {
  if (gsmSeptetLength(value) <= maxSeptets) return value;
  const suffix = "...";
  let result = "";
  for (const character of value) {
    if (gsmSeptetLength(`${result}${character}${suffix}`) > maxSeptets) break;
    result += character;
  }
  return `${result.trimEnd()}${suffix}`;
}

export function isExactStoreSmsLocation(input: SmsLocationEvidence) {
  const precision = String(input.locationPrecision || "").trim().toLowerCase();
  const actionability = String(input.actionabilityClass || "").trim().toLowerCase();
  const eventType = String(input.eventType || "").trim().toLowerCase();
  if (/aggregate|board|county|warehouse|statewide/.test(`${precision} ${actionability} ${eventType}`)) return false;
  if (precision) return precision === "store_level";
  return actionability === "store_inventory" || /store_inventory|store_allocation|store_delivery|in_stock/.test(eventType);
}

function gsmSafeSmsText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/[\\|]/g, "/")
    .replace(/[\^~]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactBottleName(value: string) {
  return gsmSafeSmsText(value)
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
  return gsmSafeSmsText(value)
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
  return gsmSafeSmsText(value)
    .replace(/\bbottles?\b/gi, (match) => match.toLowerCase() === "bottle" ? "btl" : "btls")
    .replace(/\s+reported$/i, "")
    .trim();
}

function compactTimestamp(value: string) {
  return gsmSafeSmsText(value)
    .replace(/^within the last hour$/i, "<1h")
    .replace(/^about\s+([0-9.]+)\s+hours?\s+ago$/i, "~$1 hrs ago")
    .replace(/^([0-9.]+)\s+hours?\s+ago$/i, "$1 hrs ago")
    .replace(/^within\s+([0-9.]+)\s+hours?$/i, "<$1 hrs ago")
    .trim();
}

function buildSms(input: SmsAlertCopyInput, compact: boolean, bottleLimit = input.bottleNames.length) {
  const allBottleNames = input.bottleNames
    .map((name) => compact ? compactBottleName(name) : gsmSafeSmsText(name))
    .filter(Boolean);
  const bottleNames = allBottleNames.slice(0, Math.max(1, bottleLimit));
  const overflow = Math.max(0, allBottleNames.length - bottleNames.length);
  const storeLabel = compact ? compactStoreLabel(input.storeLabel) : gsmSafeSmsText(input.storeLabel);
  const state = gsmSafeSmsText(input.state || "").toUpperCase();
  const stateSuffix = state && !new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(storeLabel) ? `, ${state}` : "";
  const quantity = input.locationScope === "board" ? "" : compactQuantity(input.quantityLabel || "");
  const timestamp = compactTimestamp(input.timestampLabel || "");
  const detail = [quantity, timestamp].filter(Boolean).join(" - ");
  const caveat = gsmSafeSmsText(input.sourceCaveat).replace(/\.*$/, ".");
  const headings = allBottleNames.length === 1
    ? ["Fresh match"]
    : [input.locationScope === "board" ? "Current area matches" : "Current store stock"];
  const lines = [
    "Bourbon Signal",
    ...headings,
    "",
    ...bottleNames,
    ...(overflow ? [`+${overflow} more matched bottles`] : []),
    `${storeLabel}${stateSuffix}`,
    ...(detail ? [detail] : []),
    "",
    caveat,
    "Reply STOP to opt out.",
  ];
  return lines.map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatSmsAlert(input: SmsAlertCopyInput) {
  const safeState = truncateGsmField(gsmSafeSmsText(input.state || ""), 16);
  const safeInput = { ...input, state: safeState };
  const full = buildSms(safeInput, false);
  if (gsmSeptetLength(full) <= TWO_SEGMENT_GSM_SEPTET_BUDGET) return full;

  const compact = buildSms(safeInput, true);
  if (gsmSeptetLength(compact) <= TWO_SEGMENT_GSM_SEPTET_BUDGET) return compact;

  for (let bottleLimit = Math.max(1, safeInput.bottleNames.length - 1); bottleLimit >= 1; bottleLimit -= 1) {
    const summarized = buildSms(safeInput, true, bottleLimit);
    if (gsmSeptetLength(summarized) <= TWO_SEGMENT_GSM_SEPTET_BUDGET) return summarized;
  }

  const boundedInput: SmsAlertCopyInput = {
    ...safeInput,
    bottleNames: [truncateGsmField(compactBottleName(safeInput.bottleNames[0] || "Bottle match"), 72)],
    storeLabel: truncateGsmField(compactStoreLabel(safeInput.storeLabel || (safeState ? `Selected area, ${safeState}` : "Selected area")), 64),
    quantityLabel: truncateGsmField(compactQuantity(safeInput.quantityLabel || ""), 24),
    timestampLabel: truncateGsmField(compactTimestamp(safeInput.timestampLabel || ""), 22),
    sourceCaveat: truncateGsmField(gsmSafeSmsText(safeInput.sourceCaveat), 48),
  };
  const bounded = buildSms(boundedInput, true, 1);
  if (gsmSeptetLength(bounded) <= TWO_SEGMENT_GSM_SEPTET_BUDGET) return bounded;

  const fallback = buildSms({
    bottleNames: ["Tracked bottle match"],
    storeLabel: safeState ? `Selected area, ${safeState}` : "Selected area",
    state: safeState,
    locationScope: safeInput.locationScope,
    timestampLabel: "Recent signal",
    sourceCaveat: "Check Bourbon Signal before driving.",
  }, true, 1);
  return gsmSeptetLength(fallback) <= TWO_SEGMENT_GSM_SEPTET_BUDGET
    ? fallback
    : "Bourbon Signal\nFresh match\n\nTracked bottle match\nSelected area\nRecent signal\n\nCheck Bourbon Signal before driving.\nReply STOP to opt out.";
}
