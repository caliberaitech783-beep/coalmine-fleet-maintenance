import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildDirectorReportTables,buildDirectorWhatsAppMessage,buildXlsxWorkbookBuffer,directorReportDue,directorReportWindow} from '../director-report-bundle.mjs';

test('Director report window runs daily at 7 PM India time',()=>{
  const window=directorReportWindow(new Date('2026-09-01T13:35:00Z'));
  assert.equal(window.slotKey,'2026-09-01-director-19');
  assert.equal(window.end.toISOString(),'2026-09-01T13:30:00.000Z');
  assert.equal(directorReportDue(new Date('2026-09-01T13:35:00Z')),true);
  assert.equal(directorReportDue(new Date('2026-09-01T14:05:00Z')),false);
});

test('Director bundle builds all department reports and real xlsx output',()=>{
  const tables=buildDirectorReportTables({
    requests:[
      {ref:'REQ-1',equipment:'EX-1',door:'D1',site:'Sasti OB',status:'Open',owner:'Production User',start:'2026-09-01 08:00',equipmentGroup:'Excavator'},
      {ref:'REQ-2',equipment:'TR-1',door:'D2',site:'Jayant OB',status:'Closed',owner:'Production User',closedBy:'Maintenance User',start:'2026-09-01 09:00',closedAt:'2026-09-01 12:00',verifiedBy:'MIS User',verifiedAt:'2026-09-01 13:00',firstTripDone:true,firstTripAt:'2026-09-01 14:00'},
      {ref:'REQ-3',equipment:'ID-1',door:'D3',site:'Majri OB',status:'Idle',owner:'Production User',idleReason:'No driver',start:'2026-09-01 10:00',closedAt:'2026-09-01 11:00'},
    ],
    equipmentRecords:[{equipmentName:'EX-1',door:'D1',category:'Equipment',status:'On road',currentLocation:'Sasti OB',make:'Komatsu'}],
    transferRecords:[{transferNo:'VT-1',equipment:'TR-1',source:'Sasti OB',destination:'Jayant OB',transferDate:'2026-09-01'}],
  });
  assert.equal(tables.length,13);
  assert.ok(tables.some((table)=>table.department==='General'));
  assert.ok(tables.some((table)=>table.department==='Production'));
  assert.ok(tables.some((table)=>table.department==='Maintenance'));
  assert.ok(tables.some((table)=>table.department==='MIS'));
  assert.equal(tables.find((table)=>table.title==='Location wise opened BD').department,'Production');
  assert.equal(tables.find((table)=>table.title==='Location wise closing BD').department,'Maintenance');
  assert.equal(tables.find((table)=>table.title==='MIS Verification Report').department,'MIS');
  assert.equal(tables.find((table)=>table.title==='Idle Vehicle Report').department,'Maintenance');
  assert.equal(tables.find((table)=>table.title==='On Road with first trip veri.').department,'MIS');
  const roadStatus=tables.find((table)=>table.title==='Report for On Road / Off Road & Idle');
  assert.equal(roadStatus.rows[0][roadStatus.columns.findIndex((column)=>column.key==='roadStatus')],'Off road');
  const workbook=buildXlsxWorkbookBuffer(tables[0].title,tables[0].columns,tables[0].rows);
  assert.equal(workbook.subarray(0,2).toString(),'PK');
  assert.match(workbook.toString('utf8'),/application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main\+xml/);
  const message=buildDirectorWhatsAppMessage({generatedAt:new Date('2026-09-01T13:30:00Z'),links:[
    {department:'Production',title:'Location wise opened BD',pdfUrl:'https://bdms.cmll.in/r/a',xlsxUrl:'https://bdms.cmll.in/r/b'},
  ]});
  assert.match(message,/▣ Nerve Center/);
  assert.match(message,/Director's Daily Report/);
  assert.match(message,/Schedule: Daily 7:00 PM IST/);
  assert.match(message,/Department Wise Report Links:/);
  assert.match(message,/Production --/);
  assert.match(message,/1\. Location wise opened BD/);
  assert.match(message,/PDF 📄\nhttps:\/\/bdms\.cmll\.in\/r\/a/);
  assert.match(message,/Excel 📊\nhttps:\/\/bdms\.cmll\.in\/r\/b/);
  assert.doesNotMatch(message,/\n\s+https:\/\/bdms\.cmll\.in\/r\//);
});

test('Director report API and all-user schedule popup are wired into server and reports UI',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const schedulePolish=readFileSync(new URL('../src/report-schedule-polish.css',import.meta.url),'utf8');
  assert.match(server,/published_reports/);
  assert.match(server,/published_reports_short_code_idx/);
  assert.match(server,/WHATSAPP_SETTING_KEY='meta_whatsapp'/);
  assert.match(server,/app\.get\('\/api\/whatsapp\/settings'/);
  assert.match(server,/app\.put\('\/api\/whatsapp\/settings'/);
  assert.match(server,/metaWhatsAppRuntimeEnv/);
  assert.match(server,/app\.get\(\['\/reports\/published\/:id','\/r\/:id'\]/);
  assert.match(server,/app\.post\('\/api\/reports\/director\/send-test'/);
  assert.match(server,/app\.post\('\/api\/reports\/director\/send-email-test'/);
  assert.match(server,/sendDirectorReportEmail/);
  assert.match(server,/files\.push\(/);
  assert.match(server,/publishDirectorReportArchive/);
  assert.match(server,/archiveUrl/);
  assert.match(server,/sendScheduledDirectorReportBundles/);
  assert.match(source,/Report delivery schedules/);
  assert.match(source,/HIERARCHY_REPORT_DESIGNATIONS/);
  assert.match(source,/Seven day report schedule summary/);
  assert.match(source,/Assign schedule to/);
  assert.match(source,/Save schedules/);
  assert.match(source,/Every N days/);
  assert.match(server,/app\.get\('\/api\/report-schedule-settings'/);
  assert.match(server,/app\.put\('\/api\/report-schedule-settings'/);
  assert.match(css,/\.director-timing-modal/);
  assert.match(css,/\.report-week-grid/);
  assert.match(source,/report-schedule-polish\.css/);
  assert.match(schedulePolish,/\.report-schedule-title/);
  assert.match(schedulePolish,/grid-template-columns: repeat\(12/);
  assert.match(schedulePolish,/position: sticky/);
});
