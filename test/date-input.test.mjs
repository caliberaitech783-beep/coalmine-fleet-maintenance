import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DateInput, {formatDayFirstInputValue} from '../src/date-input.mjs';

test('date inputs display day-first regardless of browser locale', () => {
  assert.equal(formatDayFirstInputValue('2026-09-21'), '21-09-2026');
  assert.equal(formatDayFirstInputValue('2026-09-21T14:05', 'datetime-local'), '21-09-2026 14:05');
  assert.equal(formatDayFirstInputValue('2026-09-21T14:05', 'date'), '21-09-2026');
  assert.equal(formatDayFirstInputValue(''), '');
  assert.equal(formatDayFirstInputValue(undefined), '');
  const html = renderToStaticMarkup(React.createElement(DateInput, {value: '2026-09-21', onChange() {}}));
  assert.match(html, /^<input type="date" data-dmy="21-09-2026" value="2026-09-21"\/>$/);
  assert.match(renderToStaticMarkup(React.createElement(DateInput, {defaultValue: ''})), /data-dmy="dd-mm-yyyy" data-empty="true"/);
});

test('no screen renders a raw native date input', () => {
  for (const file of ['main.jsx', 'daily-bd-balance-chart.jsx', 'info-pulse-content.jsx', 'maintenance-etc-input.jsx', 'record-date-range.jsx', 'report-period-filter.jsx', 'vehicle-transfer-workflow.jsx', 'request-corrections.jsx']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /<input[^>]*type="(date|datetime-local)"/, file);
  }
});
