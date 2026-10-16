import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('../../.operator/collection-stats-qa'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
async function open(extra = '') { await page.goto(`http://127.0.0.1:5198/?screen=stats&${extra}`); await page.getByRole('heading', { name: 'Collection Statistics' }).waitFor(); await page.getByRole('heading', { name: 'Value over time' }).waitFor(); await page.evaluate(() => document.fonts.ready); }
async function capture(name) { await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: no horizontal overflow`); }
try {
  await open(); await page.getByRole('button', { name: 'Previous value observation' }).waitFor(); await capture('value-history-msrp');
  await page.getByRole('button', { name: 'Previous value observation' }).click(); await page.getByText('$350', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Secondary', exact: true }).click(); await page.getByText('$1,410 – $1,570', { exact: true }).first().waitFor(); await capture('value-history-secondary');
  await page.getByRole('heading', { name: 'By producer' }).scrollIntoViewIfNeeded(); await capture('producer-breakdown');
  await page.getByRole('heading', { name: 'Your collection, in numbers' }).scrollIntoViewIfNeeded(); await capture('personal-insights');
  assert.equal(await page.getByRole('heading', { name: 'Top Rated' }).count(), 0);
  await page.getByRole('button', { name: 'Pricing sources & methodology' }).click(); await page.getByRole('button', { name: 'View pricing breakdown →' }).waitFor();
  await page.getByRole('button', { name: 'Close collection statistics' }).click(); await page.getByText('Stats closed').waitFor();
  await page.setViewportSize({ width: 320, height: 740 }); await open('history=first'); await page.getByText(/History starts with your first recorded value/).waitFor(); await capture('first-observation-small-screen');
  await open('history=error'); await page.getByRole('button', { name: 'Retry history' }).waitFor(); await capture('history-unavailable');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, syntheticData: true, physicalDeviceTested: false, checks: ['MSRP history', 'secondary range', 'observation selection', 'producer/rarity breakdowns', 'personal insights', 'pricing details', 'modal dismissal', 'first observation', 'small viewport', 'history failure'], errors }, null, 2));
  console.log(`Collection Stats browser source checks passed: ${output}`);
} finally { await browser.close(); }
