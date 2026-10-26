import { AsyncLocalStorage } from 'node:async_hooks';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { renameSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { writeCollectionFile, collectionSignal } from './core/collection-context.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { buildLibrarySourceSearchPlan, librarySearchPool } from './library-query-plan.mjs';

const sessions = new AsyncLocalStorage();
const hash = value => createHash('sha256').update(value).digest('hex');

// Advance on source invocation, not wall-clock parity. Adaptive scheduling and
// cached passes otherwise permanently strand subsets of the bottle library.
export async function librarySourceSearchPlan(bible, options) {
  const poolDigest = hash(JSON.stringify(librarySearchPool(bible)));
  const dir = options.cursorDir || (process.env.NODE_TEST_CONTEXT ? path.join(tmpdir(), `bourbon-library-search-${process.pid}`) : path.resolve('out/cache/library-search'));
  const file = path.join(dir, `${hash(options.sourceKey).slice(0, 24)}.json`);
  let previous;
  try { previous = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sameSource = previous?.schemaVersion === 1 && previous.sourceKey === options.sourceKey;
  let cursor = sameSource ? previous.nextCursor : 0;
  if (sameSource && previous.poolDigest !== poolDigest && previous.nextTermKey) {
    const fixed = new Set([...(options.broadTerms || []), ...(options.priorityTerms || [])].map(libraryIdentityKey));
    const pool = librarySearchPool(bible).filter(term => !fixed.has(libraryIdentityKey(term)));
    const next = pool.findIndex(term => libraryIdentityKey(term) === previous.nextTermKey);
    if (next >= 0) cursor = next;
  }
  const plan = buildLibrarySourceSearchPlan(bible, { ...options, cursor });
  plan.plannedAt = new Date().toISOString();
  plan.invocation = Number.isSafeInteger(previous?.invocation) ? previous.invocation + 1 : 0;
  await mkdir(dir, { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  // Atomic replacement preserves a valid cursor when the collector is stopped.
  try {
    await writeCollectionFile(temporary, JSON.stringify({schemaVersion:1, sourceKey:options.sourceKey, poolDigest, nextCursor:plan.nextCursor, nextTermKey:plan.nextTermKey, invocation:plan.invocation, updatedAt:new Date().toISOString()}));
    collectionSignal()?.throwIfAborted();
    renameSync(temporary, file);
  } finally { await rm(temporary, {force:true}); }
  sessions.getStore()?.plans.push(plan);
  return plan;
}

export async function librarySourceSearchTerms(bible, options) {
  return (await librarySourceSearchPlan(bible, options)).terms;
}

export function recordLibrarySearchResponse(url, options, response) {
  const session = sessions.getStore();
  if (!session || session.requests.length >= 2500) return;
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  const values = Object.fromEntries(parsed.searchParams);
  if (options.body instanceof URLSearchParams) Object.assign(values, Object.fromEntries(options.body));
  else if (typeof options.body === 'string') {
    try { Object.assign(values, JSON.parse(options.body)); } catch {}
  }
  const term = ['q','query','term','search','ch-query','productSearch','SearchTerm','Name','txtKeyword'].map(key => values[key]).find(value => typeof value === 'string' && value.trim());
  if (!term || term.length > 160) return;
  session.requests.push({term, requestedAt:new Date().toISOString(), url:parsed.href, status:response.status || 0, ok:response.ok === true});
}

export async function withLibrarySearchAudit(collect) {
  const session = { plans: [], requests: [] };
  return sessions.run(session, async () => {
    const result = await collect();
    return {...result, metadata:{...result.metadata, librarySearch:{schemaVersion:1, ...session}}};
  });
}

export async function rotateLibraryProductCandidates(candidates, {sourceKey, limit, cursorDir} = {}) {
  if (!sourceKey || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid product detail rotation');
  if (!candidates.length) return [];
  const dir = cursorDir || (process.env.NODE_TEST_CONTEXT ? path.join(tmpdir(), `bourbon-library-search-${process.pid}`) : path.resolve('out/cache/library-search'));
  const file = path.join(dir, `${hash(sourceKey).slice(0, 24)}.json`);
  let previous;
  try {previous = JSON.parse(await readFile(file,'utf8'));} catch(error) {if (error.code !== 'ENOENT') throw error;}
  const last = previous?.sourceKey === sourceKey ? candidates.findIndex(row => row.sku === previous.lastSku) : -1;
  const offset = last < 0 ? 0 : (last + 1) % candidates.length;
  const selected = Array.from({length:Math.min(limit,candidates.length)}, (_,i) => candidates[(offset+i)%candidates.length]);
  await mkdir(dir,{recursive:true});
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeCollectionFile(temporary,JSON.stringify({schemaVersion:1,sourceKey,lastSku:selected.at(-1).sku,updatedAt:new Date().toISOString()}));
    collectionSignal()?.throwIfAborted();renameSync(temporary,file);
  } finally {await rm(temporary,{force:true});}
  return selected;
}
