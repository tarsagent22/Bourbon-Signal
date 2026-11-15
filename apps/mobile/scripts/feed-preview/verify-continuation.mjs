import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(import.meta.dirname, '../../../../.operator/feed-continuation-qa');
const artwork = JSON.parse(await readFile(new URL('../../../../shared/labeled-bottle-artwork-registry.json', import.meta.url), 'utf8'));
const birthday = artwork.entries.find(row => row.catalogId === 'old-forester-birthday-bourbon-2026');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 980 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5202/?usability&short');
  const card = page.getByRole('button', { name: /Old Forester Birthday Bourbon 2026/ });
  await card.waitFor();
  await card.locator('img[src*="' + birthday.sha256 + '"]').first().waitFor({ state: 'attached' });
  assert.equal(await card.getByText('Image pending').count(), 0);
  await page.screenshot({ path: path.join(out, 'birthday-feed.png') });
  const scroller = page.locator('div').filter({ has: card }).filter({ hasText: 'See more signals' });
  await scroller.last().waitFor();
  await page.waitForFunction(() => window.feedPreviewState.requests.some(request => request.cursor === null));
  assert.equal(await page.evaluate(() => window.feedPreviewState.requests.filter(request => request.cursor != null).length), 0);
  await page.mouse.move(220, 720);
  for (let i = 0; i < 12 && !await page.getByText('You’re caught up.', { exact: true }).isVisible(); i++) {
    await page.mouse.wheel(0, 1450);
    await page.waitForTimeout(150);
  }
  await page.getByText('You’re caught up.', { exact: true }).waitFor();
  await page.getByText('Limited Bourbon 34', { exact: true }).waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => window.feedPreviewState.requests.filter(request => request.cursor != null).map(request => request.cursor)), ['30']);
  await page.getByRole('button', { name: 'Browse Community', exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'feed-end.png') });
  await page.mouse.move(220, 720);
  for (let i = 0; i < 12 && !await card.isVisible(); i++) {
    await page.mouse.wheel(0, -1450);
    await page.waitForTimeout(150);
  }
  await card.waitFor();
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'proof.json'), JSON.stringify({ exactArtwork: birthday.catalogId, scrolledWithoutTap: true, continuationRequests: 1,
    previousRowsPreserved: true, lastRow: 34, terminalAction: 'Browse Community', physicalDeviceTested: false }, null, 2));
  console.log('Home loaded the next page on scroll and rendered the exact 2026 Birthday Bourbon artwork.');
} finally { await browser.close(); }
