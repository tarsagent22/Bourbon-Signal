import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(import.meta.dirname, '../../../../.operator/scanner-steady-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const width of [393, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 852 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('bottle-check-guidance-v2', 'dismissed'); window.scannerText = 'COLONEL E H TAYLOR SMALL BATCH KENTUCKY STRAIGHT BOURBON WHISKEY'; });
    await page.goto('http://127.0.0.1:5201/?screen=check&camera=fixture');
    const read = page.getByRole('button', { name: 'Read label', exact: true });
    const retry = page.getByRole('button', { name: 'Read again', exact: true });
    const matches = page.getByRole('button', { name: /^Check / });
    await read.waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.scannerReads || 0), 0, 'aiming alone does not analyze frames');
    await read.click();
    await page.getByText('Hold steady…', { exact: true }).waitFor();
    assert.equal(await matches.count(), 0, 'no rows appear while the burst is running');
    await retry.waitFor();
    const guide = await page.getByTestId('bottle-label-scan-guide').boundingBox();
    assert.ok(guide.height > guide.width * 1.5);
    const first = await matches.allTextContents();
    assert.ok(first[0].includes('Small Batch'));
    const reads = await page.evaluate(() => {
      window.scannerText = 'EAGLE RARE AGED TEN YEARS';
      window.scannerStaleFrame = window.scannerLastFrame;
      return window.scannerReads;
    });
    await page.waitForTimeout(450);
    assert.deepEqual(await matches.allTextContents(), first);
    assert.equal(await page.evaluate(() => window.scannerReads), reads, 'OCR stops after presenting results');
    await page.screenshot({ path: path.join(output, `held-${width}.png`), fullPage: true });
    const mounts = await page.evaluate(() => window.scannerMounts);
    await retry.click();
    await page.evaluate(() => window.scannerDeliverFrame({ ...window.scannerStaleFrame, sequence: 100000 }));
    await page.getByRole('button', { name: 'Check Eagle Rare 10 Year', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.scannerMounts), mounts, 'retry reuses the warm camera');

    await page.evaluate(() => { window.scannerText = 'PENELOPE'; });
    await retry.click();
    await page.getByRole('button', { name: 'Show all Penelope expressions', exact: true }).click();
    await page.getByRole('button', { name: 'Check Penelope Madagascar', exact: true }).waitFor();
    await page.evaluate(() => { window.scannerText = 'HANDCRAFTED WOODEN TABLE'; });
    await retry.click();
    await page.getByText('No match yet. Try the front label or search by name.', { exact: true }).waitFor();
    assert.equal(await matches.count(), 0);

    await page.evaluate(() => { window.scannerAutoFrames = false; });
    await retry.click();
    await page.getByText('Move closer or tilt the bottle to reduce glare.', { exact: true }).waitFor();
    await page.evaluate(() => { window.scannerAutoFrames = true; window.scannerText = 'EAGLE RARE AGED TEN YEARS'; });
    await retry.click();
    await page.getByRole('button', { name: 'Check Eagle Rare 10 Year', exact: true }).click();
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).waitFor();
    assert.equal(await page.getByTestId('bottle-scanner-frame').count(), 0);
    await page.evaluate(() => window.scannerDeliverFrame({ ...window.scannerLastFrame, sequence: 100000 }));
    assert.equal(await matches.count(), 0, 'queued frames cannot restore candidates after selection');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'proof.json'), JSON.stringify({ verified: true, widths: [393, 320], simulatedNativeBoundaries: true, physicalDeviceTested: false, errors }, null, 2));
  console.log('Portrait scanner, held candidates, explicit rescan, selection and narrow layouts passed (simulated camera/OCR).');
} finally { await browser.close(); }
