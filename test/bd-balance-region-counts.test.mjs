import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drilldownView,changeDrilldownFilter} from '../src/dashboard-drilldown-model.mjs';
import {REGION_DATA} from '../region-scope.mjs';

const rows=[
  {id:'s1',currentLocation:'Sasti OC'},
  {id:'s2',currentLocation:'Sasti OC'},
  {id:'m1',currentLocation:'Majri OC'},
  {id:'j1',currentLocation:'Jayant OC'},
];
test('site-selected BD Balance retains overall and regional totals',()=>{
  const view=drilldownView(rows,REGION_DATA,{region:'WCL',site:'Sasti OC'},{rowsAreScoped:true});
  assert.deepEqual(view.rows.map(row=>row.id),['s1','s2']);
  assert.deepEqual(view.regions.map(region=>[region.code,region.rows.length]),[['all',4],['WCL',3],['NCL',1]]);
  assert.equal(view.options.site.reduce((total,site)=>total+site.count,0),3);
  const allSites=drilldownView(rows,REGION_DATA,changeDrilldownFilter(view.selection,'site',''),{rowsAreScoped:true});
  assert.equal(allSites.rows.length,3);
  const allRegions=drilldownView(rows,REGION_DATA,changeDrilldownFilter(view.selection,'region','all'),{rowsAreScoped:true});
  assert.equal(allRegions.rows.length,4);
  assert.equal(allRegions.options.site.reduce((total,site)=>total+site.count,0),4);
  assert.deepEqual(drilldownView(rows,REGION_DATA,{region:'NCL'},{rowsAreScoped:true}).rows.map(row=>row.id),['j1']);
});
test('totals do not add inaccessible sites to an authorised snapshot',()=>{
  const view=drilldownView(rows.slice(0,2),REGION_DATA,{region:'WCL'},{rowsAreScoped:true});
  assert.deepEqual(view.regions.map(region=>region.rows.length),[2,2,0]);
});
test('BD Balance location entry points receive scoped assets and request details',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/const hierarchyBalance = key.startsWith\("offroad-site:"\) \|\| key.startsWith\("fleet-breakdown:region:"\)/);
  assert.match(source,/const accountWide = .*\|\| hierarchyBalance;/);
  assert.match(source,/accountWide \? scopedEquipment : visibleEquipment/);
  assert.match(source,/const fleetDrilldownRequests = .*key.startsWith\("offroad-site:"\).*\? scopedBreakdowns/);
  assert.match(source,/initialRegion=\{initialDrilldownRegion\} initialSite=\{initialDrilldownSite\}/);
});
test('actual BD Balance selector keeps other authorised sites but excludes on-road assets',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const start=source.indexOf('    if (key.startsWith("fleet-breakdown:") || key.startsWith("offroad-site:")) {');
  const end=source.indexOf('    if (key === "road-availability")',start);
  const select=new Function('key','scopedEquipment','visibleEquipment','scopedBreakdowns','liveBreakdowns','availableRegions','oemChart','liveEquipmentRoadStatus','recordBelongsToSite',source.slice(start,end));
  const assets=[...rows.map(row=>({...row,status:'offroad'})),{id:'road',currentLocation:'Sasti OC',status:'onroad'}];
  const scopedRequests=[{ref:'scope'}];
  for(const key of ['offroad-site:Sasti OC','fleet-breakdown:region:WCL']) {
    const selected=select(key,assets,assets.slice(0,2),scopedRequests,[],REGION_DATA,{rows:[]},(row,requests)=>{assert.equal(requests,scopedRequests);return row.status;},(row,site)=>row.currentLocation===site);
    assert.deepEqual(selected.map(row=>row.id),['s1','s2','m1','j1']);
  }
});
