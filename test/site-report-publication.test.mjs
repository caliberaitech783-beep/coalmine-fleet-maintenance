import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {buildSiteFleetReportTables,buildSiteReportMessage,siteReportFilename} from '../site-consolidated-report.mjs';
import {buildTableBundlePdf} from '../table-export-pdf.mjs';
import {buildXlsxReportBundleBuffer,DIRECTOR_REPORT_TITLES} from '../director-report-bundle.mjs';
import {displaySiteName} from '../region-scope.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('site publication stores a real combined PDF and workbook with direct links to the same site files',async()=>{
  const writes=[];
  const dependencies={buildSiteFleetReportTables,buildSiteReportMessage,siteReportFilename,buildTableBundlePdf,buildXlsxReportBundleBuffer,
    displaySiteName,formatDisplayDateTime,randomUUID,pool:{query:async(sql,args)=>{writes.push({sql,args});return {rowCount:1};}}};
  const snippet=server.slice(server.indexOf('async function publishDirectorReportFiles('),server.indexOf('async function publishDirectorReportArchive('));
  const publish=new Function(...Object.keys(dependencies),`${snippet};return publishDirectorReportFiles;`)(...Object.values(dependencies));
  const window={start:new Date('2026-09-14T19:00:00+05:30'),end:new Date('2026-09-15T07:00:00+05:30')};
  const sourceData={requests:[
    {ref:'SASTI-CASE',site:'Sasti OB',start:'2026-09-14 21:00:00',status:'Closed',closedAt:'2026-09-15 03:00:00',complaint:'Brake check'},
    {ref:'MAJRI-SECRET',site:'Majri OB',start:'2026-09-14 21:00:00',status:'Open'},
  ],equipmentRecords:[],transferRecords:[]};
  const result=await publish({baseUrl:'https://reports.example',slotKey:'morning',now:window.end,window,sourceData,siteAccess:'Sasti OB',reportTitles:DIRECTOR_REPORT_TITLES.slice(0,3)});
  assert.equal(writes.length,2);assert.match(writes[0].sql,/DELETE FROM published_reports WHERE expires_at<=NOW\(\)/);
  const stored=writes[1];assert.match(stored.sql,/INTERVAL '14 days'/);
  assert.equal(result.files.length,2);assert.equal(result.links.length,1);assert.equal(result.links[0].rowCount,1);
  const [pdf,xlsx]=result.files;
  assert.equal(pdf.content.subarray(0,5).toString(),'%PDF-');
  assert.equal(xlsx.content.subarray(0,2).toString(),'PK');
  assert.match(xlsx.content.toString(),/SASTI-CASE/);assert.doesNotMatch(xlsx.content.toString(),/MAJRI-SECRET/);
  assert.ok(result.message.startsWith('*SASTI OB*'));
  for(const [index,file] of [[0,pdf],[1,xlsx]]){
    const offset=index*4;
    assert.equal(stored.args[offset+2],file.filename);
    assert.equal(stored.args[offset+3],file.content);
    assert.ok(result.message.includes(`https://reports.example/r/${stored.args[offset+1]}`));
    assert.match(file.filename,/Sasti-OB/);
  }
});
