import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [component,styles,corrections,transfers,main]=await Promise.all([
  readFile(new URL('../src/searchable-select.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/searchable-select.css',import.meta.url),'utf8'),
  readFile(new URL('../src/request-corrections.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/vehicle-transfer-workflow.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),
]);

test('shared searchable picker supports accessible search, keyboard selection, and form submission',()=>{
  assert.match(component,/role="combobox"/);
  assert.match(component,/aria-autocomplete="list"/);
  assert.match(component,/role="listbox"/);
  assert.match(component,/ArrowDown/);
  assert.match(component,/event\.key==='Enter'/);
  assert.match(component,/type="hidden" name=\{name\} value=\{selectedValue\}/);
  assert.match(component,/matching\.slice\(0,100\)/);
  assert.match(styles,/max-height:min\(320px,42dvh\)/);
  assert.match(styles,/@media\(max-width:700px\)/);
});

test('large request, vehicle, and employee lists use search while short fixed lists remain selects',()=>{
  assert.match(corrections,/Search request, door, equipment, chassis, or site/);
  assert.match(corrections,/Search request, user, site, reason, or status/);
  assert.match(transfers,/Search door, registration, make, model, chassis, or site/);
  assert.match(main,/Search employee name, login, site, or mobile/);
  assert.match(corrections,/Correction type \*/);
});
