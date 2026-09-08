import assert from 'node:assert/strict';
import test from 'node:test';
import {equipmentGroupValue,normalizeEquipmentGroup} from '../equipment-group.mjs';
import {drilldownView,equipmentGroupLabel} from '../src/dashboard-drilldown-model.mjs';
import {requestEquipmentDetails,requestEquipmentGroupOptionLabel,requestEquipmentGroupOptions,requestEquipmentRecordsForGroup} from '../request-equipment.mjs';
import {buildDepartmentReports} from '../department-reports.mjs';

const frozenRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
const ids=rows=>rows.map(row=>row.id);

test('equipment group labels normalize only casing and whitespace, preserving punctuation and plurals',()=>{
  for(const value of ['scania tippers',' SCANIA   TIPPERS ','\tsCaNiA\nTippers\r','scania\u00a0tippers']){
    assert.equal(normalizeEquipmentGroup(value),'SCANIA TIPPERS');
    assert.equal(normalizeEquipmentGroup(normalizeEquipmentGroup(value)),'SCANIA TIPPERS');
  }
  assert.equal(normalizeEquipmentGroup(null),'');
  assert.equal(normalizeEquipmentGroup(undefined),'');
  assert.equal(normalizeEquipmentGroup(' \t\n '),'');
  const distinct=['dozer','dozers','pay-loader','pay loader','haul/truck','haul truck','loader (5 mt)'];
  assert.deepEqual(distinct.map(normalizeEquipmentGroup),['DOZER','DOZERS','PAY-LOADER','PAY LOADER','HAUL/TRUCK','HAUL TRUCK','LOADER (5 MT)']);
  assert.equal(new Set(distinct.map(normalizeEquipmentGroup)).size,distinct.length);
});

test('group value prefers the first nonblank current or legacy field and leaves the explicit fallback intact',()=>{
  assert.equal(equipmentGroupValue(Object.freeze({group:'  dozers ',equipmentGroup:'EXCAVATOR'})),'DOZERS');
  assert.equal(equipmentGroupValue(Object.freeze({group:' \t ',equipmentGroup:'  pay   loader '})),'PAY LOADER');
  assert.equal(equipmentGroupValue(Object.freeze({equipmentGroup:'  scania tippers '})),'SCANIA TIPPERS');
  assert.equal(equipmentGroupValue(Object.freeze({group:null,equipmentGroup:' '})),'');
  assert.equal(equipmentGroupValue({},'Unclassified'),'Unclassified');
  assert.equal(equipmentGroupValue(),'');
});

test('request dropdowns combine legacy and differently cased groups without losing any equipment IDs',()=>{
  const records=frozenRows([
    {id:0,group:'scania tippers',door:'T-01'},
    {id:'002',group:' SCANIA  TIPPERS ',door:'T-02'},
    {id:3,group:' \t ',equipmentGroup:'Scania\nTippers',door:'T-03'},
    {id:4,equipmentGroup:'scania tippers',door:'T-04'},
    {id:5,group:'dozer',door:'D-01'},
    {id:6,group:'dozers',door:'D-02'},
  ]);
  const before=structuredClone(records),options=requestEquipmentGroupOptions(records);
  assert.deepEqual(options.map(option=>option.label),['SCANIA TIPPERS','DOZER','DOZERS']);
  assert.deepEqual(ids(options[0].records),[0,'002',3,4]);
  assert.deepEqual(options.flatMap(option=>ids(option.records)),ids(records));
  const selected=requestEquipmentRecordsForGroup(records,' scania\t tippers ');
  assert.deepEqual(ids(selected),[0,'002',3,4]);
  selected.forEach((row,index)=>assert.equal(row,records[index],'Group filtering preserves the original record identity'));
  for(const record of records){
    assert.equal(requestEquipmentGroupOptionLabel(record),equipmentGroupValue(record));
    assert.equal(requestEquipmentDetails(record).group,equipmentGroupValue(record));
    assert.equal(requestEquipmentDetails(record).door,record.door);
  }
  assert.equal(requestEquipmentGroupOptionLabel({group:' ',equipmentGroup:' ',equipmentName:'Vehicle without group'}),'');
  assert.deepEqual(requestEquipmentGroupOptions([{id:7,group:' ',equipmentName:'Vehicle without group'}]),[]);
  assert.deepEqual(records,before);
});

test('dashboard drilldowns combine group counts without combining assets or widening site scope',()=>{
  const rows=frozenRows([
    {id:'A-01',group:'scania tippers',category:'Vehicle',currentLocation:'Sasti OB',door:'T-01'},
    {id:'A-02',group:' SCANIA   TIPPERS ',category:'Vehicle',currentLocation:'Sasti OB',door:'T-02'},
    {id:'A-03',group:' ',equipmentGroup:'Scania Tippers',category:'Vehicle',currentLocation:'Sasti OB',door:'T-03'},
    {id:'A-04',group:'dozer',category:'Equipment',currentLocation:'Sasti OB',door:'D-01'},
    {id:'A-05',group:'dozers',category:'Equipment',currentLocation:'Sasti OB',door:'D-02'},
    {id:'A-06',group:'scania tippers',category:'Vehicle',currentLocation:'Jayant OB',door:'T-04'},
  ]);
  const before=structuredClone(rows),regions=[{code:'WCL',sites:['Sasti OB']},{code:'NCL',sites:['Jayant OB']}];
  const view=drilldownView(rows,regions,{region:'WCL'});
  assert.equal(view.regionTotal,5);
  assert.deepEqual(view.options.group,[{value:'DOZER',count:1},{value:'DOZERS',count:1},{value:'SCANIA TIPPERS',count:3}]);
  const selected=drilldownView(rows,regions,{region:'WCL',site:'Sasti OB',group:'SCANIA TIPPERS'});
  assert.deepEqual(ids(selected.rows),['A-01','A-02','A-03']);
  assert.deepEqual(selected.options.machine.map(option=>option.value),['T-01','T-02','T-03']);
  assert.deepEqual(ids(drilldownView(rows,regions,{region:'NCL',group:'SCANIA TIPPERS'}).rows),['A-06']);
  assert.deepEqual(rows,before);
});

test('dashboard group fallbacks still expose legacy groups, item names, categories and unclassified records',()=>{
  assert.equal(equipmentGroupLabel({group:' ',equipmentGroup:' pay loader ',itemName:'Different item'}),'PAY LOADER');
  assert.equal(equipmentGroupLabel({itemName:'  service   truck ',category:'Vehicle'}),'SERVICE TRUCK');
  assert.equal(equipmentGroupLabel({category:'  equipment '}),'EQUIPMENT');
  assert.equal(equipmentGroupLabel({}),'Unclassified');
  assert.equal(equipmentGroupLabel({group:' \t ',equipmentGroup:' ',itemName:' ',category:''}),'Unclassified');
});

test('department report group cells use the same labels while preserving source requests and assets',()=>{
  const requests=frozenRows([
    {ref:'REQ-A',equipmentGroup:' scania\t tippers ',door:'T-01',status:'Open',start:'2026-09-08 08:00:00'},
    {ref:'REQ-B',group:' ',equipmentGroup:'Pay   loader',door:'L-01',status:'Open',start:'2026-09-08 09:00:00'},
  ]);
  const equipmentRecords=frozenRows([
    {id:'A-01',group:' scania tippers ',door:'T-01'},
    {id:'A-02',group:' ',equipmentGroup:'Pay   loader',door:'L-01'},
  ]);
  const before=structuredClone({requests,equipmentRecords});
  const reports=buildDepartmentReports({requests,equipmentRecords,from:'2026-09-08',to:'2026-09-08',now:new Date('2026-09-08T12:00:00+05:30')});
  for(const title of ['Total Request Submitted Report','Open Off road Cases','Availability Report']){
    const report=reports.find(item=>item.title===title),column=report.columns.find(item=>item.key==='equipmentGroup');
    assert.ok(column,`${title} must expose its equipment group column`);
    assert.deepEqual(report.rows.map(column.value),['SCANIA TIPPERS','PAY LOADER']);
    assert.equal(report.rows.length,2);
  }
  assert.deepEqual({requests,equipmentRecords},before);
  assert.deepEqual(ids(reports.find(report=>report.title==='Availability Report').rows),['A-01','A-02']);
});
