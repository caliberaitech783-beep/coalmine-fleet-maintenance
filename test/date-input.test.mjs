import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DateInput, {dateInputOverlaySupported, formatDayFirstInputValue} from '../src/date-input.mjs';

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

test('the custom date overlay stays off on mobile and touch devices', () => {
  assert.equal(dateInputOverlaySupported({userAgentData:{mobile:false},maxTouchPoints:0,userAgent:'Chrome'}), true);
  assert.equal(dateInputOverlaySupported({userAgentData:{mobile:true},maxTouchPoints:5,userAgent:'Chrome Mobile'}), false);
  assert.equal(dateInputOverlaySupported({userAgentData:{mobile:false},maxTouchPoints:5,userAgent:'Chrome'}), false);
  assert.equal(dateInputOverlaySupported({userAgentData:{mobile:false},maxTouchPoints:0,userAgent:'Android Chrome'}), false);
  assert.equal(dateInputOverlaySupported({userAgent:'Safari Mobile'}), false);

  const css = readFileSync(new URL('../src/date-input.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /input\.dmy-date-input::before \{ content: none; \}/);
});

test('phone modals and ETC controls cannot exceed their grid columns', () => {
  const appCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const etcCss = readFileSync(new URL('../src/maintenance-etc-input.css', import.meta.url), 'utf8');
  assert.match(appCss, /@media\(max-width:520px\)\{\.modal\{resize:none;min-width:0;width:100%;max-width:100%\}\}/);
  assert.match(etcCss, /\.maintenance-etc-controls input,\.maintenance-etc-controls select\{width:100%;min-width:0;max-width:100%\}/);
  assert.match(etcCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('no screen renders a raw native date input', () => {
  for (const file of ['main.jsx', 'daily-bd-balance-chart.jsx', 'info-pulse-content.jsx', 'maintenance-etc-input.jsx', 'record-date-range.jsx', 'report-period-filter.jsx', 'vehicle-transfer-workflow.jsx', 'request-corrections.jsx']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /<input[^>]*type="(date|datetime-local)"/, file);
  }
});
