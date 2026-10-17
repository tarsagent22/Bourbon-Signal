import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=process.env.COMPANION_PREVIEW_URL || 'http://127.0.0.1:5201';
const output=path.resolve(import.meta.dirname,'../../../../.operator/companion-qa');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
async function open(query){await page.goto(`${url}/?${query}`);await page.evaluate(()=>document.fonts.ready);}
async function checkBottle(query='screen=check'){await open(query);await page.getByRole('radio',{name:'Search by name'}).click();await page.getByRole('textbox',{name:'Search bottles',exact:true}).fill('Eagle Rare');await page.getByRole('button',{name:'Check Eagle Rare 10 Year',exact:true}).click();await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).waitFor();}
async function capture(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,name+'.png')});}
try{
 for(const width of [393,320]){
  await page.setViewportSize({width,height:852});await open('screen=check');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('button',{name:'Dismiss Bottle Check tips'}).waitFor();await capture('first-use-'+width);
  await page.getByRole('button',{name:'Dismiss Bottle Check tips'}).click();await page.reload();await page.getByRole('button',{name:'Change Bottle Check reference region'}).waitFor();assert.equal(await page.getByRole('button',{name:'Dismiss Bottle Check tips'}).count(),0);
  await page.getByRole('button',{name:'Bottle Check help',exact:true}).click();await page.getByRole('button',{name:'Dismiss Bottle Check tips'}).click();
  await page.getByRole('radio',{name:'Search by name'}).click();await page.getByRole('textbox',{name:'Search bottles',exact:true}).fill('Eagle Rare');await page.getByRole('button',{name:'Check Eagle Rare 10 Year',exact:true}).click();await page.getByText('Notable find',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('40');await page.getByText('Notable find',{exact:true}).waitFor();await page.getByText(/^Moderate confidence/).first().waitFor();await capture('buying-score-'+width);
  await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('150');await page.getByText('Steep price premium',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('0');await page.getByText('Check the shelf price',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Change Bottle Check reference region'}).click();await page.getByRole('button',{name:'Select reference state',exact:true}).click();await page.getByRole('button',{name:'Use Virginia',exact:true}).click();await page.getByRole('textbox',{name:'Reference city or area'}).fill('Richmond');await page.getByRole('button',{name:'Use this region',exact:true}).click();
  await page.waitForFunction(()=>window.lastSignalQuery?.state==='VA'&&window.lastSignalQuery?.area===undefined);await page.getByText('Richmond, VA',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Change Bottle Check reference region'}).click();await page.getByRole('button',{name:'Reset to home state',exact:true}).click();await page.waitForFunction(()=>window.lastSignalQuery?.state==='NC'&&window.lastSignalQuery?.area===undefined);
  await page.getByRole('button',{name:'Close Bottle Check',exact:true}).click();assert.equal(await page.evaluate(()=>window.backCalled),true);
  await checkBottle('screen=check&prices=error');await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('40');await page.getByText(/^Moderate confidence/).first().waitFor();await page.getByText(/Local prices couldn’t load/).waitFor();await page.getByRole('button',{name:'Retry lookup',exact:true}).waitFor();
  await checkBottle('screen=check&catalog=missing&prices=none');await page.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('40');await page.getByText('Find evidence pending',{exact:true}).waitFor();await page.getByText(/^Moderate confidence/).first().waitFor();
  for(const variant of ['','&few=1','&empty=1']){
   await open('screen=stats&history=first'+variant);
   if(variant.includes('empty')){await page.getByRole('button',{name:'Add your first bottle',exact:true}).waitFor();assert.equal(await page.getByText('Unavailable',{exact:true}).count(),0);await capture('empty-stats-'+width);await page.getByRole('button',{name:'Add your first bottle',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastRoute),'/(app)/cellar/add');}
   else{await page.getByText('Your highest rated',{exact:true}).waitFor();await page.getByText('Your proof range',{exact:true}).waitFor();await capture((variant?'small-collection-':'collection-')+width);const card=page.getByRole('button',{name:/^Open /}).first();await card.click();assert.equal((await page.evaluate(()=>window.lastRoute)).pathname,'/(app)/bottle/[id]');}
  }
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,widths:[393,320],sourceFixtures:true,physicalDeviceTested:false,checks:['dismissible persistent first-use help and help replay','close scanner','home-state default and state/city override with reset','price-sensitive verdict and invalid-price recovery','network and missing-MSRP fallback','visual collection with few bottles and empty collection add action','bottle navigation','no horizontal overflow'],errors},null,2));console.log('Companion browser checks passed: '+output);
}finally{await browser.close();}
