import type { createMobileApi } from '../api/client';
import { MobileApiError } from '../api/client';
import type { SightingSubmission } from '../api/types';
import { MAX_NATIVE_SIGHTING_PHOTO_BYTES, stagePendingPhotoUpload, type PendingPhotoAttachment, type SightingPhotoAsset } from './sighting-photo';

type Storage = { getItemAsync(k: string): Promise<string | null>; setItemAsync(k: string, v: string): Promise<void>; deleteItemAsync(k: string): Promise<void> };
export type PhotoJournalEntry = { version: 1; owner: string; createdAt: number; request: { payload: SightingSubmission; key: string }; photo: SightingPhotoAsset; attachment?: PendingPhotoAttachment };
const MAX_AGE = 7 * 86400000;
export function createPhotoJournal({ owner, storage, ownedRoot, removeFile, now = Date.now }: {
  owner: string; storage: Storage; ownedRoot: string; removeFile: (uri: string) => void; now?: () => number;
}) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(owner)) throw new Error('Photo retry requires an authenticated account.');
  const key = `bourbon-signal.photo-retry.${owner}`;
  const owned = (photo: SightingPhotoAsset) => photo && typeof photo.uri === 'string' && photo.uri.startsWith(ownedRoot)
    && /^[a-zA-Z0-9_-]+\.jpg$/.test(photo.uri.slice(ownedRoot.length))
    && photo.mimeType === 'image/jpeg' && typeof photo.byteSize === 'number' && photo.byteSize > 0 && photo.byteSize <= MAX_NATIVE_SIGHTING_PHOTO_BYTES;
  async function save(entry: PhotoJournalEntry) {
    const value = JSON.stringify(entry);
    if (value.length > 24000) throw new Error('Photo retry details are too large to save securely.');
    await storage.setItemAsync(key, value);
  }
  async function clear(entry: PhotoJournalEntry) {
    // Clear durable intent first: cleanup failure must never cause a new upload.
    await storage.deleteItemAsync(key);
    if (owned(entry.photo)) removeFile(entry.photo.uri);
  }
  async function load(): Promise<PhotoJournalEntry | null> {
    const raw = await storage.getItemAsync(key);
    if (!raw) return null;
    let entry: PhotoJournalEntry;
    try { entry = JSON.parse(raw); } catch { throw new Error('Saved photo retry is unreadable. Contact support before posting it again.'); }
    if (!entry || entry.version !== 1 || entry.owner !== owner || !owned(entry.photo) || !entry.request || typeof entry.request.key !== 'string' || !entry.request.key || !entry.request.payload || typeof entry.request.payload !== 'object' || !Number.isFinite(entry.createdAt)) throw new Error('Saved photo retry is invalid. Contact support before posting it again.');
    if (entry.attachment) {
      const id = entry.attachment.sightingId;
      if (!/^sighting_[-_a-zA-Z0-9]{1,150}$/.test(id) || (entry.attachment.blob && !new RegExp(`^sighting-proofs/${id}/[0-9]+\\.jpg$`).test(entry.attachment.blob.pathname))) throw new Error('Saved photo retry could not be matched to its Signal.');
      entry.attachment.photo = entry.photo;
    }
    if (now() - entry.createdAt > MAX_AGE || entry.createdAt > now()) { await clear(entry); return null; }
    return entry;
  }
  let resuming = false;
  return {
    load,
    async prepare(payload: SightingSubmission, requestKey: string, photo: SightingPhotoAsset) {
      if (!owned(photo)) throw new Error('Photo must be retained in this account’s app-owned folder.');
      if (await load()) throw new Error('Finish the saved photo retry before posting another Signal.');
      await save({ version: 1, owner, createdAt: now(), request: { payload, key: requestKey }, photo });
    },
    async resume(api: Pick<ReturnType<typeof createMobileApi>, 'submitSighting' | 'attachSightingPhoto' | 'uploadSightingPhoto'>, file: (photo: SightingPhotoAsset) => Blob) {
      if (resuming) throw new Error('Photo retry is already running.');
      resuming = true;
      try {
        const entry = await load();
        if (!entry) throw new Error('No saved photo retry is available.');
        if (!entry.attachment) {
          // Same payload/key reconciles a lost create response via existing server idempotency.
          const result = await api.submitSighting(entry.request.payload, entry.request.key);
          entry.attachment = { sightingId: result.sighting.id, photo: entry.photo };
          await save(entry);
        }
        const attachment = entry.attachment;
        if (attachment.blob) {
          try {
            await api.attachSightingPhoto(attachment.sightingId, { pathname: attachment.blob.pathname });
            await clear(entry); return;
          } catch (error) {
            if (!(error instanceof MobileApiError) || error.status !== 404) throw error;
          }
        }
        const timestamp = now();
        entry.attachment = stagePendingPhotoUpload(attachment, timestamp);
        await save(entry); // Persist the authorized pathname BEFORE sending bytes.
        await api.uploadSightingPhoto(attachment.sightingId, file(entry.photo), timestamp);
        // Never persist upload credentials or trust a returned URL to select cleanup targets.
        await api.attachSightingPhoto(attachment.sightingId, { pathname: entry.attachment.blob!.pathname });
        await clear(entry);
      } finally { resuming = false; }
    },
  };
}
