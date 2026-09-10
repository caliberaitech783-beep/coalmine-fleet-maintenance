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

function harness(component, {storage = new Map(), start = 100000, storageUnavailable = false} = {}) {
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
    sessionStorage: {getItem(key) {if (storageUnavailable) throw Error('Unavailable'); return storage.get(key);}, setItem(key, value) {if (storageUnavailable) throw Error('Unavailable'); storage.set(key, value);}},
    fetch: () => new Promise(() => {}), watchRequestRefresh: () => () => {},
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

test('login prompt survives refresh, remembers dismissal, and opens again for the next sign-in', () => {
  const storage = new Map();
  const props = {session: {token: 'session-one'}};
  let view = harness('AiFeeder', {storage});
  let tree = view.render(props);
  assert.equal(panel(tree).props.closeAvailableAt, 160000);
  nodes(tree, node => node.props.className === 'ai-feeder-trigger')[0].props.onClick();
  assert.equal(panel(view.render(props)).props.closeAvailableAt, 160000, 'header trigger cannot turn a locked login into a manual opening');
  panel(tree).props.onClose();
  assert.ok(panel(view.render(props)), 'parent also rejects premature close');
  view.dispose();
  view = harness('AiFeeder', {storage, start: 145000});
  tree = view.render(props);
  assert.equal(panel(tree).props.closeAvailableAt, 160000, 'refresh resumes the same deadline');
  view.advance(15000);
  panel(tree).props.onClose();
  assert.equal(panel(view.render(props)), undefined);
  assert.equal(storage.get('aiFeederGreeted'), 'yes');
  view.dispose();
  view = harness('AiFeeder', {storage, start: 200000});
  assert.equal(panel(view.render(props)), undefined, 'dismissed login does not reopen on refresh');
  // completeLogin clears this marker on every successful sign-in.
  storage.delete('aiFeederGreeted');
  tree = view.render({session: {token: 'session-two'}});
  assert.equal(panel(tree).props.closeAvailableAt, 260000);
  view.dispose();
});

test('login prompt still opens when browser storage is unavailable', () => {
  const view = harness('AiFeeder', {storageUnavailable: true});
  assert.equal(panel(view.render({session: {token: 'session-one'}})).props.closeAvailableAt, 160000);
  view.dispose();
});
