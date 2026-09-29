import test from 'node:test';
import assert from 'node:assert/strict';
import {oemDetailReportRows, oemEquipmentLabel} from '../src/oem-dashboard-filters.mjs';
import {groupReportRows} from '../src/site-report.mjs';

test('OEM equipment labels separate tippers and machines without repeating the make',()=>{
  assert.equal(oemEquipmentLabel({make:'VOLVO',group:'VOLVO TIPPERS'}),'VOLVO TIPPERS');
  assert.equal(oemEquipmentLabel({make:'VOLVO',group:'PAY LOADER'}),'VOLVO PAY LOADER');
  const rows=oemDetailReportRows([{region:'WCL',site:'Sasti',records:[{make:'VOLVO',group:'VOLVO TIPPERS'},{make:'VOLVO',group:'PAY LOADER'}]}],true);
  assert.equal(new Set(rows.map(row=>row.reportSite)).size,2);
});
test('OEM detail groups retain site boundaries, records and distinct asset totals',()=>{
  const sites=[{region:'WCL',site:'Sasti',records:[{id:1,assetId:'A',make:'VOLVO'},{id:2,assetId:'B',make:'SCANIA'},{id:3,assetId:'A',make:'VOLVO'}]},{region:'NCL',site:'Jayant',records:[{id:4,assetId:'C',make:'VOLVO'},{id:5,assetId:'D'}]}];
  const rows=oemDetailReportRows(sites,true);
  const groups=groupReportRows(rows,row=>row.reportSite,row=>row.assetId);
  assert.deepEqual(groups.map(g=>[g.label,g.assets,g.rows.length]),[['WCL · Sasti — VOLVO',1,2],['WCL · Sasti — SCANIA',1,1],['NCL · Jayant — VOLVO',1,1],['NCL · Jayant — OEM not specified',1,1]]);
  assert.equal(rows.length,5);
  assert.equal(new Set(oemDetailReportRows(sites).map(r=>r.reportSite)).size,2);
  assert.equal(sites[0].records[0].reportSite,undefined);
  assert.deepEqual(oemDetailReportRows([],true),[]);
});
