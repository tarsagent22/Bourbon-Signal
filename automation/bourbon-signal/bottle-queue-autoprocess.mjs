#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.hermes', 'bourbon-signal', 'bottle-queue');
const OUT_FILE = path.join(OUT_DIR, 'latest-autoprocess.json');
const BASE_URL = process.env.BOURBON_SIGNAL_LIVE_BASE_URL || 'https://www.bourbonsignal.com';
const TOKEN = process.env.BOTTLE_QUEUE_WORKER_TOKEN || process.env.BOURBON_SIGNAL_BOTTLE_QUEUE_TOKEN || '';

function normalize(value) { return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
export function classifyBottleQueueItem(item = {}) {
  const confidence = item.confidence || 'none';
  const duplicateCount = Number(item.duplicateCount || 0);
  const hasCandidate = Boolean(item.candidateBottleName || item.candidateBottleId);
  if (confidence === 'high' && hasCandidate) return { action: 'auto_match_existing', safe: true, status: 'matched_existing', reason: `High-confidence Bottle Bible match: ${item.candidateBottleName}` };
  if (confidence === 'medium' && duplicateCount >= 3 && hasCandidate) return { action: 'needs_human_priority', safe: false, status: 'needs_human', reason: `Repeated medium-confidence possible match: ${item.candidateBottleName}` };
  if (duplicateCount >= 3) return { action: 'needs_human_priority', safe: false, status: 'needs_human', reason: 'Repeated unknown bottle request.' };
  if (/\b(test|asdf|qwerty|fake bottle|sample)\b/i.test(item.rawName || '')) return { action: 'ignore_spam_or_test', safe: true, status: 'ignored', reason: 'Looks like test/spam input.' };
  return { action: 'leave_for_review', safe: false, status: null, reason: 'No safe deterministic action.' };
}
async function callWorker(method = 'GET', body = null) {
  if (!TOKEN) throw new Error('Missing BOTTLE_QUEUE_WORKER_TOKEN / BOURBON_SIGNAL_BOTTLE_QUEUE_TOKEN.');
  const headers = { authorization: `Bearer ${TOKEN}` };
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(new URL('/api/bottle-contributions/worker', BASE_URL), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`Worker ${method} failed ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

function compactAmbiguity(rows) {
  const items = rows
    .filter((row) => !row.recommendation.safe)
    .slice(0, 12)
    .map((row) => ({ id: String(row.id || '').slice(0, 160), action: row.recommendation.action, reason: row.recommendation.reason }));
  return items.length ? { type: 'bottle_queue_ambiguity', count: items.length, items } : null;
}

function publicRow(item, recommendation) {
  return {
    id: typeof item?.id === 'string' ? item.id.slice(0, 160) : '',
    normalizedKey: normalize(item?.rawName),
    candidateBottleId: typeof item?.candidateBottleId === 'string' ? item.candidateBottleId.slice(0, 160) : undefined,
    candidateBottleName: typeof item?.candidateBottleName === 'string' ? item.candidateBottleName.slice(0, 160) : undefined,
    confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : undefined,
    recommendation,
  };
}

export async function processBottleQueue({ digest = [], apply = false, update = async () => ({ ok: true }) } = {}) {
  const rows = (Array.isArray(digest) ? digest : []).map((item) => publicRow(item, classifyBottleQueueItem(item)));
  const applied = [];
  if (apply) {
    for (const [index, row] of rows.entries()) {
      const rec = row.recommendation;
      if (!rec.safe || !rec.status) continue;
      const source = digest[index] || {};
      const result = await update({ id: row.id, status: rec.status, candidateBottleId: source.candidateBottleId, candidateBottleName: source.candidateBottleName, confidence: source.confidence, notes: rec.reason });
      applied.push({ id: row.id, action: rec.action, status: rec.status, ok: result.ok === true });
    }
  }
  return { ok: true, hasWork: rows.length > 0, count: rows.length, apply, applied, rows, ambiguity: compactAmbiguity(rows) };
}

export async function runBottleQueue(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  await mkdir(OUT_DIR, { recursive: true });
  const fetched = await callWorker('GET');
  const payload = { checkedAt: new Date().toISOString(), ...(await processBottleQueue({
    digest: Array.isArray(fetched.digest) ? fetched.digest : [],
    apply,
    update: (body) => callWorker('PATCH', body),
  })) };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  if (payload.ambiguity) process.stdout.write(`${JSON.stringify(payload.ambiguity)}\n`);
  return payload;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  runBottleQueue().catch(async (error) => {
    await mkdir(OUT_DIR, { recursive: true });
    const payload = { ok: false, checkedAt: new Date().toISOString(), error: error.message };
    await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
    console.error(error.message);
    process.exitCode = 1;
  });
}
