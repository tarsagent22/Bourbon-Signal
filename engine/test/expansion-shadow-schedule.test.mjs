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
 assert.match(workflow,/if: always\(\)/);
});
