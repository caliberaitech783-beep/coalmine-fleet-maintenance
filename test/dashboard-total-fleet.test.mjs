import test from 'node:test';
import assert from 'node:assert/strict';
import {totalFleetRecords,totalFleetCounts,totalFleetSelectionRows,totalFleetDetailRows,totalFleetOemChartRows} from '../src/total-fleet-model.mjs';
import {lmvDemoRecords,lmvFleetSnapshot} from '../lmv-fleet.mjs';
import {fleetSectionExport} from '../src/dashboard-section-export.mjs';
import {readFileSync} from 'node:fs';

test('main fleet total, breakdown, OEM and non-OEM balances include all forty LMVs',()=>{
  const equipment=Array.from({length:1574},(_,index)=>({id:index,door:`E-${index}`,category:index%2?'Vehicle':'Equipment',currentLocation:'Sasti OC',dashboardRoadStatus:index<67?'offroad':'onroad'}));
  const rows=totalFleetRecords(equipment,lmvFleetSnapshot(lmvDemoRecords()),[],equipment.slice(0,8));
  const counts=totalFleetCounts(rows);
  assert.equal(counts.total,1614);assert.equal(counts.breakdown.total,83);
  assert.equal(counts.oem,16);assert.equal(counts.balance,67);
  assert.equal(counts.bdPercent,83/1614*100);
  for(const [mode,count] of [['total',1614],['breakdown',83],['oem',16],['balance',67]])assert.equal(totalFleetSelectionRows(rows,{mode}).length,count);
  assert.equal(new Set(rows.map(row=>row.fleetKey)).size,1614,'master IDs cannot collide across the two registries');
});

test('site and region counts use precisely the same scoped registry as their lists',()=>{
  const equipment=[{id:1,door:'V-1',category:'Vehicle',currentLocation:'Sasti OC',dashboardRoadStatus:'offroad'},{id:2,door:'E-1',category:'Equipment',currentLocation:'Jayant OC',dashboardRoadStatus:'onroad'}];
  const rows=totalFleetRecords(equipment,lmvFleetSnapshot(lmvDemoRecords()),[],[]);
  const sasti=totalFleetSelectionRows(rows,{site:'Sasti OB'});
  const counts=totalFleetCounts(sasti);
  assert.equal(counts.total,6);assert.equal(counts.breakdown.total,3);assert.equal(counts.balance,2);assert.equal(counts.bdPercent,50);
  assert.equal(totalFleetSelectionRows(rows,{site:'Sasti OC',mode:'balance'}).length,2);
  assert.equal(totalFleetSelectionRows(rows,{site:'Sasti OC',category:'otherVehicles',mode:'breakdown'}).length,2);
  const ncl=totalFleetSelectionRows(rows,{sites:['Jayant OC','Dudhichua OC','Dudhichua East OC']});
  assert.equal(totalFleetCounts(ncl).total,16);
  assert.equal(totalFleetCounts(ncl).breakdown.total,6);
  assert.equal(totalFleetCounts(ncl).balance,3);
  assert.equal(totalFleetCounts([]).bdPercent,0);
});

test('OEM chart entries and make/category selections remain physical asset counts without synthetic cases',()=>{
  const rows=totalFleetRecords([],lmvFleetSnapshot(lmvDemoRecords()));
  const chartRows=totalFleetOemChartRows(rows);
  assert.equal(chartRows.length,8);
  assert.ok(chartRows.every(row=>row.requests.length===0));
  const selected=totalFleetSelectionRows(rows,{mode:'oem',site:'Sasti OC',make:'tata',group:'lmv'});
  assert.equal(selected.length,1);assert.equal(selected[0].model,'Xenon');
  const details=totalFleetDetailRows(selected,[]);
  assert.equal(details[0].requestReference,'');assert.equal(details[0].requestStatus,'Demo · Breakdown');
  assert.equal(details[0].demo,true);
});

test('combined fleet exports do not add LMV twice and reconcile BD Balance separately from Breakdown',()=>{
  const records=totalFleetRecords([],lmvFleetSnapshot(lmvDemoRecords().slice(0,5)));
  const counts=totalFleetCounts(records);
  const table=fleetSectionExport({regions:[{...counts,code:'WCL',sites:[{name:'Sasti OC',...counts}]}],totals:counts});
  const cell=label=>table.columns.find(column=>column.label===label).value(table.rows.at(-1));
  assert.equal(cell('Total fleet'),5);assert.equal(cell('Combined fleet including LMV'),5);
  assert.equal(cell('BD balance'),1);assert.equal(cell('Breakdown (including OEM)'),2);assert.equal(cell('BD (%)'),'40.0');
});

test('LMV fleets without a mapped chart site still reconcile their combined export totals',()=>{
  const sample={...lmvFleetSnapshot(lmvDemoRecords().slice(0,1))[0],currentLocation:'Other yard'};
  const counts=totalFleetCounts(totalFleetRecords([],[sample]));
  const table=fleetSectionExport({regions:[],totals:counts});
  assert.equal(table.rows[0].name,'Location matches no chart site');
  const combined=table.columns.find(column=>column.label==='Combined fleet including LMV');
  assert.equal(combined.value(table.rows[0]),1);assert.equal(combined.value(table.rows.at(-1)),1);
});

test('LMV bars retain their teal fill and proportional breakdown height, with a compact aligned control row',()=>{
  const css=readFileSync(new URL('../src/lmv-fleet.css',import.meta.url),'utf8');
  assert.match(css,/\.mine-dashboard \.mine-fleet-bar\.otherVehicles\s*\{[^}]*linear-gradient\(180deg,#2dd4bf,#0f766e\)/);
  assert.match(css,/\.mine-dashboard \.mine-fleet-bar\.otherVehicles \.mine-fleet-breakdown-segment\s*\{\s*min-height:0/);
  assert.match(css,/\.mine-dashboard \.mine-fleet-region-chart \.lmv-fleet-controls \.mine-fleet-chart-toggle\s*\{[^}]*width:var\(--fleet-counter-width,auto\)/);
});
test('combined fleet count drilldowns retain the detailed breakdown report instead of the reduced LMV table',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const modal=source.slice(source.indexOf('{totalFleetSelection && <Modal'),source.indexOf('{totalFleetSelection && <Modal')+1600);
  assert.match(modal,/<DashboardRecordBrowser rows=\{totalFleetDetailRows\(combinedListRows,liveBreakdowns\)\}/);
  assert.match(modal,/bdBalanceColumns=\{\["breakdown", "balance", "oem"\]\.includes\(totalFleetSelection.mode\)\}/);
  for(const feature of ['ActionsTable={ActionsTable}','Remarks={MaintenanceRemarks}','RequestTimelineButton={RequestTimelineButton}','formatDate={formatTwelveHourDateTime}']) assert.ok(modal.includes(feature),feature);
  assert.doesNotMatch(modal.split('</Modal>')[0],/<ReportSection/);
});
