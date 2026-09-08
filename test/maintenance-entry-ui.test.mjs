import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { transformWithOxc } from 'vite';
import * as equipment from '../request-equipment.mjs';
import { recordsForSite } from '../site-location.mjs';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const formStart = source.indexOf('function MaintenanceForm(');
const formSource = source.slice(formStart, source.indexOf('\n}\n', formStart) + 3);
const speechSource = source.slice(source.indexOf('const speechLanguages ='), source.indexOf('function readMeterEvidence('));
const { code: formCode } = await transformWithOxc(formSource, 'maintenance-form.jsx', { jsx: { runtime: 'classic' } });
const { code: speechCode } = await transformWithOxc(speechSource, 'speech-complaint.jsx', { jsx: { runtime: 'classic' } });
const Null = () => null;
const all = (tree, predicate) => {
  const result = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return result;
};
const byType = (tree, type) => all(tree, node => node.type === type)[0];
function harness(code, name, extra = {}) {
  const slots = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const scope = { React, useState, useRef: value => useState(() => ({ current: value }))[0], useEffect: () => {}, ...extra };
  const component = new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
  return { render(props = {}) { cursor = 0; return component(props); } };
}
const records = [
  { id: 1, group: 'EXCAVATOR', equipmentName: 'Hydraulic excavator', door: 'EX-17', registration: 'MH-01-AA-1010', chassis: 'CH-100', make: 'Komatsu', model: 'PC200-8', currentLocation: 'Sasti OB' },
  { id: 2, group: 'EXCAVATOR', equipmentName: 'Hydraulic excavator', door: 'EX-18', chassis: 'CH-200', make: 'Tata Hitachi', currentLocation: 'Sasti OB' },
  { id: 3, group: 'DOZER', equipmentName: 'Dozer', door: 'DZ-17', chassis: 'CH-300', currentLocation: 'Sasti OB' },
  { id: 4, group: 'EXCAVATOR', equipmentName: 'Hydraulic excavator', door: 'EX-19', chassis: 'CH-400', currentLocation: 'Jayant OB' },
];
test('equipment search handles partial identifiers, unordered terms and metadata within the selected group/site', () => {
  const scoped = equipment.requestEquipmentRecordsForGroup(recordsForSite(records, 'Sasti OB'), 'EXCAVATOR');
  for (const query of ['17', 'ex17', 'mh01aa', '100', 'pc200', 'komatsu 17', '1010 hydraulic']) {
    assert.deepEqual(equipment.requestEquipmentSearchOptions(scoped, query).map(item => item.record.id), [1], query);
  }
  for (const query of ['dozer', 'DZ17', 'Jayant', 'EX19', 'does not exist']) {
    assert.deepEqual(equipment.requestEquipmentSearchOptions(scoped, query), [], query);
  }
  assert.deepEqual(equipment.requestEquipmentSearchOptions(scoped, '').map(item => item.record.id), [1, 2]);
  const duplicateLabel = { ...records[0], id: 5 };
  assert.deepEqual(equipment.requestEquipmentSearchOptions([records[0], duplicateLabel, records[0]], 'EX17').map(item => item.record.id), [1, 5]);
});

test('changing equipment group clears the old vehicle, hidden door and fetched details', async () => {
  const EquipmentCombobox = () => null;
  const alerts = [];
  const app = harness(formCode, 'MaintenanceForm', {
    ...equipment, recordsForSite, EquipmentCombobox, Modal: Null, SpeechComplaint: Null,
    Clock: Null, MapPin: Null, ChevronRight: Null, CheckCircle2: Null, RefreshCw: Null, AlertTriangle: Null,
    TIME_24H_PATTERN: '.*', alert: message => alerts.push(message),
  });
  const props = { equipmentRecords: records, equipmentLoaded: true, assignedLocation: 'Sasti OB' };
  let tree = app.render(props);
  const group = () => all(tree, node => node.props.name === 'equipmentGroup')[0];
  const combo = () => byType(tree, EquipmentCombobox);
  const door = () => all(tree, node => node.props.name === 'door')[0].props.value;
  assert.equal(combo().props.disabled, true);
  group().props.onChange({ target: { value: 'EXCAVATOR' } });
  tree = app.render(props);
  assert.deepEqual(combo().props.records.map(row => row.id), [1, 2]);
  combo().props.onSelect(records[0]);
  tree = app.render(props);
  assert.equal(door(), 'EX-17');
  assert.equal(group().props.value, 'EXCAVATOR');
  combo().props.onSelect(null);
  tree = app.render(props);
  assert.equal(door(), '');
  await byType(tree, 'form').props.onSubmit({ preventDefault() {} });
  assert.match(alerts[0], /Select an equipment/);
  combo().props.onSelect(records[1]);
  tree = app.render(props);
  group().props.onChange({ target: { value: 'DOZER' } });
  tree = app.render(props);
  assert.equal(combo().props.value, '3'); // The only vehicle in this group is selected automatically.
  assert.equal(door(), 'DZ-17');
  group().props.onChange({ target: { value: 'EXCAVATOR' } });
  tree = app.render(props);
  assert.equal(combo().props.value, '');
  assert.equal(door(), '');
  assert.equal(all(tree, node => node.props.value === 'CH-300').length, 0);
});

function speechHarness({ supported = true, permission } = {}) {
  let recognition, microphoneRequests = 0;
  const timers = new Map();
  class Speech {
    constructor() { recognition = this; }
    start() { this.onstart(); }
    stop() { this.onend(); }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.mimeType = 'audio/mp4'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['test recorded audio']) });
      this.onstop();
    }
  }
  class Reader { readAsDataURL() { this.result = 'data:audio/mp4;base64,dGVzdA=='; this.onload(); } }
  const app = harness(speechCode, 'EnhancedSpeechComplaint', {
    Mic: Null, Square: Null, Blob, FileReader: Reader, MediaRecorder: Recorder,
    window: { SpeechRecognition: supported ? Speech : undefined, MediaRecorder: Recorder },
    navigator: { mediaDevices: { getUserMedia: () => { microphoneRequests++; return permission || Promise.resolve({ getTracks: () => [{ stop() {} }] }); } } },
    setTimeout: callback => { const id = Symbol(); timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: () => { throw new Error('Speech must not be translated into a different language.'); },
  });
  return { ...app, get recognition() { return recognition; }, get microphoneRequests() { return microphoneRequests; } };
}

for (const [lang, transcript] of [
  ['hi-IN', 'इंजन में तेल का रिसाव नहीं है। ब्रेक काम नहीं कर रहे हैं और टायर पंक्चर है।'],
  ['en-IN', 'The engine is not leaking. The brake is broken and the tyre is punctured.'],
]) test(`speech retains the full ${lang} complaint and audio, including negation and multiple faults`, async () => {
  const app = speechHarness();
  let tree = app.render();
  byType(tree, 'select').props.onChange({ target: { value: lang } });
  tree = app.render();
  await byType(tree, 'button').props.onClick();
  tree = app.render();
  assert.equal(app.recognition.lang, lang);
  assert.equal(byType(tree, 'select').props.disabled, true);
  const result = [{ transcript }];
  result.isFinal = true;
  app.recognition.onresult({ resultIndex: 0, results: [result] });
  byType(tree, 'button').props.onClick();
  tree = app.render();
  assert.equal(byType(tree, 'textarea').props.value, transcript);
  assert.equal(byType(tree, 'textarea').props.lang, lang);
  assert.equal(byType(tree, 'select').props.disabled, false);
  assert.equal(byType(tree, 'input').props.value, 'data:audio/mp4;base64,dGVzdA==');
  assert.ok(byType(tree, 'audio'));
});

test('language selection is locked while microphone permission is pending and duplicate clicks start only one recording', async () => {
  let allow;
  const permission = new Promise(resolve => { allow = resolve; });
  const app = speechHarness({ permission });
  const start = byType(app.render(), 'button').props.onClick;
  const pending = start();
  await start();
  assert.equal(byType(app.render(), 'select').props.disabled, true);
  assert.equal(app.microphoneRequests, 1);
  allow({ getTracks: () => [{ stop() {} }] });
  await pending;
  app.recognition.stop();
});

test('audio-only browsers still save the recording and keep user-entered text', async () => {
  const app = speechHarness({ supported: false });
  let tree = app.render();
  byType(tree, 'textarea').props.onChange({ target: { value: 'ब्रेक काम नहीं कर रहा है।' } });
  tree = app.render();
  await byType(tree, 'button').props.onClick();
  tree = app.render();
  byType(tree, 'button').props.onClick();
  tree = app.render();
  assert.equal(byType(tree, 'textarea').props.value, 'ब्रेक काम नहीं कर रहा है।');
  assert.ok(byType(tree, 'audio'));
});
