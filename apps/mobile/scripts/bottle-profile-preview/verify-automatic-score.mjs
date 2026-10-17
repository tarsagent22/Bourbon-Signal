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
    await select('Eagle Rare 10 Year');
    await page.getByText('Recent NC median', { exact: false }).first().waitFor();
    let score = Number(await page.getByTestId('bottle-assessment-score').innerText());
    assert.ok(score > 75 && score !== 59);
    assert.equal(await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).inputValue(), '');
    await page.screenshot({ path: path.join(out, `automatic-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /^Sources & scoring/ }).click();
    await page.getByRole('link', { name: /^Open Distiller community:/ }).waitFor();
    assert.ok((await page.getByRole('link', { name: /^Open Producer facts/ }).count()) > 0);
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('150');
    await page.getByText('Steep price premium', { exact: true }).waitFor();
    assert.ok(Number(await page.getByTestId('bottle-assessment-score').innerText()) < score);
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('');
    await page.getByText('Notable find', { exact: true }).waitFor();
    assert.equal(Number(await page.getByTestId('bottle-assessment-score').innerText()), score);
    await page.getByRole('button', { name: 'Change Bottle Check reference region' }).click();
    await page.getByRole('button', { name: 'Select reference state', exact: true }).click();
    await page.getByRole('button', { name: 'Use Alabama', exact: true }).click();
    await page.getByRole('button', { name: 'Use this region', exact: true }).click();
    await page.getByText(/Unicorn in AL/).waitFor();
    assert.ok(Number(await page.getByTestId('bottle-assessment-score').innerText()) > score);
    await select('Wild Turkey 101 Bourbon', '&prices=none');
    await page.getByText('At catalog reference price', { exact: false }).first().waitFor();
    const common = Number(await page.getByTestId('bottle-assessment-score').innerText());
    assert.ok(common < 60 && common !== score && common !== 59);
    await select('Unreviewed Fixture Bourbon');
    await page.getByText('Research pending', { exact: true }).first().waitFor();
    assert.equal(await page.getByTestId('bottle-assessment-score').innerText(), '\u2014');
    await page.screenshot({ path: path.join(out, `pending-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'proof.json'), JSON.stringify({ passed: true, widths: [393, 320], sourceFixtures: true, checks: ['automatic score with no member input', 'sourced expert and consumer evidence', 'optional price changes assessment', 'clearing price restores automatic context', 'state-specific evidence', 'common versus allocated expression', 'missing reviews have no fabricated score'], physicalDeviceTested: false, errors }, null, 2));
  console.log('Automatic assessment browser flows passed at 320 and 393 points.');
} finally { await browser.close(); }
