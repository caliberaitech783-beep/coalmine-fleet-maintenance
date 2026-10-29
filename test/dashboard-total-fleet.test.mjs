import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentVehicleFleetRecords,totalFleetRecords,totalFleetCounts,totalFleetSelectionRows,totalFleetDetailRows,totalFleetOemChartRows} from '../src/total-fleet-model.mjs';
import {lmvDemoRecords,lmvFleetSnapshot} from '../lmv-fleet.mjs';
import {fleetSectionExport} from '../src/dashboard-section-export.mjs';
import {readFileSync} from 'node:fs';

test('explicit combined registry utility can still represent both registries independently of the main dashboard',()=>{
  const equipment=Array.from({length:1574},(_,index)=>({id:index,door:`E-${index}`,category:index%2?'Vehicle':'Equipment',currentLocation:'Sasti OC',dashboardRoadStatus:index<67?'offroad':'onroad'}));
  const rows=totalFleetRecords(equipment,lmvFleetSnapshot(lmvDemoRecords()),[],equipment.slice(0,8));
  const counts=totalFleetCounts(rows);
  assert.equal(counts.total,1614);assert.equal(counts.breakdown.total,83);
  assert.equal(counts.oem,16);assert.equal(counts.balance,83);
  assert.equal(counts.bdPercent,83/1614*100);
  for(const [mode,count] of [['total',1614],['breakdown',83],['oem',16],['balance',83]])assert.equal(totalFleetSelectionRows(rows,{mode}).length,count);
  assert.equal(new Set(rows.map(row=>row.fleetKey)).size,1614,'master IDs cannot collide across the two registries');
});

test('equipment/vehicle site totals, breakdown logbooks and OEM lists exclude the separate LMV registry',()=>{
  const equipment=Array.from({length:204},(_,index)=>({id:index,door:`ASSET-${index}`,category:index<51?'Equipment':'Vehicle',currentLocation:'Sasti OC',dashboardRoadStatus:index<25?'offroad':'onroad'}));
  const lmvs=lmvFleetSnapshot(lmvDemoRecords().slice(0,5));
  const unchanged=structuredClone(lmvs);
  const combined=totalFleetCounts(totalFleetRecords(equipment,lmvs,[],equipment.slice(0,3)));
  assert.equal(combined.total,209);
  assert.equal(combined.breakdown.total,27);
  const rows=equipmentVehicleFleetRecords(equipment,[],equipment.slice(0,3));
  const counts=totalFleetCounts(rows);
  assert.equal(counts.total,204);
  assert.equal(counts.equipment,51);
  assert.equal(counts.vehicles,153);
  assert.equal(counts.breakdown.total,25);
  assert.equal(counts.oem,3);
  assert.equal(counts.balance,25);
  assert.equal(counts.bdPercent,25/204*100);
  for(const [mode,count] of [['total',204],['breakdown',25],['oem',3],['balance',25]]){
    const selected=totalFleetSelectionRows(rows,{site:'Sasti OC',mode});
    assert.equal(selected.length,count);
    assert.ok(totalFleetDetailRows(selected,[]).every(row=>row.fleetSource==='Equipment master'&&!row.demo));
  }
  assert.ok(totalFleetOemChartRows(rows).every(row=>row.record.fleetSource==='Equipment master'));
  assert.deepEqual(lmvs,unchanged,'the dedicated LMV records are preserved');
  assert.equal(totalFleetCounts(totalFleetRecords([],lmvs)).breakdown.total,2);

  const table=fleetSectionExport({includeLmv:false,regions:[{...counts,code:'WCL',lmv:combined.lmv,sites:[{name:'Sasti OC',...counts,lmv:combined.lmv}]}],totals:counts});
  assert.ok(table.columns.every(column=>!/LMV|combined fleet/i.test(column.label)));
  const total=table.rows.at(-1);
  const value=label=>table.columns.find(column=>column.label===label).value(total);
  assert.equal(value('Total fleet'),204);
  assert.equal(value('BD balance'),25);
  assert.equal(value('BD (%)'),'12.3');
});

test('main dashboard wiring isolates LMV counts, loading state, summaries and exports',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const dashboard=source.slice(source.indexOf('function Dashboard('),source.indexOf('\nfunction ',source.indexOf('function Dashboard(')+1));
  assert.match(dashboard,/equipmentVehicleFleetRecords\(visibleEquipment,liveBreakdowns,combinedFleetOemRecords\)/);
  assert.match(dashboard,/const combinedFleetReady = equipmentLoaded;/);
  assert.doesNotMatch(dashboard,/disabled=\{!equipmentLoaded \|\| !lmvFleet.loaded\}/);
  assert.match(dashboard,/fleetSectionExport\(\{ includeLmv:false/);
  assert.match(dashboard,/columns=\{\[\["equipment","Equipment"\],\["vehicles","Vehicles"\]\]\}/);
  assert.doesNotMatch(dashboard,/including LMV|Equipment, vehicles and LMV|className="lmv-site-metric"/);
  for(const component of ['<LmvFleetControls','<LmvFleetView','<LmvFleetDialog'])assert.ok(dashboard.includes(component));
});

test('site and region counts use precisely the same scoped registry as their lists',()=>{
  const equipment=[{id:1,door:'V-1',category:'Vehicle',currentLocation:'Sasti OC',dashboardRoadStatus:'offroad'},{id:2,door:'E-1',category:'Equipment',currentLocation:'Jayant OC',dashboardRoadStatus:'onroad'}];
  const rows=totalFleetRecords(equipment,lmvFleetSnapshot(lmvDemoRecords()),[],[]);
  const sasti=totalFleetSelectionRows(rows,{site:'Sasti OB'});
  const counts=totalFleetCounts(sasti);
  assert.equal(counts.total,6);assert.equal(counts.breakdown.total,3);assert.equal(counts.balance,3);assert.equal(counts.bdPercent,50);
  assert.equal(totalFleetSelectionRows(rows,{site:'Sasti OC',mode:'balance'}).length,3);
  assert.equal(totalFleetSelectionRows(rows,{site:'Sasti OC',category:'otherVehicles',mode:'breakdown'}).length,2);
  const ncl=totalFleetSelectionRows(rows,{sites:['Jayant OC','Dudhichua OC','Dudhichua East OC']});
  assert.equal(totalFleetCounts(ncl).total,16);
  assert.equal(totalFleetCounts(ncl).breakdown.total,6);
  assert.equal(totalFleetCounts(ncl).balance,6);
  assert.equal(totalFleetCounts([]).bdPercent,0);
});

test('every site balance includes OEM breakdowns and opens the identical breakdown list',()=>{
  const sites=['Gauri Pauni OC (2nd)','Sasti OC','Jayant OC'];
  const equipment=sites.flatMap(site=>Array.from({length:10},(_,index)=>({id:`${site}-${index}`,door:`D-${index}`,category:'Vehicle',currentLocation:site,dashboardRoadStatus:index<7?'offroad':index===7?'idle':'onroad'})));
  const rows=equipmentVehicleFleetRecords(equipment,[],equipment.filter((_,index)=>index%10<2));
  for(const site of sites){
    const scoped=totalFleetSelectionRows(rows,{site});
    assert.equal(totalFleetCounts(scoped).oem,2);
    assert.equal(totalFleetCounts(scoped).balance,7);
    assert.deepEqual(totalFleetSelectionRows(rows,{site,mode:'balance'}),totalFleetSelectionRows(rows,{site,mode:'breakdown'}));
  }
  assert.equal(totalFleetCounts(rows).balance,21);
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

test('combined fleet exports do not add LMV twice and reconcile BD Balance with Breakdown',()=>{
  const records=totalFleetRecords([],lmvFleetSnapshot(lmvDemoRecords().slice(0,5)));
  const counts=totalFleetCounts(records);
  const table=fleetSectionExport({regions:[{...counts,code:'WCL',sites:[{name:'Sasti OC',...counts}]}],totals:counts});
  const cell=label=>table.columns.find(column=>column.label===label).value(table.rows.at(-1));
  assert.equal(cell('Total fleet'),5);assert.equal(cell('Combined fleet including LMV'),5);
  assert.equal(cell('BD balance'),2);assert.equal(cell('Breakdown (including OEM)'),2);assert.equal(cell('BD (%)'),'40.0');
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
  assert.match(modal,/<DashboardRecordBrowser key=\{JSON\.stringify\(totalFleetSelection\)\} rows=\{totalFleetDetailRows\(combinedListRows,liveBreakdowns\)\}/);
  assert.match(modal,/bdBalanceColumns=\{\["breakdown", "balance", "oem"\]\.includes\(totalFleetSelection.mode\)\}/);
  for(const feature of ['ActionsTable={ActionsTable}','Remarks={MaintenanceRemarks}','RequestTimelineButton={RequestTimelineButton}','formatDate={formatTwelveHourDateTime}']) assert.ok(modal.includes(feature),feature);
  assert.doesNotMatch(modal.split('</Modal>')[0],/<ReportSection/);
});
