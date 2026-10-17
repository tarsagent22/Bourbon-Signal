import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(import.meta.dirname, '../../../../.operator/automatic-score-qa');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ reducedMotion: 'reduce' }); const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function select(name, query = '') {
  await page.goto(`http://127.0.0.1:5201/?screen=check${query}`);
  const tip = page.getByRole('button', { name: 'Dismiss Bottle Check tips' });
  if (await tip.count()) await tip.click();
  await page.getByRole('radio', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search bottles', exact: true }).fill(name);
  await page.getByRole('button', { name: `Check ${name}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).waitFor();
}
try {
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    await select('Eagle Rare 10 Year', '&state=NC&area=Lewisville');
    await page.getByText('NC prices · Lewisville sample unavailable', { exact: true }).waitFor();
    const initial = Number(await page.getByTestId('bottle-assessment-score').innerText());
    assert.ok(initial > 75 && initial !== 59);
    await page.getByText('Signal Score', { exact: true }).waitFor();
    assert.equal(await page.getByText('REVIEW SCORE', { exact: true }).count(), 0);
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('150');
    await page.getByText('Steep price premium', { exact: true }).waitFor();
    assert.equal(Number(await page.getByTestId('bottle-assessment-score').innerText()), initial);
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('');
    await page.getByText('Notable find', { exact: true }).waitFor();
    assert.equal(Number(await page.getByTestId('bottle-assessment-score').innerText()), initial);
    await page.getByRole('button', { name: 'Change Bottle Check reference region' }).click();
    await page.getByRole('button', { name: 'Select reference state', exact: true }).click();
    await page.getByRole('button', { name: 'Use Alabama', exact: true }).click();
    await page.getByRole('textbox', { name: 'Reference city or area' }).fill('');
    await page.getByRole('button', { name: 'Use this region', exact: true }).click();
    await page.getByText('Unicorn in AL', { exact: true }).waitFor();
    assert.ok(Number(await page.getByTestId('bottle-assessment-score').innerText()) > initial);
    for (const name of ['Heaven Hill 7 Year Bottled-in-Bond', "Blanton's Gold Bourbon"]) {
      await select(name, '&prices=none&state=NC&area=Lewisville');
      await page.getByText('Shelf price unknown · value not scored', { exact: true }).waitFor();
      assert.ok(Number(await page.getByTestId('bottle-assessment-score').innerText()) > 0);
      await page.getByRole('heading', { name: 'Published reviews', exact: true }).waitFor();
      assert.equal(await page.getByText('Why this assessment', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Price value', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'View bottle →', exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `${name.startsWith('Heaven') ? 'heaven-hill' : 'blantons-gold'}-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: /^Why this score/ }).click();
      await page.getByRole('link', { name: /^Open Release context/ }).waitFor();
      await page.getByRole('link', { name: /^Open Distiller community:/ }).waitFor();
      await page.getByRole('button', { name: /^Why this score/ }).click();
      await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('400');
      await page.getByText('Steep price premium', { exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('');
      await page.getByText('Shelf price unknown · value not scored', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await select('Rock Hill Farms Single Barrel', '&prices=none');
    await page.getByTestId('bottle-assessment-score').filter({ hasText: '�' }).waitFor();
    await page.getByRole('heading', { name: 'Published reviews', exact: true }).waitFor();
    assert.equal(await page.getByText('REVIEW SCORE', { exact: true }).count(), 0);
    await select('Unreviewed Fixture Bourbon', '&prices=none');
    await page.getByText('Release research pending', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Published reviews', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(out, `pending-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'proof.json'), JSON.stringify({ passed: true, widths: [393, 320], sourceFixtures: true, checks: ['branded find score distinct from drinking reviews', 'no value points from assumed catalog price', 'owner screenshot bottles have zero-input results', 'explicit city to state fallback', 'supported state classification', 'optional price and clearing recovery', 'review-only results never become Signal Score', 'unresearched compact state', 'source disclosure and no overflow'], physicalDeviceTested: false, errors }, null, 2));
  console.log('Signal Score browser flows passed at 320 and 393 points.');
} finally { await browser.close(); }
