import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
const page=readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx',import.meta.url),'utf8');
test('whole-account sheet is wired independently of filters and reset by account key',()=>{
 assert.match(page,/collectionStatistics\(sourceBottles\)/);
 assert.match(page,/<CollectionStatisticsSheet/);
 assert.match(page,/key=\{userId/);
 assert.match(page,/accessibilityLabel="Collection Statistics" accessibilityRole="button"/);
});
test('keyed account UI preserves parent API identity guard and cancels stale load continuations',()=>{
 const parent=page.slice(page.indexOf('export default function CellarScreen'),page.indexOf('function AccountCellarScreen'));
 assert.match(parent,/const api = useMobileApi\(\)/);
 assert.match(parent,/api=\{api\}/);
 assert.match(page,/mounted\.current = false/);
 assert.match(page,/if \(!mounted\.current \|\| activeUser\.current !== userId/);
});
test('statistics native sheet uses existing modal with scroll close back and focus',()=>{
 const file=new URL('../components/CollectionStatisticsSheet.tsx',import.meta.url);
 assert.ok(existsSync(file),'native statistics sheet exists');const s=readFileSync(file,'utf8');
 for(const token of ['onRequestClose','ScrollView','accessibilityViewIsModal','setAccessibilityFocus','onShow','Collection worth','Coming later','No verified distillery data','rated entries','Top Rated'])assert.ok(s.includes(token),token);
});
