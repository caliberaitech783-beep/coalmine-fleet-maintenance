import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTicketWhatsAppReport,prepareTicketReportRows,ticketReportDue,ticketReportWindow} from '../ticket-consolidated-report.mjs';

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
  const message=buildTicketWhatsAppReport({scopeLabel:'WCL',start:new Date('2026-08-27T02:30:00Z'),end,
    openTickets:rows.filter(({status})=>status!=='Resolved'),closedTickets:rows.filter(({status})=>status==='Resolved')});
  assert.match(message,/\*NERVE CENTER CRM TICKET REPORT\*/);
  assert.match(message,/📍 \*SASTI OB\*/);
  assert.match(message,/🔴 \*OPEN TICKETS \(2\)\*/);
  assert.match(message,/🟢 \*CLOSED TICKETS \(1\)\*/);
  assert.match(message,/Time lapsed: 6h 0m[\s\S]*User: User One[\s\S]*Remarks: Old issue/);
  assert.match(message,/Time taken: 1h 30m[\s\S]*User: User Three[\s\S]*Remarks: Resolved issue/);
  assert.ok(message.indexOf('TIC/OLD')<message.indexOf('TIC/NEW'));
});
