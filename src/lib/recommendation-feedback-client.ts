export interface FeedbackLoadGuard {
  requestedUserId: string;
  activeUserId: string | null;
  requestVersion: number;
  currentRequestVersion: number;
  mutationVersionAtStart: number;
  currentMutationVersion: number;
}

export function shouldApplyFeedbackLoad(guard: FeedbackLoadGuard) {
  return guard.requestedUserId === guard.activeUserId
    && guard.requestVersion === guard.currentRequestVersion
    && guard.mutationVersionAtStart === guard.currentMutationVersion;
}

interface TrackedRecommendationActions {
  optimisticallyTrack: () => void;
  persistTracking: () => Promise<void>;
  rollbackTracking: () => void;
  writePositiveFeedback: () => Promise<void>;
}

export async function applyTrackedRecommendation(actions: TrackedRecommendationActions) {
  actions.optimisticallyTrack();
  try {
    await actions.persistTracking();
  } catch (error) {
    actions.rollbackTracking();
    throw error;
  }
  await actions.writePositiveFeedback();
}

export function shouldRunFeedbackMutation(requestedUserId: string, activeUserId: string | null) {
  return requestedUserId === activeUserId;
}

export function createSerialFeedbackMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
