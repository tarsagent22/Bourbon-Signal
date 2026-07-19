export type BottleContributionReviewStatus = "new" | "matched_existing" | "needs_human" | "rejected" | "added" | "ignored";
export type BottleContributionReviewAction = "use_match" | "confirm_added" | "dismiss";

export function bottleContributionStatusForAction(action: unknown): BottleContributionReviewStatus | null {
  if (action === "use_match") return "matched_existing";
  if (action === "confirm_added") return "added";
  if (action === "dismiss") return "rejected";
  return null;
}

export function isBottleContributionPending(status: unknown) {
  return status === "new" || status === "needs_human";
}

export interface QueueBlobCandidate {
  pathname: string;
  url: string;
  uploadedAt: Date;
}

export function selectLatestQueueBlob<T extends QueueBlobCandidate>(blobs: readonly T[]) {
  return [...blobs]
    .filter((blob) => blob.pathname === "bottle-contributions/queue.json" || /^bottle-contributions\/queue-\d+-[a-z0-9-]+\.json$/i.test(blob.pathname))
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())[0] || null;
}
