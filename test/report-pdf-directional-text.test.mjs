import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPdfText} from '../report-pdf-text.mjs';
import {buildTableExportPdf} from '../table-export-pdf.mjs';
import {buildTicketConsolidatedReportPdf} from '../consolidated-report-pdf.mjs';
import {buildXlsxWorkbookBuffer} from '../director-report-bundle.mjs';

const fragments=pdf=>[...pdf.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)]
  .map(match=>Buffer.from(match[1],'hex').toString('latin1')).join('');
const pdfContent=pdf=>pdf.toString('latin1').split(/\d+ 0 obj\r?\n/)
  .filter(object=>object.includes('stream\n')).join('\n');

test('PDF-only directional fallback preserves left, right and bidirectional meaning',()=>{
  assert.equal(reportPdfText('Production → Maintenance ← MIS ↔ Manager ⇒ Close ⇐ Return ⇔ Verify'),
    'Production -> Maintenance <- MIS <-> Manager => Close <= Return <=> Verify');
  assert.equal(reportPdfText('वाहन → रखरखाव ← एमआईएस ↔ प्रबंधक'),'वाहन -> रखरखाव <- एमआईएस <-> प्रबंधक');
});

test('table arrows are normalized before layout and rendering, without changing source or Excel text',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-09-08T12:00:00Z')});
  const title='Workflow → verification';
  const columns=Object.freeze([Object.freeze({label:'Route ↔ direction'})]);
  const rows=Object.freeze([Object.freeze(['Production → Maintenance ← MIS ↔ Manager'])]);
  const pdf=await buildTableExportPdf({title,columns,rows});
  assert.match(fragments(pdf),/Production -> Maintenance <- MIS <-> Manager/);
  assert.match(fragments(pdf),/Workflow -> verification/);
  assert.match(fragments(pdf),/Route <-> direction/);
  assert.equal(rows[0][0],'Production → Maintenance ← MIS ↔ Manager');
  const workbook=buildXlsxWorkbookBuffer(title,columns,rows);
  assert.ok(workbook.includes(Buffer.from(rows[0][0])),'Excel retains the original Unicode arrows');
  const normalized=await buildTableExportPdf({title:reportPdfText(title),columns:columns.map(column=>({label:reportPdfText(column.label)})),rows:rows.map(row=>row.map(reportPdfText))});
  assert.equal(pdfContent(pdf),pdfContent(normalized),'layout and rendered contents agree with the measured fallback text');
});

test('mixed Hindi arrows use readable embedded glyphs and agree with normalized PDF layout',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-09-08T12:00:00Z')});
  const options={title:'हिंदी → रिपोर्ट',columns:[{label:'कारण ↔ Remark'}],rows:[['वाहन → रखरखाव ← MIS ↔ Manager']]};
  const pdf=await buildTableExportPdf(options);
  const normalized=await buildTableExportPdf({title:reportPdfText(options.title),columns:options.columns.map(c=>({label:reportPdfText(c.label)})),rows:options.rows.map(row=>row.map(reportPdfText))});
  assert.equal(pdfContent(pdf),pdfContent(normalized));
  const raw=pdf.toString('latin1');
  for(const code of ['0935','003c','002d','003e'])assert.ok(raw.includes(`<${code}>`),`missing glyph mapping ${code}`);
});

test('consolidated ticket PDFs use the same directional fallback',async()=>{
  const options={scopeLabel:'Production → Maintenance',start:new Date('2026-09-08T00:00:00Z'),end:new Date('2026-09-08T01:00:00Z'),openTickets:[{site:'Sasti OB',reference:'Ticket ↔ Audit',remarks:'Production → Maintenance ← MIS ↔ Manager',user:'Audit',elapsed:'1h'}],closedTickets:[]};
  const pdf=await buildTicketConsolidatedReportPdf(options);
  assert.match(fragments(pdf),/Production -> Maintenance <- MIS <-> Manager/);
  assert.match(fragments(pdf),/Ticket <-> Audit/);
  assert.equal(options.openTickets[0].remarks,'Production → Maintenance ← MIS ↔ Manager');
});
