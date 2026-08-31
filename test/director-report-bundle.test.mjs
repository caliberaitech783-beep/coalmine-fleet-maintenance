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
  const workbook=buildXlsxWorkbookBuffer(tables[0].title,tables[0].columns,tables[0].rows);
  assert.equal(workbook.subarray(0,2).toString(),'PK');
  assert.match(workbook.toString('utf8'),/application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main\+xml/);
  const message=buildDirectorWhatsAppMessage({generatedAt:new Date('2026-09-01T13:30:00Z'),links:[
    {department:'General',title:'Location wise Open BD report with Category (Prod)',pdfUrl:'https://bdms.cmll.in/r/a',xlsxUrl:'https://bdms.cmll.in/r/b'},
  ]});
  assert.match(message,/▣ Nerve Center/);
  assert.match(message,/Director's Daily Report/);
  assert.match(message,/Schedule: Daily 7:00 PM IST/);
  assert.match(message,/Department Wise Report Links:/);
  assert.match(message,/General --/);
  assert.match(message,/1\. Loc\. wise Open BD/);
  assert.match(message,/PDF 📄 https:\/\/bdms\.cmll\.in\/r\/a/);
  assert.match(message,/Excel 📊 https:\/\/bdms\.cmll\.in\/r\/b/);
});

test('Director report API and timing popup are wired into server and reports UI',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(server,/published_reports/);
  assert.match(server,/published_reports_short_code_idx/);
  assert.match(server,/WHATSAPP_SETTING_KEY='meta_whatsapp'/);
  assert.match(server,/app\.get\('\/api\/whatsapp\/settings'/);
  assert.match(server,/app\.put\('\/api\/whatsapp\/settings'/);
  assert.match(server,/metaWhatsAppRuntimeEnv/);
  assert.match(server,/app\.get\(\['\/reports\/published\/:id','\/r\/:id'\]/);
  assert.match(server,/app\.post\('\/api\/reports\/director\/send-test'/);
  assert.match(server,/sendScheduledDirectorReportBundles/);
  assert.match(source,/Director WhatsApp report timing/);
  assert.match(source,/Generate & send test now/);
  assert.match(source,/9925565281/);
  assert.match(css,/\.director-timing-modal/);
});
