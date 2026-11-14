import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Oregon browser stays in the bounded prerequisite process group', () => {
 const browser=readFileSync(new URL('../src/core/browser-session.mjs',import.meta.url),'utf8');
 const oregon=readFileSync(new URL('../src/or-browser-collector.mjs',import.meta.url),'utf8');
 assert.match(browser,/detached: options\.detached !== false/);
 assert.match(oregon,/detached: false/);
});

test('scheduled shadow can acquire bounded headless Oregon evidence without publication', () => {
 const workflow=readFileSync(new URL('../../.github/workflows/state-expansion-shadow.yml',import.meta.url),'utf8');
 assert.match(workflow,/BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS:\s*"0"/);
 assert.match(workflow,/BROWSER_HEADLESS:\s*"1"/);
 assert.match(workflow,/BOURBON_SIGNAL_OR_BROWSER_PREREQUISITE_TIMEOUT_MS:\s*"180000"/);
 assert.match(workflow,/BOURBON_SIGNAL_AUTO_DEPLOY:\s*"0"/);
 assert.match(workflow,/ALERT_DELIVERY_ENABLED:\s*"0"/);
 assert.match(workflow,/OR_DAILY_CACHE_DIR:\s*out\/cache\/oregon-daily-inventory/);
 assert.match(workflow,/id: plan/);
 assert.match(workflow,/--plan-only/);
 assert.match(workflow,/id: oregon-daily-cache/);
 assert.match(workflow,/if: steps\.plan\.outputs\.or_selected == 'true'/);
 assert.match(workflow,/oregon-daily-\$\{\{ runner\.os \}\}-\$\{\{ github\.ref_name \}\}-/);
 assert.match(workflow,/steps\.collect-shadow\.outputs\.or_cache_updated == 'true'/);
 assert.match(workflow,/steps\.collect-shadow\.outputs\.or_source_body_fetched == 'true'/);
 assert.match(workflow,/OR-source-cache-receipt\.json/);
 assert.match(workflow,/if: always\(\)/);
});
