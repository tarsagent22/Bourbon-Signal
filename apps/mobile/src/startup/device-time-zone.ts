// One synchronizer per authenticated session. Failed saves never count as saved.
export function createDeviceTimeZoneSync(save: (zone: string) => Promise<unknown>, read = () => Intl.DateTimeFormat().resolvedOptions().timeZone) {
  let saved = '', busy = false, stopped = false, failures = 0, retryAt = 0;
  return {
    async refresh(now = Date.now()) {
      if (stopped || busy || now < retryAt) return;
      let zone: string;
      try { zone=read(); } catch { return; }
      if (!zone || zone === saved) return;
      busy = true;
      try { await save(zone); if (!stopped) { saved = zone; failures = 0; retryAt = 0; } }
      catch { failures++; retryAt = now + Math.min(300_000, 5_000 * 2 ** Math.min(failures - 1, 6)); }
      finally { busy = false; }
    },
    stop() { stopped = true; },
  };
}
