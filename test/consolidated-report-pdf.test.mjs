import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFleetConsolidatedReportPdf,buildTicketConsolidatedReportPdf} from '../consolidated-report-pdf.mjs';

const start=new Date('2026-08-29T00:30:00.000Z');
const end=new Date('2026-08-29T04:30:00.000Z');

test('fleet consolidated report is generated as a complete PDF document',async()=>{
  const pdf=await buildFleetConsolidatedReportPdf({scopeLabel:'WCL',start,end,openRequests:[{site:'Sasti OB',door:'HP12',reference:'REQ-1',elapsed:'4h 0m',user:'Operator',oem:'Tata',status:'Open'}],closedRequests:[]});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>1500);
  assert.match(pdf.toString('latin1'),/Nerve Center Fleet Report/);
});

test('CRM consolidated report is generated as a complete PDF document',async()=>{
  const pdf=await buildTicketConsolidatedReportPdf({scopeLabel:'Sasti OB',start,end,openTickets:[],closedTickets:[{site:'Sasti OB',reference:'TIC-1',elapsed:'1h 5m',user:'User',remarks:'Resolved'}]});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>1500);
  assert.match(pdf.toString('latin1'),/Nerve Center CRM Ticket Report/);
});
