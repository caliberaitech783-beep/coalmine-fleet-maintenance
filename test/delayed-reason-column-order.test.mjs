import test from 'node:test';
import assert from 'node:assert/strict';
import {requestColumnsInWorkflowOrder} from '../src/table-actions-model.mjs';

test('Delayed reason follows Actions without changing the order of other columns', () => {
  const columns = ['Reason', 'Actions', 'Started', 'Status', 'Delayed reason', 'Door no.', 'Job reference'].map((label, index) => ({label, index}));
  const ordered = requestColumnsInWorkflowOrder(columns, true);
  assert.deepEqual(ordered.slice(0, 2).map(column => column.label), ['Actions', 'Delayed reason']);
  assert.deepEqual(ordered.filter(column => column.label !== 'Delayed reason'), requestColumnsInWorkflowOrder(columns.filter(column => column.label !== 'Delayed reason'), true));
  assert.equal(ordered[1], columns[4]);
});
