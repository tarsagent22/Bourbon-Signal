export function feedRetryAction(hasMore: boolean) {
  return hasMore
    ? { refresh: false, label: "Try again" }
    : { refresh: true, label: "Refresh feed" };
}
