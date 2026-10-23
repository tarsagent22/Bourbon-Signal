import { realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reviewShopifyOnboardingBatch } from './lib/shopify-batch-onboarding.mts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_BYTES = 32 * 1024 * 1024;
type Options = { root?: string; manifestFile?: string; catalogFile?: string; classificationFile?: string; captureManifestFiles?: string[] };

/** Local, bounded evidence loading. No credentials, environment reads or HTTP. */
export async function loadShopifyBatchInputs(options: Options = {}) {
  const root = options.root || ROOT;
  let loaded = 0;
  const boundedRead = async (file: string, limit: number) => {
    const { open } = await import('node:fs/promises');
    const handle = await open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > limit || loaded + stat.size > MAX_BYTES) throw new Error('Evidence input exceeds bounded file budget');
      const bytes = Buffer.alloc(stat.size + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead !== stat.size) throw new Error('Evidence changed or exceeded its declared file size');
      loaded += bytesRead;
      return bytes.subarray(0, bytesRead);
    } finally { await handle.close(); }
  };
  const manifestBytes = await boundedRead(resolve(root, options.manifestFile || 'engine/data/shopify-pickup-onboarding-cohort-v3.json'), 256 * 1024);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const catalogBytes = await boundedRead(resolve(root, options.catalogFile || 'engine/test/fixtures/shopify-variant-pickup/current-bourbon-bible.json'), 2 * 1024 * 1024);
  const classificationBytes = await boundedRead(resolve(root, options.classificationFile || 'src/data/drop-feed-classification.generated.json'), 2 * 1024 * 1024);
  // Pin the implementation actually imported by this tool, never a path or hash
  // supplied by a candidate manifest. The module verifies the manifest's pin.
  const collectorBytes = await boundedRead(fileURLToPath(new URL('../engine/src/collectors/shopify-variant-pickup.mjs', import.meta.url)), 128 * 1024);
  const premisesIdentityBytes = await boundedRead(fileURLToPath(new URL('../engine/src/collectors/shopify-premises-identity.mjs', import.meta.url)), 128 * 1024);
  const files = options.captureManifestFiles || ['engine/test/fixtures/shopify-variant-pickup/v3/manifest.json'];
  if (!files.length || files.length > 4 || new Set(files).size !== files.length) throw new Error('One to four distinct capture manifests required');
  const wanted = new Set<string>();
  if (!Array.isArray(manifest.sources) || manifest.sources.length > 10) throw new Error('Bounded source manifest required');
  for (const source of manifest.sources) {
    if (!Array.isArray(source?.products) || source.products.length > 2) throw new Error('Bounded reviewed products required');
    for (const product of source.products) for (const kind of ['product', 'pickup']) {
      const url = product?.evidence?.[kind]?.url;
      if (typeof url === 'string') wanted.add(url);
    }
  }
  const captures = [];
  for (const file of files) {
    const captureFile = resolve(root, file), container = await realpath(dirname(captureFile));
    const metadata = JSON.parse((await boundedRead(captureFile, 1024 * 1024)).toString('utf8'));
    if (!Array.isArray(metadata.captures) || metadata.captures.length > 100) throw new Error('Bounded capture metadata required');
    for (const entry of metadata.captures) {
      const url = entry?.requestedUrl || entry?.url;
      if (!wanted.has(url)) continue;
      // Evidence cannot make the runner read a private sibling or arbitrary path.
      if (typeof entry.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}$/u.test(entry.file) || basename(entry.file) !== entry.file) throw new Error('Capture file must be a simple local basename');
      const path = await realpath(resolve(container, entry.file)), child = relative(container, path);
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Capture file escapes its evidence directory');
      const raw = await boundedRead(path, 2 * 1024 * 1024);
      captures.push({ url, finalUrl: entry.finalUrl, status: entry.status, capturedAt: entry.capturedAt, sha256: entry.sha256, bytes: entry.bytes, body: raw });
    }
  }
  return { manifest, collectorBytes, premisesIdentityBytes, catalogBytes, classificationBytes, captures };
}

export async function prepareShopifyOnboarding(options: Options = {}) {
  return reviewShopifyOnboardingBatch(await loadShopifyBatchInputs(options));
}

async function main() {
  const values = new Map<string, string[]>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--(manifest|catalog|classification|captures|out)=(.+)$/u.exec(argument);
    if (!match || (match[1] !== 'captures' && values.has(match[1]))) throw new Error('Use --manifest=, --catalog=, --classification=, repeated --captures=, and --out=. No live/activation mode exists.');
    values.set(match[1], [...(values.get(match[1]) || []), match[2]]);
  }
  const destination = values.get('out')?.[0];
  if (!destination) throw new Error('An explicit --out= report path is required; existing reports are never overwritten');
  const report = await prepareShopifyOnboarding({ manifestFile: values.get('manifest')?.[0], catalogFile: values.get('catalog')?.[0], classificationFile: values.get('classification')?.[0], captureManifestFiles: values.get('captures') });
  const output = resolve(destination);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ report: output, scope: report.scope, counts: report.counts, accepted: report.accepted, activated: report.activated }));
  if (report.counts.fixtureCompatibleSources !== report.counts.sources || report.blockers.length) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(() => {
  console.error('Shopify onboarding preparation failed closed; no source activated and no existing report overwritten.');
  process.exitCode = 1;
});
