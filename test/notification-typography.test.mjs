import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('notification panel and toast have larger, scoped, wrapping typography', () => {
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.notification-popover header>b,\.incoming-notification-link>span>b\{font-size:18px!important/);
  assert.match(css,/\.incoming-notification \.notification-message \.notification-site\{font-size:18px!important/);
  assert.match(css,/\.notification-popover \.notification-list>button \.notification-details,\.incoming-notification \.notification-details\{font-size:16px!important;line-height:1\.6!important;overflow-wrap:anywhere/);
  assert.match(css,/\.notification-popover \.notification-list>button>small,\.incoming-notification-link small\{font-size:14px!important/);
  assert.match(css,/\.notification-popover \.notification-site-filter select\{font-size:16px!important/);
});
