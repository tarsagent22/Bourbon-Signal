// Only loaded explicitly by offline exporter regression subprocesses.
const NativeDate = Date;
const now = NativeDate.parse(process.env.QUALITY_FIXTURE_NOW);
if (!Number.isFinite(now)) throw new Error('QUALITY_FIXTURE_NOW is required');
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
globalThis.fetch = () => { throw new Error('Network is forbidden in offline quality regression'); };
