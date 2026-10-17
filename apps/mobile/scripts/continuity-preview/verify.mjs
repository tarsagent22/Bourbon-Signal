import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/chand/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = path.resolve('../../.operator/continuity-qa'); await mkdir(output, { recursive: true });
const base = process.env.CONTINUITY_PREVIEW_URL || 'http://127.0.0.1:5267';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
async function check(name, width, query, action, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage(); const errors = [];
  page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/?${query}`); await page.getByText('LOCAL PREVIEW · SYNTHETIC DATA', { exact: true }).waitFor();
    await action(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal layout fits');
    assert.deepEqual(errors, [], 'no runtime errors');
    await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
    results.push({ name, width, status: 'passed' });
  } catch (error) {
    results.push({ name, width, status: 'failed', error: error.message, runtimeErrors: errors });
    await writeFile(path.join(output, `${name}-${width}-failure.txt`), (await page.locator('body').innerText()).slice(0, 12000));
    await page.screenshot({ path: path.join(output, `${name}-${width}-failure.png`), fullPage: true });
  } finally { await context.close(); }
}
async function chooseMaker(page) {
  await page.getByRole('radio', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search bottles', exact: true }).fill('Maker');
  await page.getByRole('button', { name: "Check Maker's Mark", exact: true }).click();
}
for (const width of [390, 320]) {
  await check('check-post-shelf', width, 'screen=check&state=VA&area=Richmond', async page => {
    await chooseMaker(page);
    await page.getByText('You rated this 8.5/10 · You’d buy again', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Bottle Check shelf price in US dollars' }).fill('49.99');
    await page.getByRole('button', { name: 'Post this sighting', exact: true }).click();
    await page.getByRole('heading', { name: 'Post a Signal' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Bottle', exact: true }).inputValue(), "Maker's Mark");
    assert.equal(await page.getByRole('textbox', { name: 'Shelf price', exact: true }).inputValue(), '49.99');
    await page.getByText('Store search: Richmond, VA. Choose the store you observed.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Enter store manually' }).click();
    await page.getByRole('textbox', { name: 'Retailer name' }).fill('Preview Bottle Shop');
    await page.getByRole('textbox', { name: 'Street address' }).fill('123 Main Street');
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Richmond');
    await page.getByRole('textbox', { name: 'State', exact: true }).fill('VA');
    await page.getByRole('button', { name: 'Post Signal', exact: true }).click();
    await page.getByRole('button', { name: 'View your Signal →' }).waitFor();
    await page.getByText(/130 Signal Points available/).waitFor();
    assert.equal(await page.evaluate(() => window.continuityPreview.posted[0].price), 49.99);
    await page.getByRole('button', { name: 'Bought one? Add to My Shelf →' }).click();
    await page.getByRole('heading', { name: 'Add to My Shelf' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Price paid' }).inputValue(), '49.99');
    assert.equal(await page.getByRole('textbox', { name: 'Store purchased from' }).inputValue(), 'Preview Bottle Shop');
  });
  await check('scan-returns-to-draft', width, 'screen=post', async page => {
    await page.getByRole('button', { name: 'Enter store manually' }).click();
    await page.getByRole('textbox', { name: 'Retailer name' }).fill('Keep this store');
    await page.getByRole('textbox', { name: 'Street address' }).fill('100 Main St');
    await page.getByRole('textbox', { name: 'City', exact: true }).fill('Raleigh');
    await page.getByRole('textbox', { name: 'State', exact: true }).fill('NC');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Scan a bottle →' }).click();
    await page.getByRole('button', { name: 'Simulate label match' }).click();
    await page.getByRole('button', { name: "Check Maker's Mark", exact: true }).click();
    await page.getByRole('heading', { name: 'Post a Signal' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Retailer name' }).inputValue(), 'Keep this store');
    assert.equal(await page.getByRole('textbox', { name: 'Bottle', exact: true }).inputValue(), "Maker's Mark");
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
  await check('home-feed-without-suggestions', width, 'screen=home', async page => {
    await page.getByText('You rated this 8.5/10 · You’d buy again', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /Saved & suggested|Saved from setup/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Watch Four Roses Single Barrel', exact: true }).count(), 0);
    assert.equal(await page.getByText(/Taste suggestions use saved ratings/).count(), 0);
  });
  await check('browse-region-carries-without-changing-alerts', width, 'screen=home&homeState=VA', async page => {
    await page.getByText('Virginia', { exact: true }).first().waitFor();
    await page.waitForTimeout(350);
    const watched = await page.evaluate(() => JSON.stringify(window.continuityPreview.preferences.monitoringScopes));
    await page.evaluate(() => window.continuityPreview.navigate('/(app)/bottle-check'));
    await page.getByText('Virginia', { exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => JSON.stringify(window.continuityPreview.preferences.monitoringScopes)), watched);
  });
  await check('incoming-scan-protects-existing-draft', width, 'screen=post', async page => {
    await page.getByRole('textbox', { name: 'Bottle', exact: true }).fill('My unfinished bottle');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Scan a bottle →' }).click();
    await page.getByRole('button', { name: 'Simulate label match' }).click();
    await page.getByRole('button', { name: "Check Maker's Mark", exact: true }).click();
    await page.getByRole('dialog', { name: 'Use Bottle Check details?' }).waitFor();
    await page.getByRole('button', { name: 'Keep draft', exact: true }).last().click();
    assert.equal(await page.getByRole('textbox', { name: 'Bottle', exact: true }).inputValue(), 'My unfinished bottle');
  });
  await check('membership-resumes-watch', width, 'screen=check&tier=free', async page => {
    await chooseMaker(page);
    await page.getByRole('button', { name: 'Watch in Radar', exact: true }).click();
    await page.getByText(/Continue with Maker's Mark after choosing/).waitFor();
    await page.evaluate(() => window.continuityPreview.completePurchase());
    await page.getByRole('button', { name: 'Continue to watch this bottle' }).click();
    await page.getByRole('textbox', { name: 'Search watched bottles' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Search watched bottles' }).inputValue(), "Maker's Mark");
    await page.getByRole('button', { name: 'WATCH', exact: true }).first().click();
    assert.ok(await page.evaluate(() => window.continuityPreview.preferences.bottleAlertPreferences.bottleNames.includes("Maker's Mark")));
  });
  await check('coverage-prefill-and-status', width, 'screen=coverage&state=VA&area=Richmond&store=Preview%20Bottle%20Shop&address=123%20Main%20St', async page => {
    assert.equal(await page.getByRole('textbox', { name: 'City', exact: true }).inputValue(), 'Richmond');
    assert.equal(await page.getByRole('textbox', { name: 'Store name', exact: true }).inputValue(), 'Preview Bottle Shop');
    await page.getByRole('button', { name: 'Submit request', exact: true }).click();
    await page.getByText('Request received. Follow its progress below.', { exact: true }).waitFor();
    await page.getByText('Preview Bottle Shop, VA', { exact: true }).waitFor();
    await page.getByText('We are reviewing local stores.', { exact: true }).waitFor();
  });
  await check('support-keeps-editable-context', width, 'screen=support&screenContext=unused&context=Bottle%3A%20Maker%27s%20Mark%0ASignal%3A%20member%3Asighting_preview', async page => {
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click();
    assert.match(await page.getByRole('textbox', { name: 'Steps to reproduce' }).inputValue(), /member:sighting_preview/);
    await page.getByRole('textbox', { name: 'Problem description' }).fill('The report did not load after I reopened it.');
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await page.getByText('Thank you—your feedback was sent.', { exact: true }).waitFor();
    assert.match(await page.evaluate(() => window.feedbackSubmitted.steps), /Bottle: Maker's Mark/);
  });
  await check('onboarding-pick-persists', width, 'screen=onboarding&tier=free&step=2', async page => {
    await page.getByRole('button', { name: 'Choose flavors', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Caramel', exact: true }).click();
    await page.getByRole('button', { name: 'See recommendations', exact: true }).click();
    const before = await page.evaluate(() => window.continuityPreview.preferences.collectionPreferences.bottles.length);
    await page.getByRole('button', { name: /^View / }).first().click();
    await page.getByRole('button', { name: 'Save for later', exact: true }).click();
    await page.getByText('Saved in your setup preferences.', { exact: true }).waitFor();
    const ids = await page.evaluate(() => window.continuityPreview.draft.savedBottleIds);
    assert.ok(ids.length > 1);
    assert.equal(await page.evaluate(() => window.continuityPreview.preferences.collectionPreferences.bottles.length), before);
    await page.evaluate(() => window.continuityPreview.navigate('/(app)/(tabs)'));
    await page.getByText("Maker's Mark", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('heading', { name: /Saved from setup|Saved & suggested/ }).count(), 0);
  });
  for (const screen of ['radar', 'membership', 'account', 'rewards']) await check(`full-page-motion-${screen}`, width, `screen=${screen}`, async page => {
    const field = page.getByTestId('signal-wave-field');
    await field.waitFor({ state: 'attached' });
    const bounds = await field.boundingBox();
    const screenBounds = await page.getByTestId('signal-motion-screen').boundingBox();
    assert.ok(bounds.height > 700, 'dots cover the page rather than the heading');
    assert.ok(Math.abs(bounds.height - screenBounds.height) < 2 && Math.abs(bounds.y - screenBounds.y) < 2, 'field fills its fixed screen container');
    assert.equal(await field.locator(':scope > div').count(), 160, 'full spaced field replaces compressed header rows');
    await page.waitForTimeout(150);
  });
  await check('welcome-composition', width, 'screen=welcome', async page => {
    await page.getByText('Bourbon Signal.', { exact: true }).waitFor();
    const heading = page.getByRole('heading', { name: 'Never miss a drop.' });
    await heading.waitFor();
    const create = page.getByRole('button', { name: 'Create account', exact: true });
    const login = page.getByRole('button', { name: 'Already a member? Log in', exact: true });
    const title = await heading.boundingBox(); const createBox = await create.boundingBox(); const loginBox = await login.boundingBox();
    assert.ok(createBox.y >= title.y + title.height && createBox.y - title.y - title.height < 35, 'account actions directly follow headline');
    assert.ok(loginBox.height >= 48 && loginBox.y >= createBox.y + createBox.height && loginBox.y + loginBox.height < 844, 'login is an obvious reachable full-width target');
    const field = page.getByTestId('signal-wave-field'); const bounds = await field.boundingBox();
    assert.ok(bounds.height > 780, 'welcome field reaches behind header and footer');
    for (const text of ['Bourbon Signal.', 'For members 21 and older.']) {
      const transparent = await page.getByText(text, { exact: true }).evaluate(element => {
        let node = element;
        while (node && !node.querySelector('[data-testid="signal-wave-field"]')) {
          if (getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)') return false;
          node = node.parentElement;
        }
        return true;
      });
      assert.equal(transparent, true, 'header and footer have no opaque panels');
    }
    assert.equal(await page.getByText(/Get alerts when bottles you love|Let Bourbon Signal do the heavy lifting/).count(), 0);
    await page.screenshot({ path: path.join(output, `welcome-layout-${width}.png`), fullPage: true });
    await login.click();
    assert.equal(await page.evaluate(() => window.continuityPreview.route.pathname), '/(auth)/sign-in');
  });
  await check('welcome-short-screen', width, 'screen=welcome', async page => {
    const login = page.getByRole('button', { name: 'Already a member? Log in', exact: true });
    await login.scrollIntoViewIfNeeded();
    const loginBox = await login.boundingBox();
    assert.ok(loginBox.y >= 0 && loginBox.y + loginBox.height <= 568, 'login remains reachable on a short screen');
    const create = page.getByRole('button', { name: 'Create account', exact: true });
    await create.scrollIntoViewIfNeeded();
    await create.click();
    assert.equal(await page.evaluate(() => window.continuityPreview.route.pathname), '/(auth)/sign-up');
  }, 568);
}
await check('motion-accessibility', 390, 'screen=home', async page => {
  await page.evaluate(() => window.continuityPreview.navigate('/motion'));
  const dots = page.getByTestId('signal-wave-field').locator(':scope > div');
  await dots.first().waitFor({ state: 'attached' });
  const before = await dots.first().getAttribute('style'); await page.waitForTimeout(300);
  assert.equal(await dots.first().getAttribute('style'), before, 'Reduce Motion keeps the field static');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(150); const moving = await dots.first().getAttribute('style');
  await page.waitForTimeout(300); assert.notEqual(await dots.first().getAttribute('style'), moving, 'wave animates when enabled');
});
await writeFile(path.join(output, 'verification.json'), JSON.stringify({ results, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length }, null, 2));
console.log(JSON.stringify(results));
await browser.close();
if (results.some(result => result.status === 'failed')) process.exit(1);
