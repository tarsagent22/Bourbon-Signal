import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_SIGHTING_PHOTO_BYTES,
  buildSightingPhotoPath,
  parseSightingPhotoClientPayload,
  validateCompletedSightingPhoto,
  validateSightingPhotoPath,
} from '../src/lib/sighting-photo-upload.ts';

const sightingId = 'sighting_12345678-1234-1234-1234-123456789abc';
assert.deepEqual(parseSightingPhotoClientPayload(JSON.stringify({ sightingId })), { sightingId });
for (const invalid of [null, '', '{}', '{', JSON.stringify({ sightingId: 'other_123' })]) {
  assert.equal(parseSightingPhotoClientPayload(invalid), null, `invalid client payload should be rejected: ${String(invalid)}`);
}
const pathname = buildSightingPhotoPath(sightingId, 'IMG_0517.jpeg', 'image/jpeg', 1_721_255_000_000);
assert.equal(pathname, `${'sighting-proofs/'}${sightingId}/1721255000000.jpg`);
assert.equal(validateSightingPhotoPath(sightingId, pathname), true);
assert.equal(validateSightingPhotoPath(sightingId, `sighting-proofs/sighting_other/1721255000000.jpg`), false);
assert.equal(validateSightingPhotoPath(sightingId, `${'sighting-proofs/'}${sightingId}/../escape.jpg`), false);
const completed = validateCompletedSightingPhoto(
  { sightingId, blob: { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname } },
  { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname, size: 6 * 1024 * 1024, contentType: 'image/jpeg' },
);
assert.deepEqual(completed, { sightingId, url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname });
assert.equal(validateCompletedSightingPhoto(
  { sightingId, blob: { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname } },
  { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname: `${pathname}.other`, size: 100, contentType: 'image/jpeg' },
), null, 'mismatched Blob pathname must be rejected');
assert.equal(validateCompletedSightingPhoto(
  { sightingId, blob: { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname } },
  { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname, size: MAX_SIGHTING_PHOTO_BYTES + 1, contentType: 'image/jpeg' },
), null, 'oversized uploaded Blob must be rejected');
assert.equal(validateCompletedSightingPhoto(
  { sightingId, blob: { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname } },
  { url: 'https://example.public.blob.vercel-storage.com/photo.jpg', pathname, size: 100, contentType: 'text/html' },
), null, 'non-image Blob must be rejected');

const hook = readFileSync(new URL('../src/hooks/useSightings.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app/api/sightings/photo/route.ts', import.meta.url), 'utf8');

assert.match(hook, /@vercel\/blob\/client/, 'photo uploads must use the direct Blob client instead of proxying the image through a Vercel Function');
assert.match(hook, /uploadBlob\(/, 'the sighting hook must upload the selected image directly to Blob storage');
assert.match(hook, /handleUploadUrl:\s*["']\/api\/sightings\/photo["']/, 'direct uploads must request an authenticated server-issued upload token');
assert.match(hook, /clientPayload:\s*JSON\.stringify\(\{\s*sightingId\s*\}\)/, 'the token request must bind the upload to the sighting');
assert.match(hook, /multipart:\s*file\.size\s*>\s*SIGHTING_PHOTO_MULTIPART_THRESHOLD_BYTES/, 'large mobile photos should use multipart direct upload');
assert.match(hook, /method:\s*["']PATCH["']/, 'the client must finalize the uploaded Blob with a small authenticated request');
assert.match(hook, /setError\(message\)/, 'the hook must preserve the actionable upload or finalize error for retry');

assert.match(route, /handleUpload\(/, 'the photo route must issue constrained direct-upload tokens');
assert.match(route, /onBeforeGenerateToken/, 'the token route must validate the requested sighting before upload');
assert.match(route, /onUploadCompleted/, 'the Blob callback must attach successful uploads even when the client loses its response');
assert.match(route, /target\.reporterUserId\s*!==\s*userId/, 'only the sighting owner may receive an upload token or attach a photo');
assert.match(route, /Photo evidence is already attached/, 'upload tokens must reject later replacement of immutable sighting evidence');
assert.match(route, /allowedContentTypes/, 'upload tokens must be restricted to supported image types');
assert.match(route, /maximumSizeInBytes:\s*MAX_SIGHTING_PHOTO_BYTES/, 'direct uploads should support mobile photos up to the behavior-tested 10 MB limit');
assert.match(route, /export async function PATCH/, 'the route must expose an authenticated recovery operation');
assert.match(route, /await head\(/, 'recovery must verify the uploaded object exists in the configured Blob store');
assert.match(route, /replacePhotoProof\(sightingId, userId, null, photoProof\)/, 'the one allowed attachment must compare against an empty photo slot');
assert.doesNotMatch(route, /\bdel\s*\(/, 'photo callbacks and caller-driven recovery must never delete objects without server-owned attempt provenance');
assert.match(route, /await head\(blob\.pathname, \{ token \}\)/, 'first attachment must resolve only the validated pathname in the configured store');
assert.match(route, /reconcileClerkRewardsWithStatus/, 'reward projection must know whether its generation applied');
assert.match(route, /readRewardGeneration/, 'reward projection must re-check the durable generation around Clerk writes');
assert.match(route, /for \(let attempt = 0; attempt < 3/, 'reward projection retries from the newest generation when concurrent mutations race the Clerk write');
assert.doesNotMatch(route, /req\.formData\(/, 'the server route must not proxy multipart image bodies through the 4.5 MB function limit');
assert.doesNotMatch(route, /await put\(/, 'the server route must not perform the image upload itself');
assert.doesNotMatch(route, /export async function DELETE\(/, 'post-submit evidence is retried or recovered rather than racing a public Blob deletion');

console.log('Sighting direct photo-upload contract passed.');
