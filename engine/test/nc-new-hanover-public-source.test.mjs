import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newHanoverFailureOutcome,
  newHanoverProductWatchEligibility,
  parseNewHanoverWordPressPosts,
} from '../src/collectors/north-carolina-intelligence.mjs';

test('New Hanover WordPress fallback extracts official barrel-pick product cards without claiming shelf inventory', () => {
  const posts = [{
    link: 'https://www.newhanovercountyabc.com/barrels/',
    modified_gmt: '2026-07-28T20:15:00',
    title: { rendered: 'Barrel Picks' },
    content: { rendered: '<h1 style="text-align: center">Elijah Craig Barrel Proof 8Y</h1><p><strong>NC Code:</strong> 66339<br/>.75L | 128 Proof | $89.95</p>' },
  }];

  const result = parseNewHanoverWordPressPosts(posts);
  assert.equal(result.length, 1);
  assert.equal(result[0].rawName, 'Elijah Craig Barrel Proof 8Y');
  assert.equal(result[0].ncCode, '66339');
  assert.equal(result[0].price, 89.95);
  assert.equal(result[0].sourceEventAt, '2026-07-28T20:15:00.000Z');
  assert.equal(result[0].sourceUrl, posts[0].link);
});

test('New Hanover WordPress fallback rejects malformed/non-bourbon content', () => {
  assert.deepEqual(parseNewHanoverWordPressPosts({ error: true }), []);
  assert.deepEqual(parseNewHanoverWordPressPosts([{ content: { rendered: '<h1>Vodka</h1>' } }]), []);
});

test('New Hanover WordPress fallback retains the newest post for a duplicate NC code', () => {
  const card = (name, price) => `<h1 style="text-align: center">${name}</h1><p><strong>NC Code:</strong> 66339<br/>.75L | 128 Proof | $${price}</p>`;
  const result = parseNewHanoverWordPressPosts([
    {
      link: 'https://www.newhanovercountyabc.com/new-barrel/',
      modified_gmt: '2026-07-28T20:15:00',
      content: { rendered: card('Elijah Craig New Barrel', '99.95') },
    },
    {
      link: 'https://www.newhanovercountyabc.com/old-barrel/',
      modified_gmt: '2024-07-28T20:15:00',
      content: { rendered: card('Elijah Craig Old Barrel', '79.95') },
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].rawName, 'Elijah Craig New Barrel');
  assert.equal(result[0].price, 99.95);
  assert.equal(result[0].sourceEventAt, '2026-07-28T20:15:00.000Z');
});

test('New Hanover barrel-pick product cards are never watch-alertable', () => {
  assert.equal(newHanoverProductWatchEligibility({ route: 'wordpress_rest_fallback', sourceEventAt: '2026-07-28T20:15:00.000Z' }), false);
  assert.equal(newHanoverProductWatchEligibility({ route: 'wordpress_rest_fallback', sourceEventAt: null }), false);
  assert.equal(newHanoverProductWatchEligibility({ route: 'wordpress_page' }), false);
});

test('New Hanover failure reporting preserves the failing fallback outcome', () => {
  const outcome = newHanoverFailureOutcome({
    page: { ok: true, status: 200, text: '<html>No product cards</html>', error: null },
    fallback: { ok: false, status: 503, text: '', error: 'upstream unavailable' },
    fallbackParseError: null,
  });
  assert.equal(outcome.status, 503);
  assert.match(outcome.error, /WordPress REST.*503.*upstream unavailable/i);
  assert.equal(outcome.primaryStatus, 200);
  assert.equal(outcome.fallbackStatus, 503);

  const transportFailure = newHanoverFailureOutcome({
    page: { ok: true, status: 200, text: '<html>No product cards</html>' },
    fallback: { ok: false, status: 0, text: '', error: 'timeout' },
  });
  assert.equal(transportFailure.status, 0);
  assert.equal(transportFailure.fallbackStatus, 0);
  assert.match(transportFailure.error, /HTTP 0.*timeout/i);
});

test('New Hanover failure reporting distinguishes invalid fallback JSON', () => {
  const outcome = newHanoverFailureOutcome({
    page: { ok: false, status: 403, text: '', error: 'Forbidden' },
    fallback: { ok: true, status: 200, text: '{bad json', error: null },
    fallbackParseError: 'Unexpected token',
  });
  assert.equal(outcome.status, 200);
  assert.match(outcome.error, /invalid JSON.*Unexpected token/i);
});
