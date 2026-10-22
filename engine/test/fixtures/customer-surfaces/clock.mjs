// Loaded only by the offline customer-surface exporter regression subprocess.
const NativeDate = Date;
const now = NativeDate.parse(process.env.CUSTOMER_SURFACE_FIXTURE_NOW);
if (!Number.isFinite(now)) throw new Error('CUSTOMER_SURFACE_FIXTURE_NOW is required');
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
