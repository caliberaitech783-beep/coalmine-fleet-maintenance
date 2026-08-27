import assert from 'node:assert/strict';
import test from 'node:test';
import {attachRequestOems,buildConsolidatedWhatsAppReport,consolidatedReportDue,consolidatedReportWindow,prepareConsolidatedRows} from '../consolidated-whatsapp-report.mjs';
import {managerRegionSelection,managerReportScope,reportScopeIncludesSite} from '../region-scope.mjs';

test('scheduled report windows follow 6, 10, 14, 18 and 22 India time',()=>{
  const six=consolidatedReportWindow(new Date('2026-08-27T00:31:00Z'));
  assert.equal(six.slotKey,'2026-08-27-06');
  assert.equal(six.start.toISOString(),'2026-08-26T16:30:00.000Z');
  assert.equal(six.end.toISOString(),'2026-08-27T00:30:00.000Z');
  const fourteen=consolidatedReportWindow(new Date('2026-08-27T08:31:00Z'));
  assert.equal(fourteen.slotKey,'2026-08-27-14');
  assert.equal(fourteen.start.toISOString(),'2026-08-27T04:30:00.000Z');
  assert.equal(consolidatedReportDue(new Date('2026-08-27T00:35:00Z')),true);
  assert.equal(consolidatedReportDue(new Date('2026-08-27T01:30:00Z')),false);
});

test('manager report scope supports site, multiple regions and all regions',()=>{
  assert.deepEqual(managerRegionSelection('WCL | NCL'),['WCL','NCL']);
  assert.deepEqual(managerReportScope({site:'Sasti OB'}).sites,['sasti ob']);
  assert.equal(reportScopeIncludesSite(managerReportScope({managerRegion:'WCL'}),'Majri OB'),true);
  assert.equal(reportScopeIncludesSite(managerReportScope({managerRegion:'WCL'}),'Jayant OB'),false);
  assert.equal(managerReportScope({managerRegion:'All'}).sites,null);
});

test('consolidated report uses Equipment Master OEM and sorts elapsed time high to low',()=>{
  const reportTime=new Date('2026-08-27T00:30:00Z');
  const requests=attachRequestOems([
    {reference:'REQ-NEW',door:'D2',site:'Sasti OB',user:'User Two',status:'Open',startedAt:'2026-08-26T23:30:00Z'},
    {reference:'REQ-OLD',door:'D1',site:'Sasti OB',user:'User One',status:'Open',startedAt:'2026-08-26T17:30:00Z'},
  ],[
    {door:'D1',oem:'Komatsu'},
    {door:'D2',make:'Tata'},
  ]);
  const rows=prepareConsolidatedRows(requests,reportTime);
  assert.deepEqual(rows.map(({reference})=>reference),['REQ-OLD','REQ-NEW']);
  assert.equal(rows[0].oem,'Komatsu');
  const message=buildConsolidatedWhatsAppReport({scopeLabel:'WCL',start:new Date('2026-08-26T16:30:00Z'),end:reportTime,openRequests:rows,closedRequests:[]});
  assert.match(message,/\*NERVE CENTER CONSOLIDATED REPORT\*/);
  assert.match(message,/🔴 \*OFF ROAD \/ OPEN \(2\)\*/);
  assert.match(message,/🟢 \*ON ROAD \/ CLOSED \(0\)\*/);
  assert.ok(message.indexOf('REQ-OLD')<message.indexOf('REQ-NEW'));
  assert.match(message,/OEM: Komatsu/);
});
