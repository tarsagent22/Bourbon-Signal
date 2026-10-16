// Persist only candidates already compared visually with the exact label reference.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root,'.operator/labeled-art-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
const candidates = JSON.parse(await readFile(process.argv[2],'utf8'));
const historical = (await Promise.all([1,2,3,4,5,6].map(async n=>JSON.parse(await readFile(path.join(root,`apps/mobile/assets/bottles/label-free-v${n}/catalog.json`),'utf8'))))).flatMap(batch=>batch.products);
historical.push(...JSON.parse(await readFile(path.join(root,'shared/labeled-owner-bottles.json'),'utf8')));
const knownIds = new Set(manifest.assets.flatMap(asset=>asset.products.map(p=>p.id)));
for (const candidate of candidates) {
  if (candidate.reviewed !== true || !candidate.reviewNotes?.trim() || !candidate.reference || !candidate.prompt || !candidate.path) throw new Error(`${candidate.id}: explicit completed visual review required`);
  if (knownIds.has(candidate.id)) throw new Error(`${candidate.id}: already accepted; use a deliberate replacement review`);
  const product = historical.find(p=>p.id===candidate.id);
  if (!product) throw new Error(`${candidate.id}: unknown exact catalog identity`);
  knownIds.add(candidate.id);
  const key = candidate.id.replaceAll('_','-');
  const masterPath = path.join(root,`.operator/artwork-masters/${key}.png`);
  await mkdir(path.dirname(masterPath),{recursive:true});
  await copyFile(candidate.path,masterPath);
  manifest.assets.push({key,path:masterPath,reviewed:true,products:[{id:product.id,name:product.name,...(product.names?{names:product.names}:{})}],prompt:candidate.prompt,reference:candidate.reference,method:'Built-in image edit; existing illustration target and actual product label reference',reviewNotes:candidate.reviewNotes});
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
execFileSync(process.execPath,[path.join(root,'scripts/prepare-labeled-bottle-art.mjs'),manifestPath],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/audit-labeled-bottle-art.mjs')],{cwd:root,stdio:'inherit'});
