import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestMeterReadingLabel} from '../request-equipment.mjs';

test('all manager closed histories enable completion details without changing active queues', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /<BreakdownTable rows=\{visibleDetailRows\}[^>]*showCompletionDetails=\{queueTab==="history"\}/);
  assert.match(source, /showCompletionDetails = false/);
  assert.ok(source.includes('["maintenanceWork", "Work completion action taken"], ["closingHmr", "Closing HMR"], ["closingKmr", "Closing KMR"]'));
  for (const [key, type] of [['closingHmr', 'HMR'], ['closingKmr', 'KMR']]) {
    assert.ok(source.includes(`if (key === "${key}") return breakdownMeterValue(row, "${type}", "closing");`));
    assert.ok(source.includes(`workflowHeader("${key}", "Closing ${type}")`));
  }
  assert.ok(source.includes('text={r.maintenanceWork || "—"}'));
  assert.equal(requestMeterReadingLabel({closingMeterReadings: {HMR: '0', KMR: '42000'}}, 'closing'), 'HMR 0 · KMR 42000');
});
