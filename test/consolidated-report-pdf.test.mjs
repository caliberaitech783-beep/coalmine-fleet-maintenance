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

test('consolidated CRM preserves long Hindi remarks across pages without covering the next ticket or footer',async()=>{
  const pdf=await buildTicketConsolidatedReportPdf({scopeLabel:'Sasti OB',start,end,openTickets:[
    {site:'Sasti OB',reference:'TIC-LONG',elapsed:'4h 0m',user:'Operator',remarks:`वाहन नहीं पहुंचा - ${'Checking all remarks during report pagination. '.repeat(450)}FINAL_TICKET_SENTINEL`},
    {site:'Sasti OB',reference:'TIC-NEXT',elapsed:'1h 0m',user:'Operator',remarks:'FOLLOWING_TICKET_SENTINEL'},
  ],closedTickets:[]});
  const text=pdf.toString('latin1');
  assert.ok(Number(text.match(/\/Count (\d+)\b/)?.[1])>1);
  assert.match(text,/\/BaseFont \/[^\s]*NotoSansDevanagari-Regular/);
  assert.match(text,/\/ToUnicode/);
  for(const code of ['0935','093e','0939','0928'])assert.ok(text.includes(`<${code}>`),`missing Unicode map for ${code}`);
  const fragments=[...text.matchAll(/<([0-9a-f]+)>/gi)].map(match=>Buffer.from(match[1],'hex').toString('latin1')).join('');
  assert.match(fragments,/FINAL_TICKET_SENTINEL/);
  assert.match(fragments,/FOLLOWING_TICKET_SENTINEL/);
  const rectangles=[...text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) re\b/g)].map(match=>match.slice(1).map(Number));
  assert.ok(rectangles.length>1);
  for(const [x,y,width,height] of rectangles){
    assert.ok(x>=35.99&&x+width<=559.29,`record outside A4 content: ${x},${width}`);
    assert.ok(y>=36&&y+height<=783.90,`record overlaps footer: ${y},${height}`);
  }
});
