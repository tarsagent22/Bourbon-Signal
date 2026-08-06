export type WelcomeStateSignalStatus = "loading" | "eligible" | "active" | "expired" | "ineligible" | "error";

export interface WelcomeStateSignalOwner<TRow> {
  userId: string;
  stateCode: string;
  rows: TRow[];
}

export function welcomeStateSignalsCanLoad(status: WelcomeStateSignalStatus) {
  return status === "eligible";
}

export function welcomeStateSignalRows<TRow>(input: {
  status: WelcomeStateSignalStatus;
  owner: WelcomeStateSignalOwner<TRow> | null;
  userId: string | null;
  stateCode: string;
}) {
  if (!welcomeStateSignalsCanLoad(input.status)
    || !input.userId
    || !input.owner
    || input.owner.userId !== input.userId
    || input.owner.stateCode !== input.stateCode) return [];
  return input.owner.rows;
}
