import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {tableModel,jobReferenceColumnsLast,projectTableRow,tableCellText} from '../src/table-actions-model.mjs';

test('dashboard preserves status, breakdown days, started order including request lists',()=>{
  const browser=fs.readFileSync(new URL('../src/dashboard-record-browser.jsx',import.meta.url),'utf8');
  const shared=fs.readFileSync(new URL('../src/shared-actions-table.jsx',import.meta.url),'utf8');
  assert.match(browser,/<ActionsTable[^>]*preserveColumnOrder/);
  assert.match(browser,/<th>Status<\/th><th>Days of breakdown<\/th><th[^>]*>Started<\/th>/);
  assert.match(shared,/preserveColumnOrder \? jobReferenceColumnsLast\(originalColumns\)/);
  for(const labels of [['Status','Days of breakdown','Started','Door'],['Job reference','Status','Days of breakdown','Started','Door']]){
    const h=React.createElement;
    const {columns}=tableModel(h('thead',{},h('tr',{},labels.map(label=>h('th',{key:label},label)))));
    const ordered=jobReferenceColumnsLast(columns);
    assert.deepEqual(ordered.slice(0,3).map(c=>c.label),['Status','Days of breakdown','Started']);
    const row=h('tr',{},labels.map(label=>h('td',{key:label},label)));
    assert.equal(tableCellText(projectTableRow(row,ordered.map(c=>c.index))),ordered.map(c=>c.label).join(' '));
  }
});
