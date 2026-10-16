/** At most one frame at a time; invalidates results on pause, blur, or unmount. */
export function createScanLoop<T>({ read, onResult, onError, delay = 1800 }: {
  read: () => Promise<T>; onResult: (value: T) => void; onError: (error: unknown) => void; delay?: number;
}) {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  async function tick() {
    const current = generation;
    if (!running) return;
    if (pending) { timer = setTimeout(() => void tick(), delay); return; }
    pending = true;
    try { const value = await read(); if (running && current === generation) onResult(value); }
    catch (error) { if (running && current === generation) onError(error); }
    finally { pending = false; if (running && current === generation) timer = setTimeout(() => void tick(), delay); }
  }
  return {
    start() { if (running) return; running = true; generation += 1; void tick(); },
    stop() { running = false; generation += 1; if (timer) clearTimeout(timer); },
  };
}
