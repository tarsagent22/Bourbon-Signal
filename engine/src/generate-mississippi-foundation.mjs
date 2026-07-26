#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importMississippiPackageDirectory } from './discovery/mississippi-package-directory.mjs';
import { buildMississippiSourceAtlas, validateMississippiSourceAtlas } from './discovery/source-atlas.mjs';
import { summarizeMississippiSourceHealth } from './mississippi-source-health.mjs';

function argValue(flag, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function writeGeneratedJson(filePath, value) {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, resolved);
}

const capturePath = path.resolve(argValue('--capture', path.join('data', 'source-captures', 'MS-package-retailers-2026-07-26.json')));
const programPath = path.resolve(argValue('--program', path.join('..', 'src', 'config', 'mississippi-program.json')));
const universePath = path.resolve(argValue('--universe', path.join('data', 'store-universe', 'MS.json')));
const atlasPath = path.resolve(argValue('--atlas', path.join('data', 'source-atlas', 'MS.json')));
const healthPath = path.resolve(argValue('--health', path.join('data', 'source-health', 'MS.json')));

const [capture, program] = await Promise.all([
  readFile(capturePath, 'utf8').then(JSON.parse),
  readFile(programPath, 'utf8').then(JSON.parse),
]);
const universe = importMississippiPackageDirectory(capture, program);
const atlas = buildMississippiSourceAtlas(universe);
const summary = validateMississippiSourceAtlas(atlas);
const health = summarizeMississippiSourceHealth({ atlas, generatedAt: universe.generatedAt });
await writeGeneratedJson(universePath, universe);
await writeGeneratedJson(atlasPath, atlas);
await writeGeneratedJson(healthPath, health);
console.log(JSON.stringify({
  universePath,
  atlasPath,
  healthPath,
  stores: universe.stores.length,
  cities: universe.summary.cityCount,
  counties: universe.summary.countyCount,
  regions: universe.summary.regionCount,
  sourceAtlas: summary,
}, null, 2));
