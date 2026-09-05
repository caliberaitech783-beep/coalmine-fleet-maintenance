import test from 'node:test';
import assert from 'node:assert/strict';
import { preventTableAutoScroll } from '../src/table-scroll.mjs';

test('only middle-button auto-scroll on table content is prevented', () => {
  for (const [button, table, interactive, expected] of [
    [1,true,false,true], [0,true,false,false], [2,true,false,false],
    [1,false,false,false], [1,true,true,false],
  ]) {
    let prevented = false;
    preventTableAutoScroll({button, target:{closest:selector => selector === '.scroll' ? table : interactive}, preventDefault(){prevented=true;}});
    assert.equal(prevented, expected);
  }
});
