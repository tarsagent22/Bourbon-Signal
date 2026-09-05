function asMillis(value) {
  const millis = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(millis) ? millis : Date.now();
}

export class SourceCircuitBreaker {
  #states = new Map();
  #failureThreshold;
  #cooldownMs;
  #now;

  constructor(options = {}) {
    this.#failureThreshold = Math.max(1, Math.floor(Number(options.failureThreshold ?? 3)));
    this.#cooldownMs = Math.max(0, Number(options.cooldownMs ?? 5 * 60_000));
    this.#now = options.now || Date.now;
    for (const [sourceId, state] of Object.entries(options.initialState || {})) this.#states.set(sourceId, { ...state });
  }

  #time() {
    return asMillis(this.#now());
  }

  canExecute(sourceId) {
    const current = this.#states.get(sourceId);
    if (!current || current.state === 'closed') return { allowed: true, state: 'closed' };
    if (current.state === 'half_open') return { allowed: false, state: 'half_open' };
    const now = this.#time();
    if (now - Number(current.openedAtMs || 0) >= this.#cooldownMs) {
      const next = { ...current, state: 'half_open', halfOpenAt: new Date(now).toISOString() };
      this.#states.set(sourceId, next);
      return { allowed: true, state: 'half_open' };
    }
    return { allowed: false, state: 'open', retryAt: new Date(Number(current.openedAtMs || now) + this.#cooldownMs).toISOString() };
  }

  recordSuccess(sourceId) {
    const now = this.#time();
    this.#states.set(sourceId, {
      state: 'closed',
      consecutiveFailures: 0,
      openedAtMs: null,
      lastSuccessAt: new Date(now).toISOString(),
      lastFailureAt: this.#states.get(sourceId)?.lastFailureAt || null,
    });
  }

  recordFailure(sourceId, error = null) {
    const now = this.#time();
    const current = this.#states.get(sourceId) || { state: 'closed', consecutiveFailures: 0 };
    const consecutiveFailures = Number(current.consecutiveFailures || 0) + 1;
    const opens = current.state === 'half_open' || consecutiveFailures >= this.#failureThreshold;
    this.#states.set(sourceId, {
      ...current,
      state: opens ? 'open' : 'closed',
      consecutiveFailures,
      openedAtMs: opens ? now : null,
      lastFailureAt: new Date(now).toISOString(),
      lastErrorKind: error?.kind || null,
    });
  }

  snapshot(sourceId = null) {
    if (sourceId != null) return structuredClone(this.#states.get(sourceId) || { state: 'closed', consecutiveFailures: 0 });
    return Object.fromEntries([...this.#states].map(([id, state]) => [id, structuredClone(state)]));
  }

  withCheckpoint(sourceId, state) {
    return new SourceCircuitBreaker({
      failureThreshold: this.#failureThreshold,
      cooldownMs: this.#cooldownMs,
      now: this.#now,
      initialState: { [sourceId]: structuredClone(state) },
    });
  }
}
