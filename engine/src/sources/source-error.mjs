export const SOURCE_ERROR_KINDS = Object.freeze({
  TRANSIENT: 'transient',
  TIMEOUT: 'timeout',
  MALFORMED: 'malformed',
  COLLAPSED: 'collapsed',
  PERMANENT: 'permanent',
  CIRCUIT_OPEN: 'circuit_open',
  UNEXPECTED: 'unexpected',
});

function sanitizeUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[redacted-url]';
  }
}

export function sanitizeSourceErrorMessage(value) {
  const message = String(value || 'Source failure')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeUrl(url))
    .replace(/\b(api[_-]?key|token|access[_-]?token|authorization|password|secret|cookie|session)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(bearer)\s+[^\s,;]+/gi, '$1 [redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return message.slice(0, 500) || 'Source failure';
}

export class SourceAdapterError extends Error {
  constructor(message, options = {}) {
    super(sanitizeSourceErrorMessage(message), options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.kind = options.kind || SOURCE_ERROR_KINDS.UNEXPECTED;
    this.transient = options.transient === true;
    this.code = options.code || null;
    this.status = options.status ?? null;
    this.details = options.details || null;
  }
}

export class TransientSourceError extends SourceAdapterError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: SOURCE_ERROR_KINDS.TRANSIENT, transient: true });
  }
}

export class SourceTimeoutError extends SourceAdapterError {
  constructor(sourceId, timeoutMs, options = {}) {
    super(`Source ${sourceId || '[unnamed]'} exceeded ${timeoutMs}ms`, {
      ...options,
      kind: SOURCE_ERROR_KINDS.TIMEOUT,
      transient: true,
      code: options.code || 'SOURCE_TIMEOUT',
      details: { ...(options.details || {}), sourceId, timeoutMs },
    });
    this.timeoutMs = timeoutMs;
    this.sourceId = sourceId || null;
  }
}

export class MalformedSourceError extends SourceAdapterError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: SOURCE_ERROR_KINDS.MALFORMED, transient: false });
  }
}

export class CollapsedSourceError extends SourceAdapterError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: SOURCE_ERROR_KINDS.COLLAPSED, transient: false });
  }
}

export class PermanentSourceError extends SourceAdapterError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: SOURCE_ERROR_KINDS.PERMANENT, transient: false });
  }
}

export class CircuitOpenSourceError extends SourceAdapterError {
  constructor(sourceId, options = {}) {
    super(`Source ${sourceId || '[unnamed]'} circuit is open`, {
      ...options,
      kind: SOURCE_ERROR_KINDS.CIRCUIT_OPEN,
      transient: false,
      code: options.code || 'SOURCE_CIRCUIT_OPEN',
      details: { ...(options.details || {}), sourceId },
    });
  }
}

const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETDOWN', 'ENETUNREACH',
  'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
]);
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

export function sourceErrorForHttp(status, message = `Source returned HTTP ${status}`, options = {}) {
  const numericStatus = Number(status);
  if (TRANSIENT_HTTP.has(numericStatus)) {
    return new TransientSourceError(message, { ...options, status: numericStatus, code: `HTTP_${numericStatus}` });
  }
  return new PermanentSourceError(message, { ...options, status: Number.isFinite(numericStatus) ? numericStatus : null, code: Number.isFinite(numericStatus) ? `HTTP_${numericStatus}` : null });
}

export function normalizeSourceError(error) {
  if (error instanceof SourceAdapterError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const name = error?.name || '';
  const code = error?.code || error?.cause?.code || null;
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'WorkerTimeoutError' || TRANSIENT_CODES.has(code)) {
    return new SourceAdapterError(message || 'Source timed out', {
      kind: name === 'AbortError' || /timeout/i.test(`${name} ${message}`) ? SOURCE_ERROR_KINDS.TIMEOUT : SOURCE_ERROR_KINDS.TRANSIENT,
      transient: true,
      code,
      cause: error instanceof Error ? error : undefined,
    });
  }
  return new SourceAdapterError(message || 'Unexpected source failure', {
    kind: SOURCE_ERROR_KINDS.UNEXPECTED,
    transient: false,
    code,
    cause: error instanceof Error ? error : undefined,
  });
}

export function serializeSourceError(error) {
  const normalized = normalizeSourceError(error);
  return {
    name: normalized.name,
    kind: normalized.kind,
    message: normalized.message,
    transient: normalized.transient,
    code: normalized.code,
    status: normalized.status,
    details: normalized.details,
  };
}
