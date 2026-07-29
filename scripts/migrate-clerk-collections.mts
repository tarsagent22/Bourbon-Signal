#!/usr/bin/env node
import { createClerkClient } from '@clerk/backend';

const loadedRepository = await import('../src/lib/member-collection-repository.ts');
const repositoryModule = ((loadedRepository as { default?: unknown }).default || loadedRepository) as typeof import('../src/lib/member-collection-repository.ts');
const loadedCollection = await import('../src/lib/member-collection.ts');
const collectionModule = ((loadedCollection as { default?: unknown }).default || loadedCollection) as typeof import('../src/lib/member-collection.ts');
const { MemberCollectionRepository } = repositoryModule;
const { normalizeCollectionBottles } = collectionModule;

const clear = process.argv.includes('--clear');
const apply = clear || process.argv.includes('--apply');
const secretKey = process.env.CLERK_SECRET_KEY;
const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.DATABASE_URL;
if (!secretKey) throw new Error('Missing CLERK_SECRET_KEY.');
if (!connectionString) throw new Error('Missing durable application database connection.');

const clerk = createClerkClient({ secretKey });
const repository = new MemberCollectionRepository(connectionString);
let offset = 0;
let scanned = 0;
let eligible = 0;
let migrated = 0;
let reconciled = 0;
let diverged = 0;
let cleared = 0;
let bottleCount = 0;

function fingerprint(bottles) {
  return JSON.stringify(bottles
    .map((bottle) => ({
      canonicalKey: bottle.canonicalKey,
      bottleId: bottle.bottleId,
      rating: bottle.rating,
      notes: bottle.notes || '',
      tasteTags: [...(bottle.tasteTags || [])].sort(),
      wouldBuyAgain: Boolean(bottle.wouldBuyAgain),
    }))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)));
}

while (true) {
  const page = await clerk.users.getUserList({ limit: 100, offset });
  if (!page.data.length) break;
  for (const user of page.data) {
    scanned += 1;
    const legacy = normalizeCollectionBottles(user.publicMetadata?.collectionPreferences);
    if (!legacy.length) continue;
    eligible += 1;
    bottleCount += legacy.length;
    if (!apply) continue;
    const imported = await repository.migrateLegacyForUser(user.id, legacy);
    if (imported) migrated += 1;
    let durable = await repository.getForUser(user.id);
    if (fingerprint(durable.bottles) !== fingerprint(legacy)) {
      if (clear) {
        // During cutover grace, Neon may be newer; clear the stale legacy copy without overwriting authority.
        diverged += 1;
      } else {
        if (!(await repository.canReconcileStagedLegacy(user.id))) {
          throw new Error('Durable collection changed after staging; refusing to overwrite it from Clerk.');
        }
        durable = await repository.replaceForUser(user.id, legacy, durable.version);
        reconciled += 1;
      }
    }
    if (!clear && fingerprint(durable.bottles) !== fingerprint(legacy)) {
      throw new Error('Durable collection verification failed; cutover staging stopped.');
    }
    if (clear) {
      await clerk.users.updateUserMetadata(user.id, {
        publicMetadata: { collectionPreferences: null },
      });
      await repository.markLegacyCleared(user.id);
      cleared += 1;
    }
  }
  offset += page.data.length;
  if (page.data.length < 100) break;
}

console.log(JSON.stringify({
  ok: true,
  mode: clear ? 'clear' : apply ? 'stage' : 'check',
  scanned,
  eligible,
  migrated,
  reconciled,
  diverged,
  cleared,
  bottleCount,
}));
