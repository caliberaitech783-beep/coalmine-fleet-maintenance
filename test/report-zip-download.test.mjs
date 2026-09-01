import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('reports UI supports selectable PDF and Excel downloads in one ZIP archive',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const polish=readFileSync(new URL('../src/report-schedule-polish.css',import.meta.url),'utf8');
  assert.match(source,/Download reports ZIP/);
  assert.match(source,/Download reports as ZIP/);
  assert.match(source,/type="checkbox" checked=\{selectedZipReports\.includes\(report\.title\)\}/);
  assert.match(source,/setSelectedZipReports\(accessibleReportGroups\.map/);
  assert.match(source,/zipStoredFiles\(generatedFiles\.flat\(\), "application\/zip"\)/);
  assert.match(source,/content: new Uint8Array\(await \(await pdfResponse\.blob\(\)\)\.arrayBuffer\(\)\)/);
  assert.match(source,/PDF \+ Excel/);
  assert.match(css,/\.report-zip-modal/);
  assert.match(css,/\.report-zip-groups input/);
  assert.match(source,/report-zip-title/);
  assert.match(source,/report-zip-selection/);
  assert.match(source,/className=\{selectedZipReports\.includes\(report\.title\) \? "selected" : ""\}/);
  assert.match(polish,/\.report-zip-modal > header/);
  assert.match(polish,/\.report-zip-groups label\.selected/);
  assert.match(source,/type="datetime-local"/);
  assert.match(source,/reportRowsWithinRange\(report\.rows, report\.dateValue, reportZipFrom, reportZipTo\)/);
  assert.match(polish,/\.report-zip-range/);
});

test('reports and schedule configuration are exposed to every signed-in profile with server-side scope',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/section === "reports"/);
  assert.match(source,/<FileBarChart \/> Reports/);
  assert.match(source,/accessibleReportGroups/);
  assert.match(server,/app\.get\('\/api\/report-schedule-settings',requireSession/);
  assert.match(server,/app\.put\('\/api\/report-schedule-settings',requireSession/);
  assert.match(server,/canManageAllReportSchedules/);
  assert.match(server,/allowedDesignationKeys/);
  assert.match(server,/allowedReports/);
});
