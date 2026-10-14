import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoMercator, geoConicEqualArea, geoPath } from 'd3-geo';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const states = feature(JSON.parse(readFileSync('node_modules/us-atlas/states-10m.json')), JSON.parse(readFileSync('node_modules/us-atlas/states-10m.json')).objects.states).features;
const names = Object.fromEntries([...readFileSync('shared/coverage-states.ts','utf8').matchAll(/\["([A-Z]{2})", "([^"]+)"\]/g)].map(m=>[m[2],m[1]]));
const dir='apps/mobile/assets/onboarding-states'; mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}); const page=await browser.newPage({viewport:{width:320,height:200}});
const imports=[];
for (const state of states) {
 const code=names[state.properties.name]; if(!code) continue;
 // Fit actual geographic boundaries; Alaska uses a local conic projection across the date line.
 const projection=(code === 'AK' ? geoConicEqualArea().rotate([154,0]).center([0,62]).parallels([55,65]) : geoMercator()).fitExtent([[10,10],[310,190]],state); const d=geoPath(projection)(state);
 await page.setContent(`<html style="background:transparent"><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><path d="${d}" fill="#303929" stroke="#C4A371" stroke-width="2" /></svg></body></html>`);
 await page.screenshot({path:`${dir}/${code}.png`,omitBackground:true}); imports.push(`  ${code}: require('../../assets/onboarding-states/${code}.png'),`);
}
await browser.close();
writeFileSync('apps/mobile/src/onboarding/state-outlines.ts',`// Census-derived boundaries from us-atlas/states-10m.json. Geographic outlines, not coverage heatmaps.\nexport const STATE_OUTLINES: Record<string, number> = {\n${imports.join('\n')}\n};\n`);
console.log(`${imports.length} geographic outlines generated`);
