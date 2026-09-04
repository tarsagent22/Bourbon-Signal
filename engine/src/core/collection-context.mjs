import { AsyncLocalStorage } from 'node:async_hooks';
import { writeFile as fsWriteFile, rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// A request-scoped bridge for legacy nested collectors. No module-global signal:
// concurrent states inherit only their own runtime cancellation.
const collectionContext = new AsyncLocalStorage();
export function collectionSignal(signal) {
  const inherited = collectionContext.getStore()?.signal;
  const signals = [...new Set([inherited, signal].filter(Boolean))];
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}
export function throwIfCollectionAborted() {
  const context = collectionContext.getStore();
  context?.signal?.throwIfAborted();
}
export async function withCollectionContext(options, collect) {
  const signal = collectionSignal(options?.signal);
  return collectionContext.run({ ...collectionContext.getStore(), ...options, signal }, async () => {
    throwIfCollectionAborted();
    const result = await collect();
    throwIfCollectionAborted();
    return result;
  });
}
export function collectionRequestSignal(signal) {
  throwIfCollectionAborted();
  const combined = collectionSignal(signal);
  combined?.throwIfAborted();
  return combined;
}
export async function writeCollectionFile(file, data, options) {
  throwIfCollectionAborted();
  const normalized = typeof options === 'string' ? { encoding: options } : options || {};
  const signal = collectionSignal(normalized.signal);
  signal?.throwIfAborted();
  if (!signal) return fsWriteFile(file, data, normalized);
  const target = file instanceof URL ? fileURLToPath(file) : file;
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsWriteFile(temporary, data, { ...normalized, signal });
    signal.throwIfAborted();
    // No asynchronous gap between cancellation admission and atomic publication.
    renameSync(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
