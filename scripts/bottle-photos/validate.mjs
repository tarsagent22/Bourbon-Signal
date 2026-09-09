import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { STATUSES, checkLedger, requireValue as need, validDate, readJson, writeJson, externalOutput } from './inventory.mjs';
const text = x => typeof x === 'string' && x.trim().length > 0;
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
function url(value, hosts = null) {
  need(text(value) && value === value.trim() && !/[\s\\]/.test(value), 'invalid URL');
  let u; try { u = new URL(value); } catch { throw new Error('invalid URL'); }
  need(u.protocol === 'https:' && !u.username && !u.password && !u.hash && (!u.port || u.port === '443'), 'URL must be credential-free HTTPS');
  const host = u.hostname;
  need(!isIP(host) && !host.includes(':') && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && host.includes('.') && !host.endsWith('.') && !host.includes('..') &&
    !/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host), 'URL must use a public DNS hostname');
  if (hosts) need(hosts.includes(host) && !u.search, 'publication URL must be query-free on explicit first-party host');
  return u;
}
function review(value, label) {
  need(value?.disposition === 'approved' && text(value.reviewer) && validDate(value.date), `missing approved ${label} review`);
}
export function buildRegistry(ledger, records, allowedHosts) {
  checkLedger(ledger); need(Array.isArray(records), 'records must be an array');
  need(Array.isArray(allowedHosts) && allowedHosts.length > 0, 'explicit first-party hosts required');
  for (const host of allowedHosts) { need(typeof host === 'string', 'invalid host'); need(url(`https://${host}/`).hostname === host, 'host must be exact lowercase DNS name'); }
  const byId = new Map(ledger.items.map(row => [row.id, row]));
  const registry = Object.create(null), artworks = new Set();
  for (const r of records) {
    need(r && STATUSES.includes(r.status), 'invalid record status');
    if (!['ready', 'published'].includes(r.status)) continue;
    need(typeof r.artworkId === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(r.artworkId) && !artworks.has(r.artworkId), 'invalid/duplicate artworkId');
    artworks.add(r.artworkId);
    need(Array.isArray(r.catalogIds) && r.catalogIds.length > 0 && new Set(r.catalogIds).size === r.catalogIds.length, 'explicit unique catalog IDs required');
    review(r.identity, 'identity'); need(text(r.identity.scope), 'exact product/edition/packaging scope required');
    need(r.identity.catalogHashes && Object.keys(r.identity.catalogHashes).length === r.catalogIds.length, 'identity must bind every exact catalog hash');
    for (const id of r.catalogIds) {
      const item = byId.get(id);
      need(item?.present && !item.requiresReview && ['ready', 'published'].includes(item.status) && r.identity.catalogHashes[id] === item.catalogHash, `unknown, stale or unresolved identity: ${id}`);
      need(!Object.hasOwn(registry, id), `duplicate mapping: ${id}`);
    }
    review(r.rights, 'rights');
    need(text(r.rights.evidence) && text(r.rights.license) && r.rights.permitsRedistribution === true && r.rights.permitsDerivatives === true, 'explicit rights evidence and permissions required');
    need(r.provenance && text(r.provenance.publisher) && validDate(r.provenance.downloadedAt) && ['photo', 'supplied_mockup'].includes(r.provenance.assetType), 'incomplete provenance');
    url(r.provenance.sourcePage); url(r.provenance.sourceAssetUrl);
    need(sha(r.originalSha256) && sha(r.processedSha256), 'SHA-256 must be lowercase hex');
    need(r.identity.processedSha256 === r.processedSha256 && r.rights.processedSha256 === r.processedSha256, 'identity and rights approvals must bind processed hash');
    need(r.recipeVersion === 'rgba-pad-v1', 'unsupported processing recipe');
    need(r.image?.valid === true && r.image.decoded === true && r.image.format === 'PNG' && r.image.width === 400 && r.image.height === 600 && r.image.sha256 === r.processedSha256, 'invalid decoded derivative');
    review(r.visualReview, 'visual'); need(r.visualReview.processedSha256 === r.processedSha256, 'visual review must bind processed hash');
    need(r.publication?.verified === true && validDate(r.publication.verifiedAt) && r.publication.sha256 === r.processedSha256, 'publication readback evidence required');
    const publishedUrl = url(r.publication.url, allowedHosts);
    need(publishedUrl.pathname.endsWith(`/${r.processedSha256}.png`), 'publication path must end in content digest.png');
    for (const id of r.catalogIds) registry[id] = { artworkId: r.artworkId, revision: r.processedSha256, url: r.publication.url, width: 400, height: 600 };
  }
  return Object.fromEntries(Object.keys(registry).sort().map(id => [id, registry[id]]));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [ledgerFile, recordsFile, output, hosts, ...extra] = process.argv.slice(2);
    need(ledgerFile && recordsFile && output && hosts && !extra.length, 'usage: node validate.mjs LEDGER PRIVATE_RECORDS PUBLIC_OUTPUT HOST[,HOST]');
    need(![ledgerFile, recordsFile].some(p => path.resolve(p).toLowerCase() === path.resolve(output).toLowerCase()), 'output must not overwrite input');
    externalOutput(output);
    const registry = buildRegistry(readJson(ledgerFile), readJson(recordsFile), hosts.split(','));
    writeJson(output, registry); console.log(JSON.stringify({ approvedCatalogRecords: Object.keys(registry).length }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
