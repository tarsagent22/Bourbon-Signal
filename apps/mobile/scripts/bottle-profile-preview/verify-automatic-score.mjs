import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(import.meta.dirname, '../../../../.operator/automatic-score-qa');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ reducedMotion: 'reduce' });
await page.clock.setFixedTime(new Date('2026-11-15T18:00:00Z'));
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const score = async () => Number(await page.getByTestId('bottle-assessment-score').innerText());
const price = () => page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' });
async function select(name, query = '') {
  await page.goto('http://127.0.0.1:5201/?screen=check' + query);
  const tip = page.getByRole('button', { name: 'Dismiss Bottle Check tips' });
  if (await tip.count()) await tip.click();
  await page.getByRole('radio', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search bottles', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Check ' + name, exact: true }).click();
  await price().waitFor();
}
try {
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    await select('Eagle Rare 10 Year', '&state=NC&area=Lewisville');
    await page.getByText(/NC store median vs/).waitFor();
    const baseline = await score();
    assert.ok(baseline >= 60 && baseline <= 100);
    await page.getByRole('button', { name: /^Why this score/ }).click();
    await page.getByText('Not enough comparable prices in Lewisville; using NC observations.').waitFor();
    await page.getByRole('link', { name: /NC ABC list price/ }).waitFor();
    await page.getByRole('button', { name: /^Why this score/ }).click();
    await price().fill('150');
    await page.getByText('Pass at this price', { exact: true }).waitFor();
    assert.ok(await score() < baseline);
    await price().fill('');
    assert.equal(await score(), baseline);
    await page.getByRole('button', { name: 'Change Bottle Check reference region' }).click();
    await page.getByRole('button', { name: 'Use current location', exact: true }).click();
    await page.getByText('Richmond, VA', { exact: true }).waitFor();
    await page.getByText(/Richmond store median.*No independent comparison/).waitFor();
    assert.ok(await score() < baseline);
    await select('Unreviewed Fixture Bourbon', '&prices=none&gps=denied');
    await page.getByText('Verify before buying', { exact: true }).waitFor();
    assert.equal(await score(), 50);
    await page.getByRole('button', { name: 'Change Bottle Check reference region' }).click();
    await page.getByRole('button', { name: 'Use current location', exact: true }).click();
    await page.getByText('Location access is off. You can still choose a region.').waitFor();
    await page.getByRole('button', { name: 'Change Bottle Check reference region' }).click();
    await page.screenshot({ path: path.join(out, 'limited-evidence-' + width + '.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'proof.json'), JSON.stringify({ passed: true, widths: [393, 320],
    checks: ['numeric limited-evidence result', 'price responds and recovers on clear', 'city fallback', 'verified source link', 'synthetic current location and denied permission', 'no horizontal overflow'],
    physicalDeviceTested: false, errors }, null, 2));
  console.log('Signal Score browser flows passed at 320 and 393 points.');
} finally { await browser.close(); }
