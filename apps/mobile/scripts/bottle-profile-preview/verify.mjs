import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('../../.operator/bottle-profile-qa'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
async function open(query) { await page.goto(`http://127.0.0.1:5198/?${query}`); await page.getByRole('heading', { name: 'Eagle Rare 10 Year' }).waitFor(); await page.evaluate(() => document.fonts.ready); }
async function capture(name) { await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
try {
  await open('owned=1'); await capture('owned-profile');
  await page.getByRole('button', { name: 'Check a price' }).click();
  await page.getByRole('textbox', { name: 'Shelf price in US dollars' }).fill('47.97');
  await page.getByText('20% above MSRP', { exact: true }).waitFor(); await capture('price-check');
  await page.getByRole('button', { name: 'Edit your shelf' }).click();
  assert.equal(await page.evaluate(() => window.lastRoute.params.editBottleId), 'eagle-rare-10');
  await page.getByRole('button', { name: 'Post a Sighting' }).click();
  assert.equal(await page.evaluate(() => window.lastRoute.params.scanBottleId), 'eagle-rare-10');
  await open('screen=report'); await page.getByText('Last reported availability', { exact: true }).waitFor();
  assert.equal(await page.getByText(/not alertable|stale retained evidence/i).count(), 0); await capture('feed-bottle-report');
  await page.goto('http://127.0.0.1:5198/?screen=check');
  await page.getByRole('radio', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search bottles' }).fill('Eagle Rare');
  await page.getByRole('button', { name: 'View Eagle Rare 10 Year' }).waitFor(); await capture('bottle-check-search');
  await page.getByRole('button', { name: 'View Eagle Rare 10 Year' }).click();
  assert.equal(await page.evaluate(() => window.lastRoute.pathname), '/(app)/bottle/[id]');
  await page.setViewportSize({ width: 320, height: 740 }); await open('owned=1'); await capture('small-screen-profile');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, sourcePreview: true, physicalDeviceTested: false, checks: ['profile', 'price comparison', 'shelf edit navigation', 'post navigation', 'historical report copy', 'catalog search', 'small viewport'], errors }, null, 2));
  console.log(`Browser source preview passed: ${output}`);
} finally { await browser.close(); }
