import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSiteFleetReportTables,buildSiteReportMessage,fleetActivityTable,requestsInReportWindow,reportSites,siteSourceData,timestampInReportWindow} from '../site-consolidated-report.mjs';
import {DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {TICKET_ACCEPTANCE_REPORT_TITLE} from '../department-reports.mjs';

const window={start:new Date('2026-09-14T19:00:00+05:30'),end:new Date('2026-09-15T07:00:00+05:30')};
const request=(ref,fields={})=>({ref,site:'Sasti OB',door:'D-1',equipment:'Tipper',status:'Open',start:'2026-09-14 20:00:00',...fields});

test('overnight report contains every case with activity and uses half-open IST boundaries',()=>{
  const cases=[request('start',{start:'2026-09-14 19:00:00'}),request('before',{start:'2026-09-14 18:59:59'}),
    request('end',{start:'2026-09-15 07:00:00'}),request('closed',{start:'2026-09-10 10:00:00',closedAt:'2026-09-15 06:59:59',status:'Closed'}),
    request('both',{closedAt:'2026-09-15 02:00:00',status:'Closed'}),
    request('verified',{start:'2026-09-10 10:00:00',closedAt:'2026-09-11 11:00:00',verifiedAt:'2026-09-15 01:00:00',status:'Closed'}),
    request('update',{start:'2026-09-10 10:00:00',dailyRemarks:[{createdAt:'2026-09-15 05:00:00',remark:'Parts fitted'}]}),
    request('idle',{start:'2026-09-10 10:00:00',idealRequestedAt:'2026-09-15 01:00:00',status:'Idle'}),
  ];
  assert.deepEqual(requestsInReportWindow(cases,window).map(row=>row.ref),['start','closed','both','verified','update','idle']);
  const table=fleetActivityTable(cases,window);
  assert.equal(table.rows.length,6);
  assert.match(table.rows.find(row=>row[0]==='both')[3],/Opened \/ Off Road[\s\S]*Closed \/ On Road/);
  assert.equal(timestampInReportWindow('2026-09-15T01:30:00Z',window),false);
  assert.equal(timestampInReportWindow('2026-09-14T13:30:00Z',window),true);
});

test('site artifacts never mix sites and activity section preserves cases hidden by status-specific reports',()=>{
  const source={requests:[request('S',{closedAt:'2026-09-15 01:00:00',status:'Closed'}),request('M',{site:'Majri OB'})],
    equipmentRecords:[{currentLocation:'Sasti OB',door:'D-1'},{currentLocation:'Majri OB',door:'M-1'}],
    transferRecords:[{destination:'Sasti OB',transferDate:'2026-09-15'},{destination:'Majri OB',transferDate:'2026-09-15'}]};
  const scoped=siteSourceData(source,'sasti ob');
  assert.equal(scoped.requests.length,1);assert.equal(scoped.equipmentRecords.length,1);assert.equal(scoped.transferRecords.length,1);
  const tables=buildSiteFleetReportTables({source,site:'Sasti OB',window,reportTitles:DIRECTOR_REPORT_TITLES.slice(0,3)});
  assert.equal(tables[0].rows.length,1);assert.equal(tables[0].rows[0][0],'S');
  assert.ok(tables.some(table=>table.title==='Location wise closing BD'));
  assert.ok(!JSON.stringify(tables).includes('Majri'));
  assert.deepEqual(reportSites(source,{sites:['sasti ob']}),['sasti ob']);
  assert.deepEqual(reportSites(source,{sites:[]}),[]);
  assert.deepEqual(reportSites(source,{sites:null}),['majri ob','sasti ob']);
});

test('a later closure or verification does not rewrite the status of an earlier reporting window',()=>{
  const rows=fleetActivityTable([request('later',{status:'Closed',closedAt:'2026-09-15 08:00:00',verifiedAt:'2026-09-15 09:00:00',maintenanceWork:'Future closure work',delayedReason:'Future reason'})],window).rows;
  assert.equal(rows[0][4],'Open');assert.equal(rows[0][6],'');assert.equal(rows[0][7],'');
  assert.equal(rows[0][14],'');assert.equal(rows[0][15],'');
});

test('activity snapshots distinguish accepted and in-progress requests from unaccepted Open work',()=>{
  const accepted=fleetActivityTable([request('accepted',{acceptedAt:'2026-09-15 01:00:00'})],window).rows[0];
  const progressing=fleetActivityTable([request('progressing',{acceptedAt:'2026-09-15 01:00:00',inProgressAt:'2026-09-15 02:00:00'})],window).rows[0];
  assert.equal(accepted[4],'Accepted');
  assert.equal(progressing[4],'In progress');
});

test('backdated requests and acceptance or flag activity still appear in the interval they were recorded',()=>{
  const cases=['createdAt','acceptedAt','arrivalFlaggedAt','misFlaggedAt'].map((key,index)=>request(`event-${index}`,{start:'2026-09-10 10:00:00',[key]:'2026-09-15 01:00:00'}));
  assert.deepEqual(requestsInReportWindow(cases,window).map(row=>row.ref),cases.map(row=>row.ref));
});

test('site messages highlight one site, identify exact period, and include separate direct file links',()=>{
  const message=buildSiteReportMessage({site:'Sasti OB',window,count:2,pdfUrl:'https://example.invalid/sasti.pdf',xlsxUrl:'https://example.invalid/sasti.xlsx'});
  assert.match(message,/^\*SITE: Sasti OB\*/);assert.match(message,/\*FROM:\*/);assert.match(message,/\*TO:\*/);
  assert.match(message,/\*PDF - Sasti OB:\* https:\/\/example.invalid\/sasti.pdf/);
  assert.match(message,/Cases with activity:\* 2/);assert.ok(message.length<1024);
  const crm=buildSiteReportMessage({kind:'CRM',site:'Sasti OB',window,count:0,pdfUrl:'https://example.invalid/a',xlsxUrl:'https://example.invalid/b'});
  assert.match(crm,/Tickets with activity:\* 0/);
});

test('empty site report retains its activity sheet and a request is not truncated by list limits',()=>{
  const source={requests:Array.from({length:301},(_,i)=>request(`CASE-${i}`)),equipmentRecords:[],transferRecords:[]};
  const tables=buildSiteFleetReportTables({source,site:'Sasti OB',window,reportTitles:[]});
  assert.equal(tables[0].rows.length,301);
  assert.equal(buildSiteFleetReportTables({source,site:'Majri OB',window}).length,1);
});

test('availability uses the exact overnight interval across a month boundary and includes carried-over downtime',()=>{
  const monthWindow={start:new Date('2026-08-31T19:00:00+05:30'),end:new Date('2026-09-01T07:00:00+05:30')};
  const source={equipmentRecords:[{currentLocation:'Sasti OB',door:'D-1'},{currentLocation:'Sasti OB',door:'D-2'}],requests:[
    request('carried',{start:'2026-08-20 08:00:00'}),
    request('closed',{door:'D-2',start:'2026-08-20 08:00:00',closedAt:'2026-09-01 06:00:00',status:'Closed'}),
    request('other-site',{site:'Majri OB',door:'D-2',start:'2026-08-31 20:00:00'}),
  ]};
  const tables=buildSiteFleetReportTables({source,site:'Sasti OB',window:monthWindow,reportTitles:['Availability Report']});
  assert.deepEqual(tables[0].rows.map(row=>row[0]),['closed']);
  const availability=tables.find(table=>table.title==='Availability Report');
  const cell=(row,key)=>row[availability.columns.findIndex(column=>column.key===key)];
  const carried=availability.rows.find(row=>cell(row,'door')==='D-1');
  const closed=availability.rows.find(row=>cell(row,'door')==='D-2');
  assert.equal(cell(carried,'productive'),12);assert.equal(cell(carried,'breakdown'),'12.00');assert.equal(cell(carried,'available'),'0.00');
  assert.equal(cell(closed,'productive'),12);assert.equal(cell(closed,'breakdown'),'11.00');assert.equal(cell(closed,'available'),'1.00');
});

test('selected WhatsApp acceptance report includes only delays over 30 minutes within the permitted site and schedule window',()=>{
  const source={requests:[
    request('exact',{acceptedAt:'2026-09-14 20:30:00'}),
    request('above',{acceptedAt:'2026-09-14 21:00:00'}),
    request('below',{acceptedAt:'2026-09-14 20:29:59'}),
    request('pending'),
    request('earlier-opening',{start:'2026-09-14 18:00:00',acceptedAt:'2026-09-14 19:00:00'}),
    request('outside-window',{start:'2026-09-14 17:00:00',acceptedAt:'2026-09-14 18:00:00'}),
    request('next-window',{acceptedAt:'2026-09-15 07:00:00'}),
    request('other-site',{site:'Majri OB',acceptedAt:'2026-09-14 21:00:00'}),
  ]};
  assert.ok(DIRECTOR_REPORT_TITLES.includes(TICKET_ACCEPTANCE_REPORT_TITLE),'existing schedule selections retain the same report title');
  const tables=buildSiteFleetReportTables({source,site:'Sasti OB',window,reportTitles:[TICKET_ACCEPTANCE_REPORT_TITLE]});
  const report=tables.find(table=>table.title===TICKET_ACCEPTANCE_REPORT_TITLE);
  const refIndex=report.columns.findIndex(column=>column.key==='ref');
  const differenceIndex=report.columns.findIndex(column=>column.key==='difference');
  assert.deepEqual(report.rows.map(row=>row[refIndex]),['above','earlier-opening']);
  assert.deepEqual(report.rows.map(row=>row[differenceIndex]),['1h 0m','1h 0m']);
  assert.match(report.description,/over 30 minutes/);
  const withoutSelection=buildSiteFleetReportTables({source,site:'Sasti OB',window,reportTitles:['Total Request Submitted Report']});
  assert.ok(!withoutSelection.some(table=>table.title===TICKET_ACCEPTANCE_REPORT_TITLE));
  assert.equal(withoutSelection.find(table=>table.title==='Total Request Submitted Report').rows.length,6);
});
