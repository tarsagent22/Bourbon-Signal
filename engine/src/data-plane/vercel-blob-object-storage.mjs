import * as vercelBlob from '@vercel/blob';

const ACTIVE_POINTER = 'engine/active.json';

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
    const blob = await this.#findExact(ACTIVE_POINTER);
    if (!blob) {
      this.#pointerEtag = null;
      this.#pointerRevision = 0;
      return null;
    }
    const [raw, metadata] = await Promise.all([
      this.#readUrl(blob.url),
      this.#blob.head(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }),
    ]);
    const pointer = JSON.parse(raw);
    this.#pointerEtag = metadata.etag || null;
    this.#pointerRevision = pointer.revision ?? 0;
    return pointer;
  }

  async compareAndSwapPointer(expectedRevision, next) {
    if (this.#pointerRevision !== expectedRevision) await this.readPointer();
    if (this.#pointerRevision !== expectedRevision) return false;
    try {
      const result = await this.#blob.put(ACTIVE_POINTER, JSON.stringify(next), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: expectedRevision > 0,
        ...(expectedRevision > 0 && this.#pointerEtag ? { ifMatch: this.#pointerEtag } : {}),
        cacheControlMaxAge: 60,
        contentType: 'application/json',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const metadata = await this.#blob.head(result.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      this.#pointerEtag = metadata.etag || null;
      this.#pointerRevision = next.revision;
      return true;
    } catch (error) {
      if (error instanceof this.#blob.BlobPreconditionFailedError || /precondition|already exists|etag|match/i.test(String(error))) {
        this.#pointerEtag = null;
        this.#pointerRevision = null;
        return false;
      }
      throw error;
    }
  }
}
