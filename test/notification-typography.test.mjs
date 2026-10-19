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

test('compact toast details inherit the readable theme colour rather than a light-theme-only ink', () => {
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const details=css.match(/\.incoming-notification \.notification-message\.compact \.notification-details\{([^}]+)\}/)?.[1];
  assert.match(details, /color:inherit!important/);
  assert.match(details, /font-size:14px!important;line-height:1\.5!important/);
  assert.match(details, /white-space:normal!important/);
});
