import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDepartmentReports} from '../department-reports.mjs';
import {compareDurationValues} from '../src/duration-sort.mjs';

test('table sorts evaluate an expensive column once per row and preserve existing tie ordering',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const snippet=source.slice(source.indexOf('function useSortableRows('),source.indexOf('const WORKFLOW_INITIAL_RENDER_ROWS'));
  const sortRows=new Function('useState','useMemo','comparableValue','isDurationColumn','compareDurationValues','sortCollator',snippet+';return useSortableRows;')(
    initial=>[typeof initial==='function'?initial():initial,()=>{}],fn=>fn(),value=>value,()=>false,compareDurationValues,new Intl.Collator(undefined,{numeric:true}));
  const rows=Array.from({length:10000},(_,i)=>({id:i,value:(10000-i)%100}));
  for(const direction of ['asc','desc']){
    let evaluations=0;
    const [actual]=sortRows(rows,{key:'value',direction},row=>{evaluations++;return row.value;},false);
    const expected=[...rows].sort((a,b)=>(a.value-b.value||a.id-b.id)*(direction==='asc'?1:-1));
    assert.deepEqual(actual,expected);
    assert.equal(evaluations,rows.length);
  }
});

test('formatting thousands of timestamps constructs one reusable formatter and preserves IST output',()=>{
  const source=readFileSync(new URL('../date-time-format.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
  let constructions=0;
  const api=new Function('Intl',source+';return {formatDisplayDateTime,indiaCalendarDateKey};')({DateTimeFormat:function(...args){constructions++;return new Intl.DateTimeFormat(...args);}});
  for(let i=0;i<2000;i++){
    assert.equal(api.indiaCalendarDateKey('2026-10-16T20:00:00Z'),'2026-10-17');
    assert.equal(api.formatDisplayDateTime('2026-10-16 13:05:09'),'16-10-26 01:05:09 PM');
  }
  assert.equal(constructions,1);
});

test('inactive vehicle reports do no history work; opening the category or ZIP builds all three',()=>{
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const history=source.slice(source.indexOf('  const needsVehicleReports ='),source.indexOf('  const breakdownRegionSites ='));
  const rest=source.slice(source.indexOf('  const maximumVehicleBreakdownRows ='),source.indexOf('  const fleetStatusRows =',source.indexOf('  const maximumVehicleBreakdownRows =')));
  const calls=[];
  const scope={useMemo:fn=>fn(),equipmentRecords:[],reportRequests:[],transferRecords:[],breakdownMonth:'2026-10',breakdownRegionSites:null,breakdownRegion:'all',breakdownSite:'',
    vehicleFleetRows:()=>{calls.push('fleet');return ['fleet'];},vehicleBreakdownSummaryRows:()=>{calls.push('summary');return ['summary'];},vehicleCommonRemarkRows:()=>{calls.push('remarks');return ['remarks'];}};
  const calculate=new Function(...Object.keys(scope),'activeCategory','reportZipOpen',history+rest+';return {vehicleHistoryReportRows,maximumVehicleBreakdownRows,vehicleCommonRemarksRows};');
  assert.deepEqual(calculate(...Object.values(scope),{id:'general'},false),{vehicleHistoryReportRows:[],maximumVehicleBreakdownRows:[],vehicleCommonRemarksRows:[]});
  assert.deepEqual(calls,[]);
  for(const [id,zip] of [['vehicle-history',false],['general',true]]){
    calls.length=0;calculate(...Object.values(scope),{id},zip);assert.deepEqual(calls,['fleet','summary','remarks']);
  }
});

test('skipping inactive availability preserves report metadata and all other report rows',()=>{
  const options={equipmentRecords:[{door:'A',currentLocation:'Sasti OC'}],requests:[{ref:'REQ-1',door:'A',start:'2026-10-01 09:00',status:'Open'}],from:'2026-10-01',to:'2026-10-02',now:new Date('2026-10-03T00:00Z')};
  const full=buildDepartmentReports(options),lazy=buildDepartmentReports({...options,includeAvailabilityRows:false});
  assert.deepEqual(lazy.map(r=>[r.title,r.category,r.columns.map(c=>c.label)]),full.map(r=>[r.title,r.category,r.columns.map(c=>c.label)]));
  for(let i=0;i<full.length;i++){
    if(full[i].title==='Availability Report'){assert.equal(full[i].rows.length,1);assert.deepEqual(lazy[i].rows,[]);}
    else assert.deepEqual(lazy[i].rows,full[i].rows,full[i].title);
  }
});
