import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/dashboard-record-browser.jsx', import.meta.url), 'utf8');
test('mobile scrollbar follows swipes, resize and table changes and cleans up listeners', () => {
  const body = source.slice(source.indexOf('    const list = listRef.current;'), source.indexOf('  }, [tableKey]);', source.indexOf('    const list = listRef.current;')));
  const listeners = {}, windowListeners = {}, observers = [];
  const table = {};
  const list = {scrollWidth: 1200, clientWidth: 320, scrollLeft: 0, querySelector: () => table,
    addEventListener: (name, callback) => { listeners[name] = callback; }, removeEventListener: name => { delete listeners[name]; }};
  const win = {addEventListener: (name, callback) => { windowListeners[name] = callback; }, removeEventListener: name => { delete windowListeners[name]; }};
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  let state = {position: 0, maximum: 0};
  const cleanup = new Function('listRef', 'setHorizontalScroll', 'window', 'ResizeObserver', 'MutationObserver', body)(
    {current: list}, update => { state = update(state); }, win, Observer, Observer);
  assert.deepEqual(state, {position: 0, maximum: 880});
  list.scrollLeft = 240; listeners.scroll();
  assert.equal(state.position, 240);
  list.clientWidth = 600; windowListeners.resize();
  assert.equal(state.maximum, 600);
  list.scrollWidth = 600; observers[0].callback();
  assert.deepEqual(state, {position: 0, maximum: 0});
  list.scrollWidth = 1500; observers[1].callback();
  assert.equal(state.maximum, 900);
  cleanup();
  assert.deepEqual(listeners, {});
  assert.deepEqual(windowListeners, {});
  assert.ok(observers.every(observer => observer.disconnected));
});

test('mobile scroll control is accessible, only shown on overflow and absent from print', () => {
  assert.match(source, /horizontalScroll.maximum > 0 && <label className="dashboard-mobile-scrollbar"/);
  assert.match(source, /aria-label="Scroll table columns"/);
  assert.match(source, /listRef.current.scrollLeft = position/);
  const css = readFileSync(new URL('../src/dashboard-record-browser.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-mobile-scrollbar \{ display: none; \}/);
  assert.match(css, /position: sticky;/);
  assert.match(css, /@media print \{ \.dashboard-mobile-scrollbar \{ display: none !important;/);
});
