import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNewHanoverWordPressPosts } from '../src/collectors/north-carolina-intelligence.mjs';

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
