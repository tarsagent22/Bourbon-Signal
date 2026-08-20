export type ActivationTier = "free" | "standard" | "barrel" | "bottled-in-bond";
export type ActivationMilestone = "alert_area_saved" | "watchlist_saved" | "notification_channel_enabled" | "paid_activation_completed" | "first_alert_created";

export interface ActivationInput {
  tier: ActivationTier;
  areas: string[];
  bottleKeys: string[];
  alertMode: "specific_bottles" | "anything_notable";
  channels: { onSite: boolean; email: boolean; sms: boolean };
}

export function deriveMemberActivation(input: ActivationInput) {
  if (input.tier === "free") return { eligible: false, complete: false, remaining: [] as string[] };
  const remaining: string[] = [];
  if (!input.areas.length) remaining.push("area");
  if (input.alertMode === "specific_bottles" && !input.bottleKeys.length) remaining.push("watchlist");
  if (!input.channels.onSite && !input.channels.email && !input.channels.sms) remaining.push("channel");
  return { eligible: true, complete: remaining.length === 0, remaining };
}

export function mergeActivationMilestones(metadata: Record<string, unknown>, milestones: ActivationMilestone[], at: string) {
  const current = metadata.activation && typeof metadata.activation === "object" ? metadata.activation as Record<string, unknown> : {};
  const activation = { ...current } as Record<string, string>;
  for (const milestone of milestones) {
    if (!activation[milestone]) activation[milestone] = at;
  }
  return { ...metadata, activation };
}

export function firstAlertCreatedMetadata(metadata: Record<string, unknown>, committed: boolean, at: string) {
  if (!committed) return metadata;
  return mergeActivationMilestones(metadata, ["first_alert_created"], at);
}

export type ActivationStepKey = "area" | "watchlist" | "channel";

const ACTIVATION_STEPS: Array<{ key: ActivationStepKey; label: string }> = [
  { key: "area", label: "Save an alert area" },
  { key: "watchlist", label: "Choose what to watch" },
  { key: "channel", label: "Enable an alert channel" },
];

export function buildActivationChecklist(remaining: string[], complete: boolean) {
  const remainingSteps = new Set(remaining);
  const items = ACTIVATION_STEPS.map((item) => ({ ...item, complete: !remainingSteps.has(item.key) }));
  return {
    complete,
    completedCount: items.filter((item) => item.complete).length,
    total: items.length,
    nextHref: "/dashboard?section=alerts",
    items,
  };
}

export function buildAlertEmptyState({
  tab,
  activationComplete,
  loadFailed,
}: {
  tab: "unread" | "all" | "archived";
  activationComplete: boolean | null;
  loadFailed: boolean;
}) {
  if (loadFailed) {
    return {
      title: "Alerts unavailable",
      body: "We couldn’t load your alert inbox. Try again before assuming there are no new matches.",
      actionLabel: "Try again",
      actionHref: "/alerts",
    };
  }
  if (activationComplete === null) {
    return {
      title: "Setup status unavailable",
      body: "We couldn’t confirm your saved alert setup. Review it before waiting for matches.",
      actionLabel: "Review alert setup",
      actionHref: "/dashboard?section=alerts",
    };
  }
  if (tab === "archived") {
    return {
      title: "No archived alerts",
      body: "Alerts you archive will stay available here.",
      actionLabel: "Review alert setup",
      actionHref: "/dashboard?section=alerts",
    };
  }
  if (!activationComplete) {
    return {
      title: "Finish alert setup",
      body: "Save an area, choose what to watch, and turn on a notification channel before matches can reach you.",
      actionLabel: "Finish setup",
      actionHref: "/dashboard?section=alerts",
    };
  }
  if (tab === "unread") {
    return {
      title: "You’re caught up",
      body: "Your signal is active. New matches in your saved area will appear here.",
      actionLabel: "Review alert setup",
      actionHref: "/dashboard?section=alerts",
    };
  }
  return {
    title: "No current alerts",
    body: "Your signal is active. Archived alerts remain available under Archived.",
    actionLabel: "Review alert setup",
    actionHref: "/dashboard?section=alerts",
  };
}
