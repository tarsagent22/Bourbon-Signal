import { randomUUID } from 'node:crypto';
import * as vercelBlob from '@vercel/blob';

const ACTIVE_POINTER = 'engine/active.json';
const ACTIVE_POINTER_EVENTS = 'engine/pointer-events/';

function pointerEventKey() {
  const reverseTimestamp = String(9_999_999_999_999 - Date.now()).padStart(13, '0');
  return `${ACTIVE_POINTER_EVENTS}${reverseTimestamp}-${randomUUID()}.json`;
}

export class VercelBlobObjectStorage {
  #blob;
  #fetcher;
  #pointerEtag = null;
  #pointerRevision = null;

  constructor(options = {}) {
    this.#blob = options.blob || vercelBlob;
    this.#fetcher = options.fetcher || fetch;
  }

  async #findExact(pathname) {
    const result = await this.#blob.list({ prefix: pathname, limit: 100, token: process.env.BLOB_READ_WRITE_TOKEN });
    return result.blobs.find((item) => item.pathname === pathname) || null;
  }

  async #readUrl(url) {
    const response = await this.#fetcher(url, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Blob read failed with HTTP ${response.status}`);
    return response.text();
  }

  async putImmutable(key, value) {
    await this.#blob.put(key, value, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31_536_000,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  }

  async readObject(key) {
    const blob = await this.#findExact(key);
    return blob ? this.#readUrl(blob.url) : null;
  }

  async readPointer() {
    this.#pointerEtag = null;
    this.#pointerRevision = null;
    const blob = await this.#findExact(ACTIVE_POINTER);
    if (!blob) {
      this.#pointerEtag = null;
      this.#pointerRevision = 0;
      return null;
    }
    // The body and CAS version must come from the same response. HEAD is
    // independently mutable, including immediately after our own write.
    const response = await this.#fetcher(blob.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Blob pointer read failed with HTTP ${response.status}`);
    const etag = response.headers?.get('etag');
    if (!etag || /^W\//i.test(etag)) throw new Error('Blob pointer requires a strong same-response ETag version.');
    const raw = await response.text();
    const pointer = JSON.parse(raw);
    if (!Number.isSafeInteger(pointer?.revision) || pointer.revision < 1) throw new Error('Invalid Blob pointer revision.');
    this.#pointerEtag = etag;
    this.#pointerRevision = pointer.revision;
    return pointer;
  }

  async #writePointerEvent(pointer) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.#blob.put(pointerEventKey(), JSON.stringify(pointer), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31_536_000,
          contentType: 'application/json',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async ensurePointerEvent(pointer) {
    await this.#writePointerEvent(pointer);
  }

  async compareAndSwapPointer(expectedRevision, next) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || next?.revision !== expectedRevision + 1) throw new Error('Invalid pointer revision transition.');
    if (this.#pointerRevision !== expectedRevision) await this.readPointer();
    if (this.#pointerRevision !== expectedRevision) return false;
    if (expectedRevision > 0 && !this.#pointerEtag) throw new Error('Pointer CAS requires a version.');
    try {
      await this.#blob.put(ACTIVE_POINTER, JSON.stringify(next), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: expectedRevision > 0,
        ...(expectedRevision > 0 && this.#pointerEtag ? { ifMatch: this.#pointerEtag } : {}),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      this.#pointerEtag = null;
      this.#pointerRevision = null;
      await this.#writePointerEvent(next);
      return true;
    } catch (error) {
      if ((this.#blob.BlobPreconditionFailedError && error instanceof this.#blob.BlobPreconditionFailedError) || /precondition|already exists|etag|match/i.test(String(error))) {
        this.#pointerEtag = null;
        this.#pointerRevision = null;
        return false;
      }
      throw error;
    }
  }
}
