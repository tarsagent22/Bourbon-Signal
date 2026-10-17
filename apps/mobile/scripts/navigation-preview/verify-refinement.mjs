import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve(import.meta.dirname,'../../../../.operator/check-refinement-qa');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.NAVIGATION_PREVIEW_URL||'http://127.0.0.1:5271';const results=[];
async function search(p,name){await p.getByRole('radio',{name:'Search by name'}).click();await p.getByRole('textbox',{name:'Search bottles',exact:true}).fill(name);await p.getByRole('button',{name:`Check ${name}`,exact:true}).click();await p.getByTestId('bottle-assessment-score').waitFor();}
async function visibleDock(p){const box=await p.getByRole('button',{name:'Scan another',exact:true}).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=852,'scan action stays in viewport');}
try{
 for(const width of [393,320]){
  const p=await browser.newPage({viewport:{width,height:852},reducedMotion:'reduce'});const errors=[];p.on('pageerror',error=>errors.push(error.message));
  await p.goto(base+'/navigation-preview/?screen=home');await p.getByRole('button',{name:'Bottle Check: scan or search a bottle'}).click();
  const help=p.getByRole('button',{name:'Dismiss Bottle Check tips'});if(await help.count())await help.click();
  await search(p,"Blanton's Gold Bourbon");await p.getByText('$149.95 reference',{exact:true}).waitFor();
  const score=await p.getByTestId('bottle-assessment-score').innerText();assert.ok(Number(score)>60);
  const words=(await p.locator('body').innerText()).split(/\s+/).length;assert.ok(words<140,'default result has concise copy');
  assert.equal(await p.getByText(/Request coverage|Set up alerts for this region|Get help with this check/).count(),0);
  assert.equal(await p.getByText(/weights never change/i).count(),0,'methodology starts collapsed');await visibleDock(p);
  const price=p.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'});await price.fill('79.99');await p.getByText('Good buy at this price',{exact:true}).waitFor();assert.equal(await p.getByTestId('bottle-assessment-score').innerText(),score);
  await price.fill('400');await p.getByText('Steep price premium',{exact:true}).waitFor();assert.equal(await p.getByTestId('bottle-assessment-score').innerText(),score);
  await p.getByRole('button',{name:/^Why this score/}).click();await p.getByRole('link',{name:'Open Release context',exact:true}).waitFor();await visibleDock(p);
  await p.getByRole('button',{name:/^Why this score/}).click();await p.screenshot({path:path.join(output,`gold-${width}.png`)});
  await p.getByRole('button',{name:'Back to bottle search',exact:true}).click();await p.getByRole('textbox',{name:'Search bottles',exact:true}).waitFor();
  await search(p,'Buffalo Trace Bourbon');await p.getByText('$33.95 reference',{exact:true}).waitFor();assert.equal(await price.inputValue(),'400','correction preserves price');
  await price.fill('');await p.getByText('Everyday option',{exact:true}).waitFor();assert.ok(Number(await p.getByTestId('bottle-assessment-score').innerText())>0);assert.equal(await p.getByText('National context',{exact:true}).count(),1);
  await p.screenshot({path:path.join(output,`buffalo-${width}.png`)});
  const mounts=await p.evaluate(()=>window.scannerMounts);await p.getByRole('button',{name:'Scan another',exact:true}).click();assert.ok(await p.evaluate(()=>window.scannerMounts)>mounts);
  await p.getByRole('button',{name:'Simulate label match',exact:true}).click();await p.getByRole('button',{name:"Check Maker's Mark",exact:true}).click();assert.equal(await price.inputValue(),'','new scan clears price');
  await p.getByRole('button',{name:'Back to bottle search',exact:true}).click();assert.equal(await p.getByRole('button',{name:"Check Maker's Mark",exact:true}).count(),0,'old scanner matches are cleared');
  await search(p,'Eagle Rare 10 Year');const before=Number(await p.getByTestId('bottle-assessment-score').innerText());
  await p.getByRole('button',{name:'Change Bottle Check reference region'}).click();await p.getByRole('button',{name:'Select reference state',exact:true}).click();await p.getByRole('button',{name:'Use Alabama',exact:true}).click();await p.getByRole('button',{name:'Use this region',exact:true}).click();await p.getByText('AL context',{exact:true}).waitFor();assert.ok(Number(await p.getByTestId('bottle-assessment-score').innerText())>before);
  await p.getByRole('button',{name:'Scan another',exact:true}).click();await p.getByText('Alabama',{exact:true}).waitFor();
  await search(p,'Unreviewed Fixture Bourbon');assert.equal(await p.getByTestId('bottle-assessment-score').innerText(),'—');await visibleDock(p);await p.screenshot({path:path.join(output,`unresearched-${width}.png`)});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.evaluate(()=>window.navigationError||null),null);assert.deepEqual(errors,[]);
  results.push({width,passed:true,defaultWords:words,repeatScan:true,correctionPriceRetained:true,fixedScore:true,stateContext:true});await p.close();
 }
 const p=await browser.newPage({viewport:{width:393,height:852}});await p.goto(base+'/navigation-preview/?screen=home&slowProfile=1');await p.getByRole('button',{name:'Bottle Check: scan or search a bottle'}).click();await search(p,"Maker's Mark");await p.getByRole('button',{name:'Back to bottle search',exact:true}).click();await p.waitForTimeout(500);await p.getByRole('textbox',{name:'Search bottles',exact:true}).waitFor();assert.equal(await p.getByTestId('bottle-assessment-score').count(),0,'late profile cannot restore the previous result');await p.close();
 const proof={passed:true,results,delayedProfileReset:true,physicalDeviceTested:false,nativeBoundariesSimulated:true};await writeFile(path.join(output,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await browser.close();}
