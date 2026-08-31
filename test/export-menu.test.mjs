import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('all master and user report exports offer PDF, Excel, and print',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/sortable-table.css',import.meta.url),'utf8');

  assert.match(source,/function ExportMenu\(/);
  assert.match(source,/Download as PDF/);
  assert.match(source,/Download as Excel/);
  assert.match(source,/buildXlsxWorkbook/);
  assert.match(source,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(source,/exportFileName\(title, "xlsx"\)/);
  assert.match(source,/\[Content_Types\]\.xml/);
  assert.match(source,/xl\/worksheets\/sheet1\.xml/);
  assert.match(source,/<Printer \/> Print<\/button>/);
  assert.match(source,/popup\.print\(\)/);
  assert.match(source,/fetch\("\/api\/exports\/pdf"/);
  assert.match(source,/<ExportMenu title=\{name\} columns=\{exportColumns\} rows=\{records\}/);
  assert.match(source,/<ExportMenu title=\{title\} columns=\{columns\} rows=\{rows\}/);
  assert.match(source,/<ExportMenu title="Breakdown report" columns=\{filterColumns\} rows=\{sortedRows\}/);
  assert.match(source,/<ExportMenu title="Workflow report" columns=\{filterColumns\} rows=\{sortedRows\}/);
  assert.match(source,/<ExportMenu title="CRM tickets report" columns=\{ticketExportColumns\} rows=\{tickets\}/);
  assert.match(server,/app\.post\('\/api\/exports\/pdf',requireSession/);
  assert.match(server,/buildTableExportPdf\(\{title,columns,rows\}\)/);
  assert.match(styles,/\.table-search-toolbar>\.table-parameter-filter,\.report-table-filter-toolbar>\.table-parameter-filter\{margin-left:auto\}/);
  assert.match(styles,/\.toolbar>\.table-parameter-filter\{min-width:0;padding:0;border:0;border-radius:0;margin-left:auto\}/);
});
