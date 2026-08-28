export type MemberTabKey = "signals" | "radar" | "post" | "cellar" | "hq";
export type MemberOwnedFeature =
  | "signal_feed"
  | "signal_detail"
  | "watched_bottles"
  | "saved_markets"
  | "alert_controls"
  | "alert_inbox"
  | "sighting_composer"
  | "collection"
  | "member_identity"
  | "signal_points"
  | "rewards"
  | "account_controls";

export interface MemberTabDefinition {
  key: MemberTabKey;
  route: "index" | "radar" | "post" | "cellar" | "hq";
  label: string;
  icon: string;
  owns: readonly MemberOwnedFeature[];
}

export const MEMBER_TABS: readonly MemberTabDefinition[] = [
  { key: "signals", route: "index", label: "Signals", icon: "radio-tower", owns: ["signal_feed", "signal_detail"] },
  { key: "radar", route: "radar", label: "Radar", icon: "radar", owns: ["watched_bottles", "saved_markets", "alert_controls", "alert_inbox"] },
  { key: "post", route: "post", label: "Post", icon: "plus-circle-outline", owns: ["sighting_composer"] },
  { key: "cellar", route: "cellar", label: "Cellar", icon: "bottle-soda-classic-outline", owns: ["collection"] },
  { key: "hq", route: "hq", label: "Account", icon: "account-circle-outline", owns: ["member_identity", "signal_points", "rewards", "account_controls"] },
] as const;

export function ownedFeatureHome(feature: MemberOwnedFeature): MemberTabKey | null {
  return MEMBER_TABS.find((tab) => tab.owns.includes(feature))?.key ?? null;
}
