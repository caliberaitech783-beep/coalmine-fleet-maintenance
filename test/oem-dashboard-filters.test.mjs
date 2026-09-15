import test from 'node:test';
import assert from 'node:assert/strict';
import { oemFiltersForSelection, oemRowsForLocation, groupOemRecordsBySite } from '../src/oem-dashboard-filters.mjs';
import { buildOemBreakdownRows, buildOemBreakdownChart, createOemBreakdownSelection } from '../src/oem-breakdown-model.mjs';

const regions = [{ code: 'WCL', sites: ['Sasti OB', 'Majri OB'] }, { code: 'NCL', sites: ['Jayant OB'] }];
const equipment = [
  {id: 1, door:'V1', make:'Volvo', currentLocation:'Sasti OB'},
  {id: 2, door:'V2', make:'Komatsu', currentLocation:'Sasti OB'},
  {id: 3, door:'V3', make:'Volvo', currentLocation:'Jayant OB'},
];
const requests = equipment.map(row => ({ref:row.door,door:row.door,site:row.currentLocation,status:'Open',start:'2026-09-10 08:00'}));
const rows = buildOemBreakdownRows({equipment,requests});
const all = {region:'all',site:'all',oem:'all'};
function view(filters, data=rows) {
  const chart = buildOemBreakdownChart({rows:oemRowsForLocation(data,filters.region,filters.site,regions),equipment,regions:regions.filter(region => filters.region==='all'||region.code===filters.region).map(region=>({...region,sites:region.sites.filter(site=>filters.site==='all'||site===filters.site)})),oem:filters.oem});
  return {chart,list:createOemBreakdownSelection(chart)};
}
test('default view contains both regions and keeps zero-breakdown sites visible',()=>{
  const {chart,list} = view(all);
  assert.deepEqual(chart.sites.map(site=>site.name),['Sasti OB','Majri OB','Jayant OB']);
  assert.equal(chart.sites[1].total,0);
  assert.equal(list.rows.length,3);
});
test('segment clicks preselect the matching header filters; editing OEM or region replaces that selection',()=>{
  let filters = oemFiltersForSelection(all,{site:'Sasti OB',oem:'volvo'},regions);
  assert.deepEqual(filters,{region:'WCL',site:'Sasti OB',oem:'volvo'});
  assert.deepEqual(view(filters).list.records.map(row=>row.requestReference),['V1']);
  filters={...filters,oem:'komatsu'};
  assert.deepEqual(view(filters).list.records.map(row=>row.requestReference),['V2']);
  filters={...filters,region:'NCL',site:'all'};
  assert.equal(view(filters).list.records.length,0);
  filters={...filters,oem:'all'};
  assert.deepEqual(view(filters).list.records.map(row=>row.requestReference),['V3']);
});
test('site filter works with All regions, site totals preserve OEM, and All list preserves every header filter',()=>{
  const filters={...all,site:'Sasti OB',oem:'volvo'};
  assert.equal(view(filters).list.rows.length,1);
  assert.deepEqual(oemFiltersForSelection(filters,{},regions),filters);
  const clicked=oemFiltersForSelection(filters,{site:'Jayant OB'},regions);
  assert.deepEqual(clicked,{region:'NCL',site:'Jayant OB',oem:'volvo'});
  assert.deepEqual(view(clicked).list.records.map(row=>row.requestReference),['V3']);
});
test('date changes and refreshed data recalculate an open selection without stale record snapshots',()=>{
  const filters={...all,oem:'volvo'};
  assert.equal(view(filters).list.rows.length,2);
  const updated=buildOemBreakdownRows({equipment,requests:requests.map(row=>row.door==='V1'?{...row,status:'Closed',closedAt:'2026-09-12 12:00'}:row)});
  assert.deepEqual(view(filters,updated).list.records.map(row=>row.requestReference),['V3']);
  const historical=buildOemBreakdownRows({equipment,requests:[{...requests[0],status:'Closed',closedAt:'2026-09-12 12:00'}],from:'2026-09-11',to:'2026-09-11'});
  assert.deepEqual(view(filters,historical).list.records.map(row=>row.requestReference),['V1']);
});
test('all segment, site and OEM asset totals reconcile; multiple request records retain one asset identity',()=>{
  const data=buildOemBreakdownRows({equipment,requests:[...requests,{...requests[0],ref:'second-request'}]});
  const {chart,list}=view(all,data);
  assert.equal(list.rows.length,3);
  assert.equal(list.records.length,4);
  assert.equal(new Set(list.records.map(record=>record.assetId)).size,3);
  for(const site of chart.sites){
    const selection=oemFiltersForSelection(all,{site:site.name},regions);
    assert.equal(view(selection,data).list.rows.length,site.total);
    for(const segment of site.segments) assert.equal(view(oemFiltersForSelection(all,{site:site.name,oem:segment.key},regions),data).list.rows.length,segment.rows.length);
  }
});

test('full list is partitioned into ordered site tables without losing records or combining sites',()=>{
  const {list}=view(all);
  const groups=groupOemRecordsBySite([...list.records,{id:'alias',requestSite:'SASTI II'},{id:'other',requestSite:'New permitted site'}],regions);
  assert.deepEqual(groups.map(group=>[group.region,group.site,group.records.length]),[['WCL','Sasti OB',3],['NCL','Jayant OB',1],['Other sites','New permitted site',1]]);
  assert.equal(groups.flatMap(group=>group.records).length,5);
  assert.equal(new Set(groups.flatMap(group=>group.records.map(record=>record.id))).size,5);
  assert.deepEqual(groupOemRecordsBySite([],regions),[]);
});
