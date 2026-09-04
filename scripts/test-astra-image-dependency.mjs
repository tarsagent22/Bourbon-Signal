import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
test('supported Next 15 patch and patched libvips are locked', () => {
  assert.equal(lock.packages['node_modules/next'].version, '15.5.25');
  assert.match(lock.packages['node_modules/sharp'].version, /^0\.35\./);
});
test('real image optimizer dependency can encode and decode a thumbnail', async () => {
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#884422' } }).png().toBuffer();
  const result = await sharp(image).resize(12, 12).webp().toBuffer();
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 12);
  assert.equal(metadata.height, 12);
  assert.equal(metadata.format, 'webp');
});
