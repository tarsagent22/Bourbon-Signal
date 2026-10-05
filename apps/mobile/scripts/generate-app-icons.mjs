// Package the owner-approved B06 raster without redesigning the selected mark.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const asset = (name) => resolve(root, 'assets', name);
const source = asset('heritage-b-master.png');
const background = { r: 243, g: 234, b: 217, alpha: 1 };
await sharp(source).resize(1024, 1024).removeAlpha().png().toFile(asset('icon.png'));
await sharp(source).resize(48, 48).removeAlpha().png().toFile(asset('favicon.png'));

// Android supplies its own launcher mask. Keep the complete approved silhouette
// inside the central safe area, with a transparent foreground and themed mask.
const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
const mono = Buffer.alloc(rgba.length);
for (let p = 0; p < info.width * info.height; p++) {
  const luminance = (data[p * 3] + data[p * 3 + 1] + data[p * 3 + 2]) / 3;
  const alpha = Math.round(Math.max(0, Math.min(1, (225 - luminance) / 160)) * 255);
  rgba.set([73, 48, 36, alpha], p * 4);
  mono.set([255, 255, 255, alpha], p * 4);
}
const raw = { width: info.width, height: info.height, channels: 4 };
const splash=Buffer.from(mono);
for(let p=0;p<info.width*info.height;p++){splash[p*4]=243;splash[p*4+1]=234;splash[p*4+2]=217;}
await sharp(splash,{raw}).resize(512,512).png().toFile(asset('splash-icon.png'));
const foreground = await sharp(rgba, { raw }).resize(352, 352).png().toBuffer();
const monochrome = await sharp(mono, { raw }).resize(300, 300).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background } }).png().toFile(asset('android-icon-background.png'));
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } }).composite([{ input: foreground, left: 80, top: 80 }]).png().toFile(asset('android-icon-foreground.png'));
await sharp({ create: { width: 432, height: 432, channels: 4, background: '#00000000' } }).composite([{ input: monochrome, left: 66, top: 66 }]).png().toFile(asset('android-icon-monochrome.png'));
const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const manifest = JSON.parse(await readFile(asset('brand-assets.json'), 'utf8'));
manifest.source = { path: 'apps/mobile/assets/heritage-b-master.png', sha256: await sha(source), concept: 'B06 Heritage B', approval: 'Owner selected this exact artwork on 2026-10-04' };
for (const name of Object.keys(manifest.assets)) {
  const m = await sharp(asset(name)).metadata();
  manifest.assets[name] = { sha256: await sha(asset(name)), width: m.width, height: m.height, mode: m.hasAlpha ? 'RGBA' : 'RGB' };
}
await writeFile(asset('brand-assets.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Packaged approved Heritage B launcher icons; Heritage B splash packaged; notification artwork preserved.');
