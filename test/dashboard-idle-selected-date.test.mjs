import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {throughputSectionExport} from '../src/dashboard-section-export.mjs';

test('selected-date idle column and export do not reuse live idle total', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.ok(main.includes('idle: movementRequestRowsForShift(siteRequests, breakdownSummaryStartKey, breakdownSummaryEndKey, "idle").length'));
  assert.ok(main.includes('className="metric idle"><b>{site.idle}</b>'));
  assert.ok(main.includes('className="metric idle"><b>{total.idle.toLocaleString()}</b>'));
  const live = {total: 10, onRoad: 2, offRoad: 0, idle: 8};
  const result = throughputSectionExport({sites: [{site: 'Majri OC', idle: 6}], roadBySite: new Map([['Majri OC', live]]), availabilityTotals: live});
  assert.equal(result.rows[0].idle, 6);
  assert.equal(result.rows[1].idle, 6);
  const availability = throughputSectionExport({tab: 'road', availabilitySites: [{site: 'Majri OC', ...live}], availabilityTotals: live});
  assert.equal(availability.rows[0].idle, 8);
});
