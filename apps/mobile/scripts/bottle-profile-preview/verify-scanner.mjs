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
    await page.getByText('Matches saved below', { exact: true }).waitFor();
    const guide = await page.getByTestId('bottle-label-scan-guide').boundingBox();
    assert.ok(guide.height > guide.width * 1.5);
    const matches = page.getByRole('button', { name: /^Check E.H. Taylor/ });
    const before = await matches.allTextContents();
    assert.ok(before.some(name => name.includes('Small Batch')));
    assert.ok(before.every(name => !/Barrel Proof|Single Barrel/.test(name)));
    const reads = await page.evaluate(() => { window.scannerText = ''; return window.scannerReads; });
    await page.waitForTimeout(2200);
    assert.deepEqual(await matches.allTextContents(), before);
    assert.equal(await page.evaluate(() => window.scannerReads), reads, 'OCR stops while results are held');
    await page.screenshot({ path: path.join(output, `held-${width}.png`), fullPage: true });
    await page.evaluate(() => { window.scannerText = 'WILD TURKEY RARE BREED RYE BARREL PROOF'; });
    await page.getByRole('button', { name: 'Scan another', exact: true }).click();
    await page.getByRole('button', { name: 'Check Wild Turkey Rare Breed Rye', exact: true }).waitFor();
    assert.equal(await matches.count(), 0);
    await page.getByRole('button', { name: 'Check Wild Turkey Rare Breed Rye', exact: true }).click();
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).waitFor();
    assert.equal(await page.getByTestId('bottle-scanner-frame').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'proof.json'), JSON.stringify({ verified: true, widths: [393, 320], simulatedNativeBoundaries: true, physicalDeviceTested: false, errors }, null, 2));
  console.log('Portrait scanner, held candidates, explicit rescan, selection and narrow layouts passed (simulated camera/OCR).');
} finally { await browser.close(); }
