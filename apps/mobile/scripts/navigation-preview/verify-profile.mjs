import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.NAVIGATION_PREVIEW_URL || 'http://127.0.0.1:5271';
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function openArchitect(page, directory) {
  await page.clock.setFixedTime(new Date('2026-11-15T18:00:00Z'));
  await page.goto(base + '/' + directory + '/?screen=home&slowProfile=1');
  await page.getByRole('button', { name: 'Bottle Check: scan or search a bottle' }).click();
  const tip = page.getByRole('button', { name: 'Dismiss Bottle Check tips' });
  if (await tip.count()) await tip.click();
  await page.getByRole('radio', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search bottles', exact: true }).fill('Penelope Architect Bourbon');
  await page.getByRole('button', { name: 'Check Penelope Architect Bourbon', exact: true }).click();
  const score = await page.getByTestId('bottle-assessment-score').innerText();
  assert.equal(score, '49');
  await page.getByRole('button', { name: 'View bottle details' }).click();
}

try {
  const negative = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await openArchitect(negative, 'navigation-preview-profile-negative');
  await negative.getByRole('alert').filter({ hasText: 'Maximum update depth exceeded' }).waitFor();
  await negative.close();
  for (const width of [393, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 852 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openArchitect(page, 'navigation-preview');
    await page.getByRole('heading', { name: 'Penelope Architect Bourbon' }).waitFor();
    await page.getByRole('heading', { name: 'Bottle reports' }).waitFor();
    await page.getByRole('button', { name: 'Watch in Radar' }).waitFor();
    const snapshot = await page.evaluate(() => ({ renders: window.navigationRenders, error: window.navigationError, routes: window.navigationRoutes }));
    assert.equal(snapshot.routes.at(-1), 'bottle/[id]');
    assert.ok(snapshot.renders < 10);
    assert.equal(snapshot.error, undefined);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Previous profile reproduces the navigation loop. Penelope Architect opens with a score and usable details at both widths.');
} finally {
  await browser.close();
}
