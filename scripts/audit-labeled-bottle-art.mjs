import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const registry = await json('shared/labeled-bottle-artwork-registry.json');
const covered = new Set(registry.entries.map(row => row.catalogId));
const historical = (await Promise.all([1,2,3,4,5,6].map(n => json(`apps/mobile/assets/bottles/label-free-v${n}/catalog.json`)))).flatMap(batch => batch.products);
const sourceByShape = await readFile(path.join(root, 'apps/mobile/src/components/label-free-artwork-assets.ts'), 'utf8');
const sources = new Map([...sourceByShape.matchAll(/'([^']+)': require\('([^']+)'\)/g)].map(match => [match[1],path.posix.normalize(`apps/mobile/src/components/${match[2]}`)]));
for (const row of registry.entries) {
  const native = await readFile(path.join(root, `apps/mobile/assets/bottles/labeled-v1/${row.sha256}.png`));
  const web = await readFile(path.join(root, `public/bottle-artwork/${row.sha256}.png`));
  if (createHash('sha256').update(native).digest('hex') !== row.sha256 || !native.equals(web)) throw new Error(`${row.catalogId}: native/web bytes must match registry`);
  if (native.readUInt32BE(16) !== 400 || native.readUInt32BE(20) !== 600 || native[25] !== 6) throw new Error(`${row.catalogId}: 400x600 RGBA required`);
}
const pending = historical.filter(row => !covered.has(row.id)).map(row => ({
  id:row.id, name:row.name, exactNames:[row.name,...(row.names || [])],
  shapeReference:sources.get(row.shape),
  status:'needs-labeled-artwork',
  instruction:'Verify this exact expression label against producer/reference images, preserve current glass rendering and silhouette, generate an individual transparent labeled illustration, inspect before mapping. A shared glass shape does not approve shared labels.',
}));
const summary = {scope:historical.length, labeled:historical.length-pending.length, illustrations:new Set(registry.entries.map(row=>row.sha256)).size, remaining:pending.length, complete:pending.length===0};
await mkdir(path.join(root,'.operator'), {recursive:true});
await writeFile(path.join(root,'.operator/labeled-artwork-backlog.json'), JSON.stringify({summary,pending}, null, 2)+'\n');
console.log(JSON.stringify(summary));
if (process.argv.includes('--require-complete') && pending.length) process.exitCode = 1;
