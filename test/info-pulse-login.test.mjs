import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('function AiFeederPanel('), main.indexOf('function NotificationEntryField('));
const {code} = await transformWithOxc(source, 'InfoPulse.jsx', {jsx: {runtime: 'classic'}});
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props.children, predicate)];
}
const byLabel = (tree, label) => nodes(tree, node => node.props['aria-label'] === label)[0];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : String(tree ?? '');
const panel = tree => nodes(tree, node => node.type?.name === 'AiFeederPanel')[0];

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function harness(component, {prompt = () => new Promise(() => {}), start = 100000} = {}) {
  let now = start, cursor = 0, dirty = false, timerId = 0;
  const slots = [], effects = [], intervals = new Map(), listeners = new Map();
  const bindings = {
    React, Date: {now: () => now},
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], next => {const value = typeof next === 'function' ? next(slots[at]) : next; if (!Object.is(value, slots[at])) {slots[at] = value; dirty = true;}}];
    },
    useRef(initial) {const at = cursor++; return slots[at] ||= {current: initial};},
    useMemo: callback => callback(),
    useEffect(callback, dependencies) {
      const at = cursor++, old = slots[at];
      if (!old || dependencies.some((value, index) => !Object.is(value, old.dependencies[index]))) {
        slots[at] = {dependencies};
        effects.push(() => {old?.cleanup?.(); slots[at].cleanup = callback();});
      }
    },
    window: {setInterval(callback) {intervals.set(++timerId, callback); return timerId;}, clearInterval: id => intervals.delete(id)},
    document: {activeElement: {focus() {}}, body: {style: {overflow: ''}}, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name)},
    fetch: (url, options) => String(url).startsWith('/api/info-pulse/prompt') ? prompt(url, options) : new Promise(() => {}), watchRequestRefresh: () => () => {},
    requestsVisibleToMisWorkspace: rows => rows, buildInfoPulseCases: () => [],
    createPortal: children => children, Activity: () => null, MapPin: () => null, X: () => null, InfoPulseContent: () => null,
  };
  const Component = new Function(...Object.keys(bindings), `${code}; return ${component};`)(...Object.values(bindings));
  return {
    render(props) {let tree, count = 0; do {dirty = false; cursor = 0; tree = Component(props); effects.splice(0).forEach(run => run()); assert.ok(++count < 10, 'stable render');} while (dirty); return tree;},
    advance(ms) {now += ms; [...intervals.values()].forEach(callback => callback());},
    escape() {listeners.get('keydown')?.({key: 'Escape'});},
    dispose() {slots.forEach(slot => slot?.cleanup?.());},
    intervals,
  };
}

test('login countdown blocks X and Escape for the full minute, then allows manual close without auto-close', () => {
  const view = harness('AiFeederPanel');
  let closes = 0;
  const props = {closeAvailableAt: 160000, onClose: () => closes++};
  let tree = view.render(props);
  assert.match(text(tree), /01:00/);
  assert.equal(byLabel(tree, 'Close Info Pulse'), undefined);
  view.escape();
  view.advance(59000);
  tree = view.render({...props, refreshing: true, updatedAt: 159000});
  assert.match(text(tree), /00:01/);
  assert.equal(byLabel(tree, 'Close Info Pulse'), undefined);
  view.escape();
  assert.equal(closes, 0);
  view.advance(1000);
  tree = view.render(props);
  assert.match(text(tree), /00:00/);
  assert.ok(byLabel(tree, 'Close Info Pulse'));
  assert.equal(closes, 0, 'expiry does not close the dialog');
  assert.equal(view.intervals.size, 0);
  byLabel(tree, 'Close Info Pulse').props.onClick();
  assert.equal(closes, 1);
  view.escape();
  assert.equal(closes, 2);
  view.dispose();
});

test('manual opening remains immediately closable and creates no countdown', () => {
  const view = harness('AiFeederPanel');
  let closes = 0;
  const tree = view.render({onClose: () => closes++});
  assert.ok(byLabel(tree, 'Close Info Pulse'));
  assert.equal(nodes(tree, node => node.props.role === 'timer').length, 0);
  assert.equal(view.intervals.size, 0);
  view.escape();
  assert.equal(closes, 1);
  view.dispose();
});

test('login prompt opens only when the server says so, resumes its countdown on refresh, and stays closed for sign-ins within four hours', async () => {
  const calls = [], responses = [];
  const prompt = (url, options) => {calls.push({url, options}); return Promise.resolve({ok: true, json: async () => responses.shift()});};
  const props = {session: {token: 'session-one'}};
  responses.push({show: true, closeAfterMs: 60000});
  let view = harness('AiFeeder', {prompt});
  let tree = view.render(props);
  assert.equal(panel(tree), undefined, 'nothing opens before the server answers');
  await settle();
  tree = view.render(props);
  assert.equal(panel(tree).props.closeAvailableAt, 160000);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^\/api\/info-pulse\/prompt\?t=100000$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer session-one');
  nodes(tree, node => node.props.className === 'ai-feeder-trigger')[0].props.onClick();
  assert.equal(panel(view.render(props)).props.closeAvailableAt, 160000, 'header trigger cannot turn a locked login into a manual opening');
  panel(tree).props.onClose();
  assert.ok(panel(view.render(props)), 'parent also rejects premature close');
  view.dispose();
  // A refresh inside the mandatory minute resumes the same deadline instead of restarting it.
  responses.push({show: true, closeAfterMs: 15000});
  view = harness('AiFeeder', {prompt, start: 145000});
  view.render(props);
  await settle();
  tree = view.render(props);
  assert.equal(panel(tree).props.closeAvailableAt, 160000);
  view.advance(15000);
  panel(tree).props.onClose();
  assert.equal(panel(view.render(props)), undefined);
  view.dispose();
  // Another sign-in within four hours stays closed; once the server allows it again, it opens.
  responses.push({show: false, closeAfterMs: 0});
  view = harness('AiFeeder', {prompt, start: 200000});
  view.render({session: {token: 'session-two'}});
  await settle();
  assert.equal(panel(view.render({session: {token: 'session-two'}})), undefined);
  responses.push({show: true, closeAfterMs: 60000});
  view.render({session: {token: 'session-three'}});
  await settle();
  assert.equal(panel(view.render({session: {token: 'session-three'}})).props.closeAvailableAt, 260000);
  assert.equal(calls.length, 4);
  view.dispose();
});

test('a failed or refused prompt request never opens the login prompt, and the header trigger still opens manually', async () => {
  const props = {session: {token: 'session-one'}};
  for (const prompt of [() => Promise.reject(new Error('offline')), () => Promise.resolve({ok: false, json: async () => ({error: 'expired'})})]) {
    const view = harness('AiFeeder', {prompt});
    view.render(props);
    await settle();
    let tree = view.render(props);
    assert.equal(panel(tree), undefined);
    nodes(tree, node => node.props.className === 'ai-feeder-trigger')[0].props.onClick();
    tree = view.render(props);
    assert.equal(panel(tree).props.closeAvailableAt, 0);
    panel(tree).props.onClose();
    assert.equal(panel(view.render(props)), undefined);
    view.dispose();
  }
});

test('a prompt answer arriving after sign-out is ignored', async () => {
  let resolve;
  const view = harness('AiFeeder', {prompt: () => new Promise(done => {resolve = done;})});
  view.render({session: {token: 'session-one'}});
  view.render({session: null});
  resolve({ok: true, json: async () => ({show: true, closeAfterMs: 60000})});
  await settle();
  assert.equal(panel(view.render({session: null})), undefined);
  view.dispose();
});
