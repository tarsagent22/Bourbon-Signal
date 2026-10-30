// Public report details only. Account identity and routing stay outside visible copy.
export interface PushReportDetails {
  sourceType?: "engine" | "community";
  sourceLabel?: string;
  storeLabel?: string;
  storeCity?: string;
  state?: string;
  matchedArea?: string;
  quantity?: number | null;
  quantityEstimate?: string;
  price?: number | null;
  allBottlesAllocated?: boolean;
}

export function pushDisplayText(input: unknown, limit: number) {
  const text = typeof input === "string" ? input.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim() : "";
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : text;
}

function pushLocalityText(input: unknown, limit: number) {
  // Census labels append lowercase "city"; retain proper names such as Kansas City.
  const locality = pushDisplayText(input, Number.MAX_SAFE_INTEGER).replace(/ city(?=,|$)/g, "");
  return pushDisplayText(locality, limit);
}

export function notificationBottleNames(input: unknown): string[] {
  const seen = new Set<string>();
  return (Array.isArray(input) ? input : []).flatMap(raw => {
    const name = pushDisplayText(raw, 100);
    const key = name.toLocaleLowerCase("en-US");
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

// Choose once from the stable alert identity: devices and retries see the same wording.
export function pushCopyVariant(alertId: string, count: number) {
  let hash = 2166136261;
  for (const character of alertId) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return hash % count;
}

function quantityText(details: PushReportDetails) {
  const estimate = pushDisplayText(details.quantityEstimate, 35);
  // Preserve the reporter's range; never turn an estimate into an exact count.
  if (/^\d+(?:\s*[-–]\s*\d+|\+)?(?:\s+bottles?)?$/i.test(estimate)) {
    return /bottles?$/i.test(estimate) ? estimate : `${estimate} ${estimate === "1" ? "bottle" : "bottles"}`;
  }
  const quantity = details.quantity;
  return typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0
    ? `${quantity.toLocaleString("en-US")} ${quantity === 1 ? "bottle" : "bottles"}` : "";
}

export function buildPushPreview(alertId: string, inputNames: unknown, details: PushReportDetails = {}) {
  const names = notificationBottleNames(inputNames);
  if (!names.length) return { title: "Bourbon Signal", body: "Open Radar to check your latest reports." };
  const store = pushDisplayText(details.storeLabel, 85);
  const city = pushLocalityText(details.storeCity, 55);
  const state = pushDisplayText(details.state, 2);
  const area = pushLocalityText(details.matchedArea, 65);
  const location = [store, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || area;
  const quantity = quantityText(details);

  if (details.sourceType === "community") {
    const price = typeof details.price === "number" && Number.isFinite(details.price) && details.price > 0
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(details.price).replace(/\.00$/, "") : "";
    return {
      title: "Community sighting",
      body: [[names[0], quantity, price].filter(Boolean).join(" · "), location].filter(Boolean).join("\n"),
    };
  }

  // Prefer the actual reporting location over an engine/provider label.
  const source = store || pushDisplayText(details.sourceLabel, 85);
  const report = quantity && source ? `${source} reports ${quantity}.`
    : source ? `Reported by ${source}.` : quantity ? `${quantity} reported.` : "Bourbon Signal detected a new report.";
  const where = area ? `in ${area}` : "in your area";
  const summary = names.slice(0, 2).join(" and ");
  let variants: Array<{ title: string; body: string }>;
  if (names.length === 1) {
    variants = [
      { title: `${names[0]} detected ${where}`, body: report },
      { title: `${names[0]} reported ${where}`, body: report },
      { title: `Bourbon Signal detected ${names[0]}`, body: [area, report].filter(Boolean).join(" · ") },
    ];
  } else if (names.length === 2) {
    variants = [
      { title: `${summary} detected`, body: `Bourbon Signal found both ${where}. ${report}` },
      { title: `${summary} reported ${where}`, body: report },
    ];
  } else {
    const releases = `${names.length} ${details.allBottlesAllocated === true ? "allocated " : ""}releases`;
    const bottles = `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
    variants = [
      { title: `Bourbon Signal detected ${releases} ${where}`, body: `${bottles}\n${report}` },
      { title: `${releases} reported ${where}`, body: `${bottles}\n${report}` },
    ];
  }
  const preview = variants[pushCopyVariant(alertId, variants.length)]!;
  if (names.length === 2 && Array.from(preview.title).length > 100) {
    preview.title = `2 releases detected ${where}`;
    preview.body = `${names.map(name => pushDisplayText(name, 75)).join(" · ")}\n${report}`;
  }
  return { title: pushDisplayText(preview.title, 100), body: preview.body.split("\n").map(line => pushDisplayText(line, 230)).join("\n") };
}
