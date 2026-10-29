import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {throughputSectionExport} from '../src/dashboard-section-export.mjs';
import {liveEquipmentMetrics,liveEquipmentRoadStatus} from '../dashboard-equipment-metrics.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {breakdownMovementForRange} from '../dashboard-breakdown-movement.mjs';
import {availabilityRequestsForDate} from '../src/dashboard-availability.mjs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';

const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const calculation=main.slice(main.indexOf('  const availabilityCountBySite ='),main.indexOf('  // Match the linked request list'));
const assets=[{door:'S1',currentLocation:'Sasti OC'},{door:'S2',currentLocation:'Sasti OC'},{door:'S3',currentLocation:'Sasti OC'},{door:'J1',currentLocation:'Jayant OC'}];
const requests=[
 {door:'S1',site:'Sasti OC',status:'Open',start:'2026-10-27T09:00:00+05:30'},
 {door:'S1',site:'Sasti OC',status:'Open',start:'2026-10-28T09:00:00+05:30'},
 {door:'S2',site:'Sasti OC',status:'Closed',vehicleIdle:true,start:'2026-10-27T09:00:00+05:30',closedAt:'2026-10-28T09:00:00+05:30',idealRequestedAt:'2026-10-28T09:00:00+05:30'},
 {door:'J1',site:'Jayant OC',status:'Open',start:'2026-10-27T09:00:00+05:30'},
];
test('site BD balance and idle match unique-fleet availability, including carryover idle and duplicate requests',()=>{
 for(const date of ['', '2026-10-27','2026-10-28','2026-10-29']){
  const availableRequests=availabilityRequestsForDate(requests,date);
  const equipment=date?dashboardFleetSnapshot(assets,availableRequests):assets;
  const bindings={throughputSites:['Sasti OC','Jayant OC'],availabilityEquipment:equipment,availabilityRequests:availableRequests,throughputRequests:requests,recordBelongsToSite,liveEquipmentMetrics,breakdownMovementForRange,dashboardShift:'all',breakdownSummaryStartKey:date||'2026-10-29',breakdownSummaryEndKey:date||'2026-10-29'};
  const result=new Function(...Object.keys(bindings),calculation+'return {breakdownSiteSummary,roadAvailabilityBySiteName};')(...Object.values(bindings));
  const totals=liveEquipmentMetrics(equipment,availableRequests);
  const report=throughputSectionExport({sites:result.breakdownSiteSummary,roadBySite:result.roadAvailabilityBySiteName,availabilityTotals:totals,openBalance:totals.offRoad,idleRequests:totals.idle});
  for(const site of result.breakdownSiteSummary){
   const road=result.roadAvailabilityBySiteName.get(site.site);
   assert.equal(site.balance,road.offRoad);assert.equal(site.idle,road.idle);
   const list=equipment.filter(row=>recordBelongsToSite(row,site.site));
   assert.equal(site.balance,list.filter(row=>liveEquipmentRoadStatus(row,availableRequests)==='offroad').length);
   assert.equal(site.idle,list.filter(row=>liveEquipmentRoadStatus(row,availableRequests)==='idle').length);
   const exported=report.rows.find(row=>row.name===site.site);
   assert.equal(exported.balance,road.offRoad);assert.equal(exported.idle,road.idle);
  }
  assert.equal(report.rows.find(row=>row.name==='All sites total').balance,totals.offRoad);
  if(!date){assert.equal(result.breakdownSiteSummary[0].balance,1);assert.equal(result.breakdownSiteSummary[0].idle,1);}
 }
 assert.equal(requests.length,4,'stored requests are preserved');
});
test('summary and site detail cards use availability counts and matching fleet drilldown keys',()=>{
 assert.match(main,/label: "BD Balance", value: availabilityKpis.offRoad, className: "active-balance", snapshotKey: "offroad"/);
 assert.match(main,/label: "Idle Vehicles", value: availabilityKpis.idle, className: "idle", snapshotKey: "idle"/);
 assert.match(main,/label: "BD Balance", value: selectedBreakdownSiteRoad.offRoad/);
 assert.match(main,/label: "Idle Vehicles", value: selectedBreakdownSiteRoad.idle/);
 assert.match(main,/item.snapshotKey \|\| movementKey\(item.className\)/);
 assert.match(main,/`site-status:\$\{breakdownDetailSite\}\|\$\{item.snapshotKey\}`/);
});
