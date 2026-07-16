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
