export function buildAlertSetupGuidance(input: {
  states: string[];
  alertMode: "specific_bottles" | "anything_notable";
  trackedBottleCount: number;
  enabledChannelCount: number;
}) {
  const complete = input.states.length > 0
    && input.enabledChannelCount > 0
    && (input.alertMode === "anything_notable" || input.trackedBottleCount > 0);
  if (!complete) {
    return {
      tone: "action" as const,
      title: "Finish your radar setup",
      message: "Add a market, choose bottles or all notable drops, and enable at least one delivery channel.",
    };
  }
  if (input.alertMode === "specific_bottles") {
    return {
      tone: "watch" as const,
      title: "Your radar is focused",
      message: `You are watching ${input.trackedBottleCount} exact bottle${input.trackedBottleCount === 1 ? "" : "s"}. An exact-bottle radar can be quiet between verified matches; add more bottles or choose all notable drops for broader coverage.`,
    };
  }
  return {
    tone: "ready" as const,
    title: "Your radar has broader coverage",
    message: "All notable drops give your saved markets broader coverage, with delivery limited to verified eligible signal.",
  };
}
