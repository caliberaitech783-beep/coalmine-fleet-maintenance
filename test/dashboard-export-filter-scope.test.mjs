import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {throughputSectionExport} from '../src/dashboard-section-export.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const declaration=(name,next)=>source.slice(source.indexOf(`  const ${name} =`),source.indexOf(`  const ${next} =`,source.indexOf(`  const ${name} =`)));
const availableRegions=[{code:'WCL',sites:['Sasti OC','Majri OC']},{code:'NCL',sites:['Jayant OC']}];
const recordBelongsToSite=(record,site)=>record.site===site;
function scope({site='all',region=null,allowed=null}={}) {
  const values={useMemo:fn=>fn(),dashboardSite:site,selectedRegion:region,normalizedAllowedSites:allowed,availableRegions,recordBelongsToSite,
    activeSites:site==='all'?(region?.sites||availableRegions.flatMap(r=>r.sites)):[site]};
  return new Function(...Object.keys(values),declaration('trendAvailableSites','activeTrendSite')+declaration('requestLifecycleRegions','requestLifecycleRegion')+'return {sites:trendAvailableSites,lifecycle:requestLifecycleRegions.flatMap(r=>r.sites)};')(...Object.values(values));
}
test('site-only dashboard filters constrain every exported site summary without needing a region',()=>{
  const selected=scope({site:'Sasti OC'});
  assert.deepEqual(selected.sites,['Sasti OC']);
  assert.deepEqual(selected.lifecycle,['Sasti OC']);
  const report=throughputSectionExport({sites:selected.sites.map(site=>({site,open:1,incoming:2,outgoing:0,balance:3}))});
  const text=JSON.stringify(report.rows);
  assert.match(text,/Sasti OC/);
  assert.doesNotMatch(text,/Majri|Jayant/);
});
test('region, site and authorized scope intersect, including zero matches and reset',()=>{
  assert.deepEqual(scope({region:availableRegions[0],site:'Sasti OC',allowed:['Sasti OC']}).sites,['Sasti OC']);
  assert.deepEqual(scope({site:'Sasti OC',allowed:['Majri OC']}).sites,[]);
  assert.deepEqual(scope({site:'Sasti OC',allowed:['Majri OC']}).lifecycle,[]);
  assert.deepEqual(scope({region:availableRegions[0]}).sites,['Sasti OC','Majri OC']);
  assert.deepEqual(scope().sites,['Sasti OC','Majri OC','Jayant OC']);
});
test('fleet breakdown counts use the opening shift after applying the selected site',()=>{
  let splitRows=[];
  const values={useMemo:fn=>fn(),dashboardShift:'A',shiftRecords:[],selectedRegion:null,dashboardSite:'Sasti OC',activeSites:['Sasti OC'],recordBelongsToSite,
    requestMatchesMovementShift:r=>r.shift==='A',scopedBreakdowns:[{site:'Sasti OC',shift:'A',id:1},{site:'Sasti OC',shift:'B',id:2},{site:'Majri OC',shift:'A',id:3}],dashboardFrom:'',dashboardTo:'',
    splitDashboardRequests:rows=>(splitRows=rows,{liveRequests:rows,historicalRequests:rows})};
  const code=source.slice(source.indexOf('  const locationBreakdowns ='),source.indexOf('  const visibleBreakdowns =',source.indexOf('  const locationBreakdowns =')));
  const rows=new Function(...Object.keys(values),code+'return {locationBreakdowns,fleetBreakdowns,liveBreakdowns};')(...Object.values(values));
  assert.deepEqual(rows.locationBreakdowns.map(r=>r.id),[1,2]);
  assert.deepEqual(rows.fleetBreakdowns.map(r=>r.id),[1]);
  assert.deepEqual(splitRows.map(r=>r.id),[1]);
});
test('PDF, Excel and print models always reuse final table selection, independent of numbering or grouping',()=>{
  const shared=readFileSync(new URL('../src/shared-actions-table.jsx',import.meta.url),'utf8');
  assert.match(shared,/\n  for \(const data of new Set\(\[exportData, printData, smartPrintData\]\)\) if \(data\) data.rows = selectedRows;/);
  assert.doesNotMatch(shared,/data.rows = rendered/);
  assert.match(source,/const stagePipelineRequests = locationBreakdowns.filter/);
  assert.match(source,/stagePipelineSelectedRegion.sites.filter\(site => trendAvailableSites.includes\(site\)\)/);
});
