import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTicketWhatsAppReport,buildTicketReportTable,prepareTicketReportRows,ticketReportDue,ticketReportWindow} from '../ticket-consolidated-report.mjs';
import {buildXlsxWorkbookBuffer} from '../director-report-bundle.mjs';

test('CRM report windows follow 8, 15 and 20 India time',()=>{
  const eight=ticketReportWindow(new Date('2026-08-27T02:31:00Z'));
  assert.equal(eight.slotKey,'CRM-2026-08-27-08');
  assert.equal(eight.start.toISOString(),'2026-08-26T14:30:00.000Z');
  assert.equal(eight.end.toISOString(),'2026-08-27T02:30:00.000Z');
  const fifteen=ticketReportWindow(new Date('2026-08-27T09:31:00Z'));
  assert.equal(fifteen.slotKey,'CRM-2026-08-27-15');
  assert.equal(fifteen.start.toISOString(),'2026-08-27T02:30:00.000Z');
  assert.equal(ticketReportDue(new Date('2026-08-27T14:35:00Z')),true);
  assert.equal(ticketReportDue(new Date('2026-08-27T15:30:00Z')),false);
});

test('CRM report splits open and closed tickets and sorts longest elapsed first',()=>{
  const end=new Date('2026-08-27T09:30:00Z');
  const rows=prepareTicketReportRows([
    {reference:'TIC/NEW',site:'Sasti OB',user:'User Two',remarks:'New issue',status:'Open',openedAt:'2026-08-27T08:30:00Z'},
    {reference:'TIC/OLD',site:'Sasti OB',user:'User One',remarks:'Old issue',status:'Open',openedAt:'2026-08-27T03:30:00Z'},
    {reference:'TIC/DONE',site:'Majri OB',user:'User Three',remarks:'Resolved issue',status:'Resolved',openedAt:'2026-08-27T04:30:00Z',resolvedAt:'2026-08-27T06:00:00Z'},
  ],end);
  assert.deepEqual(rows.map(({reference})=>reference),['TIC/OLD','TIC/DONE','TIC/NEW']);
  const data={scopeLabel:'WCL',start:new Date('2026-08-27T02:30:00Z'),end,openTickets:rows.filter(({status})=>status!=='Resolved'),closedTickets:rows.filter(({status})=>status==='Resolved')};
  const message=buildTicketWhatsAppReport({...data,pdfUrl:'https://example.com/r/pdf',xlsxUrl:'https://example.com/r/excel'});
  assert.match(message,/PDF: https:\/\/example.com\/r\/pdf/);
  assert.match(message,/Excel: https:\/\/example.com\/r\/excel/);
  assert.match(message,/OPEN TICKETS: 2/);assert.match(message,/CLOSED TICKETS: 1/);
  assert.doesNotMatch(message,/TIC\/OLD|User One|Old issue/);
  const table=buildTicketReportTable(data);
  assert.equal(table.rows.length,3);
  assert.deepEqual(table.rows.map(row=>row[0]),['TIC/OLD','TIC/NEW','TIC/DONE']);
  assert.equal(table.rows[0][4],'Old issue');assert.equal(table.rows[2][7],'1h 30m');
  const xlsx=buildXlsxWorkbookBuffer(table.title,table.columns,table.rows);
  assert.equal(xlsx.subarray(0,2).toString(),'PK');
  for(const value of ['TIC/OLD','TIC/NEW','TIC/DONE','Old issue','Window start (IST)'])assert.ok(xlsx.includes(Buffer.from(value)));
  assert.throws(()=>buildTicketWhatsAppReport(data),/require PDF and Excel/);
});
