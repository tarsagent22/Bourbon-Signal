import type { NextRequest } from "next/server";

export const QA_PREVIEW_TIER = "bottled-in-bond" as const;

export const QA_PREVIEW_PREFERENCES = {
  areaPreferences: {
    states: ["NC", "VA", "PA"],
    ncBoards: [],
    vaCities: [],
    ohCities: [],
    iaCities: [],
    idCities: [],
    paCounties: [],
    paStores: [],
  },
  notificationPreferences: {
    onSite: { enabled: true },
    email: { enabled: true, mode: "major_only" as const },
    sms: { enabled: false, available: true, mode: "major_only" as const, verified: false },
  },
  alertMode: "anything_notable" as const,
  bottleAlertPreferences: {
    bottleNames: ["Blanton's Single Barrel", "Weller Antique 107", "E.H. Taylor Small Batch"],
    bottleKeys: ["blanton s single barrel", "weller antique 107", "e h taylor small batch"],
  },
  collectionPreferences: {
    bottles: [],
  },
  sightingsPreferences: {
    submittedSightings: [],
    signalReports: [],
    sightingVotes: [],
  },
};

function hostLooksLikeSafeQaPreview(hostname: string) {
  const host = hostname.toLowerCase().split(":")[0];
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("bourbonsignal-git-launch-membershi")
  );
}

export function isQaPreviewRequest(request: NextRequest) {
  const host = request.headers.get("host") || "";
  return process.env.BOURBON_SIGNAL_QA_PREVIEW === "1" || hostLooksLikeSafeQaPreview(host);
}

export function isQaPreviewMode() {
  if (process.env.NEXT_PUBLIC_BOURBON_SIGNAL_QA_PREVIEW === "1") return true;
  if (typeof window === "undefined") return false;
  return hostLooksLikeSafeQaPreview(window.location.hostname);
}
