// Export explicitly reviewed library illustrations and retain their provenance.
// Image creation/edits use the built-in image tool; this only sizes the final PNG.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = new URL('../', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const write = (file, value) => writeFile(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const seed = await read('apps/mobile/src/cellar/bottle-catalog-seed.json');
const registry = await read('shared/labeled-bottle-artwork-registry.json');
const provenance = await read('apps/mobile/assets/bottles/labeled-v1/provenance.json');
let additions = [], retained = { assets: [] };
try { additions = await read('shared/labeled-library-bottles.json'); retained = await read('apps/mobile/assets/bottles/labeled-v1/library-provenance.json'); } catch { /* First reviewed batch. */ }
let imports = await readFile(new URL('apps/mobile/src/components/labeled-artwork-assets.ts', root), 'utf8');
for (const job of jobs) {
  const bottle = seed.find(b => b.id === job.id);
  if (!bottle || job.reviewed !== true || !job.prompt || !job.reference?.startsWith('https://') || !job.reviewNotes) throw new Error('Exact identity, producer reference and completed visual review required');
  if (registry.entries.some(b => b.catalogId === bottle.id) && !additions.some(b => b.id === bottle.id)) throw new Error('Existing artwork requires a separate replacement review');
  const master = await readFile(job.path);
  const meta = await sharp(master).metadata();
  const alpha = (await sharp(master).stats()).channels[3];
  if (!meta.hasAlpha || alpha.min !== 0 || alpha.max < 200) throw new Error(`${job.id}: transparent RGBA required`);
  const bytes = await sharp(master).resize(400, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const sha256 = hash(bytes), native = `apps/mobile/assets/bottles/labeled-v1/${sha256}.png`;
  await writeFile(new URL(native, root), bytes);
  await copyFile(new URL(native, root), new URL(`public/bottle-artwork/${sha256}.png`, root));
  const row = { id: bottle.id, name: bottle.name, names: [], sha256, reference: job.reference };
  additions = [...additions.filter(b => b.id !== bottle.id), row];
  registry.entries = [...registry.entries.filter(b => b.catalogId !== bottle.id), { catalogId: bottle.id, displayName: bottle.name, exactNames: [bottle.name], sha256, width: 400, height: 600 }];
  const evidence = { key: bottle.id, masterSha256: hash(master), sha256, prompt: job.prompt, reference: job.reference, ...(job.referenceImage?.startsWith('https://') ? { referenceImage: job.referenceImage } : {}), method: 'Built-in image generation from verified packaging reference; transparent PNG export', reviewed: true, reviewNotes: job.reviewNotes, bytes: bytes.length };
  retained.assets = [...retained.assets.filter(b => b.key !== bottle.id), evidence];
  provenance.assets = [...provenance.assets.filter(b => b.key !== bottle.id), evidence];
  if (!imports.includes(`'${sha256}'`)) imports = imports.replace(/\n};\s*$/, `\n  '${sha256}': require('../../assets/bottles/labeled-v1/${sha256}.png'),\n};\n`);
}
registry.entries.sort((a, b) => a.catalogId.localeCompare(b.catalogId));
registry.revision = hash(JSON.stringify(registry.entries));
await write('shared/labeled-library-bottles.json', additions);
await write('shared/labeled-bottle-artwork-registry.json', registry);
await write('apps/mobile/assets/bottles/labeled-v1/library-provenance.json', retained);
await write('apps/mobile/assets/bottles/labeled-v1/provenance.json', provenance);
await writeFile(new URL('apps/mobile/src/components/labeled-artwork-assets.ts', root), imports);
console.log(JSON.stringify({ reviewedLibraryImages: additions.length, registryEntries: registry.entries.length }));
