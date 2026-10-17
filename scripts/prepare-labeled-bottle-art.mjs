import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

// Asset export only: artwork creation/changes use the built-in image tool.
// Usage: node scripts/prepare-labeled-bottle-art.mjs reviewed-manifest.json
// Resolve sharp from the regular installation or the bundled workspace runtime.
const require = createRequire(import.meta.url);
const sharp = require(process.env.BOTTLE_ART_SHARP || 'sharp');
const root = path.resolve(import.meta.dirname, '..');
const retailerNames = JSON.parse(await readFile(path.join(root, 'shared/labeled-artwork-retailer-names.json'), 'utf8'));
const feedProducts = JSON.parse(await readFile(path.join(root, 'shared/labeled-feed-bottles.json'), 'utf8'));
const feedProvenance = JSON.parse(await readFile(path.join(root, 'apps/mobile/assets/bottles/labeled-v1/feed-provenance.json'), 'utf8'));
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const nativeDir = path.join(root, 'apps/mobile/assets/bottles/labeled-v1');
const publicDir = path.join(root, 'public/bottle-artwork');
const exportVersion = 'rgba-png-contain-400x600-v1';
let previous;
try { previous = JSON.parse(await readFile(path.join(nativeDir,'provenance.json'),'utf8')); } catch { /* First batch. */ }
const cache = new Map(previous?.exportVersion === exportVersion && previous?.sharpVersion === sharp.versions.sharp ? previous.assets.map(asset=>[asset.key,asset]) : []);
const seed = JSON.parse(await readFile(path.join(root, 'apps/mobile/src/cellar/bottle-catalog-seed.json'), 'utf8'));
seed.push(...JSON.parse(await readFile(path.join(root,'shared/labeled-owner-bottles.json'),'utf8')));
const entries = [], provenance = [], imports = [], seen = new Set();
if (!Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Expected a cumulative reviewed artwork manifest');
// Validate the whole manifest before writing. Never infer edition mappings from a shape.
for (const art of manifest.assets) {
  if (!/^[a-z0-9-]+$/.test(art.key) || seen.has(art.key) || art.reviewed !== true || !art.prompt || !art.reference || !Array.isArray(art.products) || !art.products.length) throw new Error('Missing reviewed artwork provenance');
  seen.add(art.key);
  const master = await readFile(art.path);
  const masterSha256 = hash(master);
  const cached = cache.get(art.key);
  let bytes;
  if (cached?.masterSha256 === masterSha256) {
    try {
      const candidate = await readFile(path.join(nativeDir,`${cached.sha256}.png`));
      if (hash(candidate) === cached.sha256 && candidate.readUInt32BE(16) === 400 && candidate.readUInt32BE(20) === 600 && candidate[25] === 6) bytes = candidate;
    } catch { /* Rebuild a missing or invalid cached export from its master. */ }
  }
  if (!bytes) {
    const meta = await sharp(master).metadata();
    const alpha = (await sharp(master).ensureAlpha().stats()).channels[3];
    if (!meta.hasAlpha || alpha.min !== 0 || alpha.max < 200) throw new Error(`${art.key}: transparent RGBA required`);
    bytes = await sharp(master).resize(400, 600, {fit: 'contain', background: {r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  }
  const sha256 = hash(bytes);
  for (const product of art.products) {
    const canonical = seed.find(row => row.id === product.id);
    if (!canonical || canonical.name !== product.name || entries.some(row => row.catalogId === product.id)) throw new Error(`${product.id}: exact unique catalog identity required`);
    const exactNames = [...new Set([product.name, ...(product.names || []), ...(retailerNames[product.id] || [])])];
    if (exactNames.length > 20 || exactNames.some(name => typeof name !== 'string' || !name.length || name.length > 240 || name !== name.trim() || /[\x00-\x1f]/.test(name))) throw new Error(`${product.id}: invalid reviewed name`);
    entries.push({catalogId: product.id, displayName: product.name, exactNames, sha256, width:400, height:600});
  }
  provenance.push({key:art.key, masterSha256, sha256, prompt:art.prompt, reference:art.reference, method:art.method, reviewed:true, reviewNotes:art.reviewNotes, ...(art.reuseReviews ? {reuseReviews:art.reuseReviews} : {}), bytes:bytes.length});
  imports.push({sha256, bytes});
}
// Feed-only editions are reviewed independently of catalog aliases. Their
// exported PNGs are source assets; rebuilding the catalog must retain them.
for (const product of feedProducts) {
  if (entries.some(row => row.catalogId === product.id)) throw new Error(`${product.id}: duplicate feed artwork identity`);
  const bytes = await readFile(path.join(nativeDir, `${product.sha256}.png`));
  if (hash(bytes) !== product.sha256) throw new Error(`${product.id}: feed artwork hash mismatch`);
  entries.push({catalogId:product.id,displayName:product.name,exactNames:[product.name,...product.names],sha256:product.sha256,width:400,height:600});
  if (!imports.some(asset => asset.sha256 === product.sha256)) {
    const reviewed = feedProvenance.assets.find(asset => asset.sha256 === product.sha256 && asset.reviewed === true);
    if (!reviewed) throw new Error(`${product.id}: reviewed feed artwork provenance required`);
    imports.push({sha256:product.sha256,bytes});
    provenance.push(reviewed);
  }
}
entries.sort((a,b) => a.catalogId.localeCompare(b.catalogId));
const namedHashes = new Map();
for (const entry of entries) for (const name of entry.exactNames) {
  const key = name.replace(/’/g,"'").replace(/\s+/g,' ').toLowerCase();
  if (namedHashes.has(key) && namedHashes.get(key) !== entry.sha256) throw new Error(`${name}: conflicting labeled artwork`);
  namedHashes.set(key,entry.sha256);
}
await mkdir(nativeDir, {recursive:true});
await mkdir(publicDir, {recursive:true});
for (const {sha256, bytes} of imports) {
  const nativePath = path.join(nativeDir,`${sha256}.png`), publicPath = path.join(publicDir,`${sha256}.png`);
  let nativeMatches = false, publicMatches = false;
  try { nativeMatches = bytes.equals(await readFile(nativePath)); } catch { /* New export. */ }
  try { publicMatches = bytes.equals(await readFile(publicPath)); } catch { /* New export. */ }
  if (!nativeMatches) await writeFile(nativePath,bytes);
  if (!publicMatches) await copyFile(nativePath,publicPath);
}
await writeFile(path.join(root, 'shared/labeled-bottle-artwork-registry.json'), JSON.stringify({schemaVersion:1, revision:hash(JSON.stringify(entries)), entries}, null, 2)+'\n');
const historical = (await Promise.all([1,2,3,4,5,6].map(async n => JSON.parse(await readFile(path.join(root, `apps/mobile/assets/bottles/label-free-v${n}/catalog.json`), 'utf8'))))).flatMap(batch => batch.products);
const captions = Object.fromEntries(historical.filter(row => row.presentation).map(row => [row.id, row.presentation === 'collection' ? 'Collection artwork · edition not specified' : 'Illustrative bottle · packaging not verified']));
for (const product of feedProducts) if (product.caption) captions[product.id] = product.caption;
captions['weller-antique-107'] = 'Antique 107 artwork · individual selection label varies';
captions.bb_70221e1cdb151a04 = 'Private Selection artwork · individual selection label varies';
for (const id of ['single-barrel-series-tier-3-finished-bourbon','rare-character-single-barrel-cbs-and-local-bartenders','brook-hill-13y-rye-whiskey-pear','travelers-club-blend-80']) captions[id] = 'Representative packaging · selection or vintage may vary';
await writeFile(path.join(root, 'shared/labeled-bottle-artwork-captions.json'), JSON.stringify(captions,null,2)+'\n');
await writeFile(path.join(nativeDir, 'provenance.json'), JSON.stringify({method:'Built-in image generation; transparent PNG export',exportVersion,sharpVersion:sharp.versions.sharp,assets:provenance}, null, 2)+'\n');
await writeFile(path.join(root, 'apps/mobile/src/components/labeled-artwork-assets.ts'), '// Generated by scripts/prepare-labeled-bottle-art.mjs.\nexport const LABELED_ARTWORK_ASSETS: Record<string, number> = {\n'+imports.map(({sha256}) => `  '${sha256}': require('../../assets/bottles/labeled-v1/${sha256}.png'),`).join('\n')+'\n};\n');
console.log(JSON.stringify({illustrations:imports.length, products:entries.length, bytes:imports.reduce((n,i)=>n+i.bytes.length,0)}));
