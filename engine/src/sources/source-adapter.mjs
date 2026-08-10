import { MalformedSourceError } from './source-error.mjs';

function defaultRecordCount(value) {
  if (Array.isArray(value)) return value.length;
  for (const key of ['signals', 'records', 'rows', 'items']) {
    if (Array.isArray(value?.[key])) return value[key].length;
  }
  return value == null ? 0 : 1;
}

function sourceDomain(url, fallback) {
  try { return new URL(url).hostname; } catch { return fallback; }
}

export function createSourceAdapter(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id) throw new TypeError('Source adapter id is required');
  const execute = definition.execute || definition.collect;
  if (typeof execute !== 'function') throw new TypeError(`Source adapter ${id} requires an execute function`);
  if (definition.validate != null && typeof definition.validate !== 'function') throw new TypeError(`Source adapter ${id} validate must be a function`);
  if (definition.recordCount != null && typeof definition.recordCount !== 'function') throw new TypeError(`Source adapter ${id} recordCount must be a function`);
  const minBaseline = Math.max(1, Number(definition.collapse?.minBaseline ?? 1));
  const minRatio = Math.min(1, Math.max(0, Number(definition.collapse?.minRatio ?? 0.5)));
  const rawTimeoutMs = definition.timeoutMs == null ? null : Number(definition.timeoutMs);
  const rawMaxAttempts = definition.maxAttempts == null ? null : Number(definition.maxAttempts);
  if (rawTimeoutMs != null && !Number.isFinite(rawTimeoutMs)) throw new TypeError(`Source adapter ${id} timeoutMs must be a finite numeric value`);
  if (rawMaxAttempts != null && !Number.isFinite(rawMaxAttempts)) throw new TypeError(`Source adapter ${id} maxAttempts must be a finite numeric value`);
  const timeoutMs = rawTimeoutMs == null ? null : Math.min(120_000, Math.max(1, rawTimeoutMs));
  const maxAttempts = rawMaxAttempts == null ? null : Math.min(3, Math.max(1, Math.floor(rawMaxAttempts)));
  return Object.freeze({
    contractVersion: 'bourbon-signal-source-adapter-v1',
    id,
    label: String(definition.label || id),
    url: definition.url ? String(definition.url) : null,
    domain: String(definition.domain || sourceDomain(definition.url, id)),
    timeoutMs,
    maxAttempts,
    execute,
    validate: definition.validate || null,
    recordCount: definition.recordCount || defaultRecordCount,
    collapse: Object.freeze({ minBaseline, minRatio }),
    scheduleMetrics: definition.scheduleMetrics || null,
    metadata: Object.freeze({ ...(definition.metadata || {}) }),
  });
}

export const defineSourceAdapter = createSourceAdapter;

export function validateSourceValue(adapter, value) {
  if (value === undefined) throw new MalformedSourceError(`Source ${adapter.id} returned undefined`);
  if (!adapter.validate) return value;
  const verdict = adapter.validate(value);
  if (verdict === false) throw new MalformedSourceError(`Source ${adapter.id} returned a malformed result`);
  if (typeof verdict === 'string') throw new MalformedSourceError(verdict);
  if (verdict && typeof verdict === 'object' && verdict.ok === false) {
    throw new MalformedSourceError(verdict.reason || `Source ${adapter.id} returned a malformed result`, { details: verdict.details || null });
  }
  return value;
}
