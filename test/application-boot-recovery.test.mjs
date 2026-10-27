import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import express from 'express';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(bootScript, 'test the actual inline startup handler');
const recoveryKey = 'bdms:lazy-chunk-recovery-at';

function boot({href = 'https://pulse.cmll.in/?view=dashboard#fleet', mounted = false, storage = new Map(), blockedStorage = false} = {}) {
  const listeners = new Map();
  const navigations = [];
  const buttonListeners = new Map();
  let replacements = 0;
  let markup = '';
  const root = {
    querySelector(selector) {
      if (selector === '#boot-status') return mounted ? null : {};
      if (selector === 'button') return {addEventListener: (name, callback) => buttonListeners.set(name, callback)};
    },
    set innerHTML(value) { replacements++; markup = value; },
  };
  const document = {getElementById: id => id === 'root' ? root : null};
  let now = 1793093000000;
  const window = {
    location: {href, origin: new URL(href).origin, replace: url => navigations.push(url)},
    addEventListener: (name, callback) => listeners.set(name, callback),
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('Storage blocked'); storage.set(key, value); },
    },
  };
  vm.runInNewContext(bootScript, {window, document, URL, Date: {now: () => now}});
  return {
    window, storage, navigations, replacements: () => replacements, markup: () => markup,
    advance: ms => { now += ms; },
    event: (name, event) => listeners.get(name)(event),
    clickRefresh: () => buttonListeners.get('click')(),
  };
}

const moduleFailure = () => ({target: {tagName: 'SCRIPT', type: 'module', src: 'https://pulse.cmll.in/app-assets/index-old.js'}});

test('a failed startup module recovers once with a fresh URL and preserves route and session storage', () => {
  const storage = new Map([['bdms-session', 'existing-sign-in']]);
  const view = boot({storage});
  view.event('error', moduleFailure());
  assert.equal(view.navigations.length, 1);
  const recovery = new URL(view.navigations[0]);
  assert.equal(recovery.searchParams.get('view'), 'dashboard');
  assert.equal(recovery.hash, '#fleet');
  assert.ok(recovery.searchParams.has('asset-recovery'));
  assert.equal(storage.get('bdms-session'), 'existing-sign-in');
  assert.ok(storage.has(recoveryKey));
  view.event('error', moduleFailure());
  assert.equal(view.navigations.length, 1, 'duplicate errors cannot issue another navigation');
  assert.equal(view.replacements(), 1);

  const nextLoad = boot({href: recovery.toString(), storage});
  nextLoad.event('error', moduleFailure());
  assert.equal(nextLoad.navigations.length, 0, 'a failed recovery displays a manual retry instead of looping');
  assert.match(nextLoad.markup(), /Refresh application/);
});

test('URL guard prevents automatic reload loops even when storage is blocked', () => {
  const first = boot({blockedStorage: true});
  first.event('unhandledrejection', {reason: new Error('Failed to fetch dynamically imported module')});
  assert.equal(first.navigations.length, 1);
  const second = boot({href: first.navigations[0], blockedStorage: true});
  second.advance(120_000);
  second.event('error', moduleFailure());
  assert.equal(second.navigations.length, 0);
  second.clickRefresh();
  assert.equal(second.navigations.length, 1);
  assert.notEqual(second.navigations[0], first.navigations[0], 'manual refresh uses a fresh cache-busting URL');
});

test('recent recovery from the React boundary suppresses another automatic boot retry', () => {
  const view = boot({storage: new Map([[recoveryKey, '1793092999999']])});
  view.event('error', moduleFailure());
  assert.equal(view.navigations.length, 0);
  assert.match(view.markup(), /could not finish loading/);
});

test('boot handler never overwrites an already mounted application', () => {
  const view = boot({mounted: true});
  view.event('error', moduleFailure());
  view.event('error', {message: 'Importing a module script failed'});
  view.event('unhandledrejection', {reason: new Error('ChunkLoadError')});
  assert.equal(view.replacements(), 0);
  assert.equal(view.navigations.length, 0);
});

test('unrelated scripts, images and ordinary application errors do not trigger boot recovery', () => {
  for (const event of [
    {target: {tagName: 'SCRIPT', type: 'module', src: 'https://other.example/app-assets/analytics.js'}},
    {target: {tagName: 'SCRIPT', type: 'module', src: 'https://pulse.cmll.in/analytics.js'}},
    {target: {tagName: 'SCRIPT', type: 'text/javascript', src: 'https://pulse.cmll.in/app-assets/analytics.js'}},
    {target: {tagName: 'IMG', src: 'https://pulse.cmll.in/logo.png'}},
    {message: 'Ordinary application error'},
  ]) {
    const view = boot();
    view.event('error', event);
    assert.equal(view.replacements(), 0);
    assert.equal(view.navigations.length, 0);
  }
});

test('development entry module failures are recoverable', () => {
  const view = boot();
  view.event('error', {target: {tagName: 'SCRIPT', type: 'module', src: '/src/main.jsx'}});
  assert.equal(view.navigations.length, 1);
});

test('real HTTP asset routing returns non-cached misses, immutable existing files, and keeps SPA navigation', async t => {
  const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const start = serverSource.indexOf("app.use('/app-assets',express.static(");
  const end = serverSource.indexOf('app.use((error,req,res,next)=>', start);
  assert.ok(start >= 0 && end > start);
  const app = express();
  const root = fileURLToPath(new URL('../', import.meta.url));
  // Use existing source files as the static fixture; tests never build, create,
  // overwrite or delete files, and do not need a production bundle on disk.
  const fixtureExpress = {static(directory, options) {
    return express.static(directory === path.join(root, 'app-assets') ? path.join(root, 'src') : directory, options);
  }};
  new Function('app', 'express', 'path', 'staticRoot', serverSource.slice(start, end))(app, fixtureExpress, path, root);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['missing.js', 'missing.css', 'missing.js?version=old', 'nested/missing.js']) {
    const response = await fetch(`${base}/app-assets/${name}`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.doesNotMatch(await response.text(), /<!doctype|id="root"/);
  }
  const head = await fetch(`${base}/app-assets/missing.js`, {method: 'HEAD'});
  assert.equal(head.status, 404);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(await head.text(), '');
  const existing = await fetch(`${base}/app-assets/request-refresh.mjs`);
  assert.equal(existing.status, 200);
  assert.match(existing.headers.get('cache-control'), /max-age=31536000.*immutable/);
  assert.match(await existing.text(), /export function watchRequestRefresh/);
  const navigation = await fetch(`${base}/dashboard`);
  assert.equal(navigation.status, 200);
  assert.match(navigation.headers.get('content-type'), /text\/html/);
  assert.match(await navigation.text(), /id="root"/);
});
