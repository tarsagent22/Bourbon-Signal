export function createActivityReporter(send: () => Promise<unknown>, now = Date.now) {
  let lastSuccess = -Infinity, inFlight = false, stopped = false;
  return {
    async report() {
      if (stopped || inFlight || now() - lastSuccess < 5 * 60_000) return;
      inFlight = true;
      try { await send(); lastSuccess = now(); } catch { /* Activity must never block app use. */ }
      finally { inFlight = false; }
    },
    stop() { stopped = true; },
  };
}
