import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '../../dist/bottle-profile-preview');
const allowed = { '/': ['index.html', 'text/html'], '/app.js': ['app.js','application/javascript'], '/fraunces.ttf': ['fraunces.ttf','font/ttf'] };
const server = createServer(async (request,response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const asset = pathname.match(/^\/([a-zA-Z0-9_-]+\.(png|jpg|ttf))$/);
  const file = allowed[pathname] || (asset && [asset[1], {png:'image/png',jpg:'image/jpeg',ttf:'font/ttf'}[asset[2]]]);
  if (!file) { response.writeHead(404).end(); return; }
  try { response.writeHead(200,{'content-type':file[1]}).end(await readFile(path.join(root,file[0]))); }
  catch { response.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  for (const width of [320,393]) {
    const page = await browser.newPage({viewport:{width,height:852}});
    await page.addInitScript(()=>{ localStorage.setItem('bottle-check-guidance-v2','dismissed'); window.shelfPhotoText='Weller Antique 107 750 mL $49.99 sale $44.99'; });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?screen=check&camera=fixture');
    await page.getByRole('radio',{name:'Shelf tag'}).click();
    await page.getByRole('button',{name:'Photograph bottle and tag'}).click();
    const price = page.getByLabel('Confirm tag price in dollars');
    assert.equal(await price.inputValue(),'');
    const confirm = page.getByRole('button',{name:'Confirm tag and choose bottle'});
    assert.equal(await confirm.isDisabled(),true);
    await price.fill('44.99');
    const size = page.getByLabel('Confirm bottle size in milliliters');
    assert.equal(await size.inputValue(),'750');
    await size.fill('1750');
    await confirm.click();
    await page.getByRole('button',{name:/Check .*Weller Antique 107/i}).first().click();
    assert.equal(await page.getByLabel('Bottle Check shelf price in US dollars').inputValue(),'44.99');
    await page.getByText('Shelf price · 1750 mL').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    const output = path.resolve(import.meta.dirname,'../../../../out');
    await mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,'shelf-check-'+width+'.png')});
    await page.close();
  }
  console.log('Shelf-tag capture, conflicting prices, editable volume, bottle confirmation and score passed at 320 and 393 pixels.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
