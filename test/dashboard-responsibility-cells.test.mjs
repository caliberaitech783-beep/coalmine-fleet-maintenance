import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {withDashboardResponsibilityCells} from '../src/dashboard-responsibility-cells.mjs';
import {tableModel} from '../src/table-actions-model.mjs';
const h=React.createElement;
test('dashboard responsibility values become real sortable and exportable cells',()=>{
  const children=[h('thead',{},h('tr',{},h('th',{},'Job reference'))),h('tbody',{},
    h('tr',{'data-request-reference':'REQ-1'},h('td',{},'REQ-1')),
    h('tr',{'data-oem-responsibility':'NON OEM'},h('td',{},'REQ-2')),
    h('tr',{},h('td',{},'REQ-3')))];
  const result=withDashboardResponsibilityCells(children,new Map([['REQ-1',{oemResponsibility:'OEM'}]]));
  const {columns,sections}=tableModel(result);
  assert.equal(columns[0].key,'oemResponsibility');
  assert.equal(columns[0].label,'OEM / NON OEM');
  const rows=React.Children.toArray(sections.find(s=>s.type==='tbody').props.children);
  assert.deepEqual(rows.map(row=>columns[0].value(row)),['OEM','NON OEM','Not selected']);
  assert.equal(withDashboardResponsibilityCells(result,new Map()),result);
});
