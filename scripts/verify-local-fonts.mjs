import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const metadata=JSON.parse(await readFile('public/fonts/sources.json','utf8'));
const css=(await readFile('src/app/fonts.css','utf8')).replaceAll('\r\n','\n');
const declarations=await readFile('src/lib/fonts.ts','utf8');
const families=[['Fraunces','Fraunces','fraunces','--font-playfair'],['Plus Jakarta Sans','Plus-Jakarta-Sans','plus-jakarta','--font-dm-sans'],['JetBrains Mono','JetBrains-Mono','jetbrains-mono','--font-jetbrains']];
assert.equal(metadata.files.length,16);assert.equal(metadata.preloads.length,4);
for(const file of metadata.files){
  assert.match(file.file,/^[a-z-]+-[a-f0-9]{16}\.woff2$/);
  const bytes=await readFile('public/fonts/'+file.file);
  assert.equal(bytes.toString('ascii',0,4),'wOF2');assert.equal(bytes.length,file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
}
for(const[family,source,slug,variable]of families){
  let original=(await readFile(`docs/source-evidence/local-fonts-20261031/${source}.css`,'utf8')).replaceAll('\r\n','\n');
  for(const file of metadata.files.filter(file=>file.family===family))original=original.split(file.source).join('/fonts/'+file.file);
  assert.ok(css.includes(original),family+' must retain every original weight, style and unicode range');
  assert.ok(css.includes(`.font-${slug} { ${variable}: '${family}', '${family} Fallback'; }`));
  assert.ok(declarations.includes(`variable: 'font-${slug}'`));
  assert.match(await readFile(`public/fonts/LICENSE-${slug}.txt`,'utf8'),/SIL OPEN FONT LICENSE/);
}
for(const href of metadata.preloads){assert.ok(metadata.files.some(file=>href==='/fonts/'+file.file));assert.ok(declarations.includes(JSON.stringify(href)));}
assert.doesNotMatch(css,/https?:\/\/fonts\.(?:googleapis|gstatic)\.com/);
assert.doesNotMatch(declarations,/next\/font\/google/);
console.log('Local fonts verified:16 byte-identical WOFF2 resources, original faces/unicode ranges, three licenses and four Latin preloads. No Google font request is required at build time.');
