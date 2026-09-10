import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';
const page=readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx',import.meta.url),'utf8');
const cabinet=readFileSync(new URL('../components/ShelfCabinet.tsx',import.meta.url),'utf8');
test('polish uses inset tabs, larger image zone, lighter titles and search/filter icons',()=>{
 assert.match(page,/name="magnify"/);assert.match(page,/name="tune-variant"/);
 assert.match(page,/tileArt: \{ height: 84/);assert.match(page,/fontWeight: "400", textAlign: "center"/);
 assert.match(page,/padding: 3, borderWidth: StyleSheet.hairlineWidth/);
});
test('cabinet offers Shelf Style and guards heading measurements',()=>{
 assert.match(cabinet,/Shelf Style/);assert.doesNotMatch(cabinet,/Edit Shelf/);
 assert.match(cabinet,/Number.isFinite\(height\) && height > 0/);
 assert.match(cabinet,/slots <= 6 \? 70 : 80/);
});
