import { PIPELINE_STAGES } from './freshness.mjs';

export function planRecovery(health) {
  const firstUnhealthy = PIPELINE_STAGES.findIndex((stage) => health[stage]?.classification !== 'fresh');
  return firstUnhealthy < 0 ? [] : PIPELINE_STAGES.slice(firstUnhealthy);
}

export function createRecoveryWatchdog(options) {
  if (typeof options?.runStage !== 'function') throw new Error('runStage is required');
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 3));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 1_000));
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let inFlight = null;

  async function execute(health) {
    const stages = [];
    for (const stage of planRecovery(health)) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const value = await options.runStage(stage, { attempt });
          stages.push({ stage, attempts: attempt, ok: true, value });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
        }
      }
      if (lastError) {
        stages.push({ stage, attempts: maxAttempts, ok: false, error: lastError.message });
        return { ok: false, stages };
      }
    }
    return { ok: true, stages };
  }

  return {
    recover(health) {
      if (inFlight) return inFlight;
      inFlight = execute(health).finally(() => { inFlight = null; });
      return inFlight;
    },
    isRunning() {
      return inFlight !== null;
    },
  };
}
