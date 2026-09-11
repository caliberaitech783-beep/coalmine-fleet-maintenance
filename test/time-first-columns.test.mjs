import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {projectTableRow,tableCellText,tableModel} from '../src/table-actions-model.mjs';

test('table timestamps display time first without changing model or sort values',()=>{
  const row=React.createElement('tr',{},React.createElement('td',{'data-sort-value':'2026-09-04T12:01:22Z'},React.createElement('span',{},'04-09-2026 05:31:22 PM')));
  const projected=projectTableRow(row,[0]);
  assert.equal(tableCellText(projected),'05:31:22 PM 04-09-2026');
  assert.equal(tableCellText(row),'04-09-2026 05:31:22 PM');
  assert.equal(projected.props.children[0].props['data-sort-value'],'2026-09-04T12:01:22Z');
});
