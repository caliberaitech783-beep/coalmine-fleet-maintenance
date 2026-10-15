import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileTableWindow, sliceTableBodies} from '../src/mobile-table-window.mjs';

test('phone pages remain bounded and reach every row across grouped bodies', () => {
  const bodies = new Map([['a', Array.from({length: 13}, (_, i) => i)], ['b', Array.from({length: 64}, (_, i) => i + 13)]]);
  const all = [];
  for (let page = 0; page < 4; page++) {
    const window = mobileTableWindow(77, page);
    const visible = [...sliceTableBodies(bodies, window.start, 25, () => true).values()].flat();
    assert.ok(visible.length <= 25);
    all.push(...visible);
  }
  assert.deepEqual(all, Array.from({length: 77}, (_, i) => i));
});

test('a shrinking result clamps the page and empty results remain valid', () => {
  assert.deepEqual(mobileTableWindow(26, 20), {page: 1, pages: 2, start: 25, end: 26});
  assert.deepEqual(mobileTableWindow(0, 20), {page: 0, pages: 1, start: 0, end: 0});
});
