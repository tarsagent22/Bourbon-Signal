import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve(import.meta.dirname,'../../../../.operator/bottle-check-navigation-qa');await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const base=process.env.NAVIGATION_PREVIEW_URL||'http://127.0.0.1:5271';const proof={negativeControl:null,positive:[],physicalDeviceTested:false,hostBoundary:'DOM native-chrome rerender stress; real Expo Screen and React Navigation core'};
try{
 const p=await browser.newPage({viewport:{width:393,height:852}});await p.goto(base+'/navigation-preview-negative/?screen=home');await p.getByRole('button',{name:'Bottle Check: scan or search a bottle'}).click();await p.getByRole('alert').filter({hasText:'Maximum update depth exceeded'}).waitFor();proof.negativeControl=await p.evaluate(()=>({error:window.navigationError,renders:window.navigationRenders}));await p.close();
 for(const width of [393,320]){const p=await browser.newPage({viewport:{width,height:852},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/navigation-preview/?screen=home');
  for(let round=0;round<3;round++){
   await p.getByRole('button',{name:'Bottle Check: scan or search a bottle'}).click();await p.getByRole('button',{name:'Close Bottle Check',exact:true}).waitFor();
   assert.equal(await p.evaluate(()=>window.currentNavigationOptions.headerShown),false);
   const tip=p.getByRole('button',{name:'Dismiss Bottle Check tips'});if(await tip.count())await tip.click();
   await p.getByRole('button',{name:'Bottle Check help',exact:true}).click();await p.getByRole('button',{name:'Dismiss Bottle Check tips'}).click();
   await p.getByRole('radio',{name:'Search by name'}).click();await p.getByRole('textbox',{name:'Search bottles',exact:true}).fill('Maker');await p.getByRole('button',{name:"Check Maker's Mark",exact:true}).click();
   await p.getByRole('textbox',{name:'Bottle Check shelf price in US dollars'}).fill('39.99');await p.getByText('Signal Score',{exact:true}).waitFor();
   const settled=await p.evaluate(()=>window.navigationRenders);await p.waitForTimeout(120);assert.equal(await p.evaluate(()=>window.navigationRenders),settled,'navigation settles after interactions');
   assert.equal(await p.evaluate(()=>window.navigationError||null),null);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(round===0)await p.screenshot({path:path.join(output,'fixed-'+width+'.png')});await p.getByRole('button',{name:'Close Bottle Check',exact:true}).click();await p.getByRole('button',{name:'Bottle Check: scan or search a bottle'}).waitFor();
  }
  assert.deepEqual(errors,[]);proof.positive.push({width,roundTrips:3,passed:true,renders:await p.evaluate(()=>window.navigationRenders)});await p.close();
 }
 await writeFile(path.join(output,'proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await browser.close();}
