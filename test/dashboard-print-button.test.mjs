import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('dashboard print uses the current table view and precedes Actions', () => {
  const shared = readFileSync(new URL('../src/shared-actions-table.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../src/dashboard-record-browser.jsx', import.meta.url), 'utf8');
  assert.match(shared, /printTitle = ""/);
  assert.match(shared, /printTitle \? exportData \|\| tableExportModel\(dataRows, columns, visible, localFilters, sort\)/);
  assert.ok(shared.indexOf('<ExportMenu printOnly') < shared.indexOf('<Menu resetLabel'));
  assert.match(browser, /<ActionsTable key=\{tableKey\}[^\n]+ printTitle=/);
  assert.match(main, /dashboard-breakdown-day-table"><ActionsTable printTitle=/);
  assert.match(main, /if \(printOnly\) return <button type="button" className=\{className\} onClick=\{printReport\}/);
});
