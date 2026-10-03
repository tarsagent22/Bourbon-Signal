import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';
const page=readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx',import.meta.url),'utf8');
const cabinet=readFileSync(new URL('../components/ShelfCabinet.tsx',import.meta.url),'utf8');
test('polish keeps the image zone and readable titles with quieter search/filter controls',()=>{
 assert.match(page,/name="magnify"/);assert.match(page,/name="tune-variant"/);
 assert.match(page,/tileArt: \{ height: 84/);assert.match(page,/fontWeight: "400", textAlign: "center"/);
 assert.match(page,/collectionTabs: \{[^\n]*borderBottomWidth: StyleSheet.hairlineWidth/);
});
test('showcase has one default appearance and flowing headings',()=>{
 assert.doesNotMatch(cabinet,/Ledge finish|Customize highlights|<Modal/);
 assert.doesNotMatch(cabinet,/onStyle|shelfStyle/);
 assert.match(cabinet,/flexWrap: 'wrap'/);
 assert.doesNotMatch(cabinet,/headingHeight|photoScale|cabinetAssets/);
});
