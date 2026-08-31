import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDirectorReportEmail,buildDirectorReportZipAttachment} from '../director-report-email.mjs';

test('Director report email renders department links for PDF and Excel',()=>{
  const email=buildDirectorReportEmail({generatedAt:new Date('2026-09-01T13:30:00Z'),links:[
    {department:'General',title:'Loc. wise Open BD',pdfUrl:'https://bdms.cmll.in/r/pdf123',xlsxUrl:'https://bdms.cmll.in/r/xls123'},
  ]});
  assert.match(email.subject,/Nerve Center - Director's Daily Report/);
  assert.match(email.text,/General --/);
  assert.match(email.text,/PDF: https:\/\/bdms\.cmll\.in\/r\/pdf123/);
  assert.match(email.html,/Department Wise Report Links/);
  assert.match(email.html,/href="https:\/\/bdms\.cmll\.in\/r\/pdf123"/);
  assert.match(email.html,/href="https:\/\/bdms\.cmll\.in\/r\/xls123"/);
});

test('Director report email creates one zip attachment with separate PDF and Excel files',()=>{
  const attachment=buildDirectorReportZipAttachment({slotKey:'2026-09-01-director-19',files:[
    {filename:'general-open-bd.pdf',content:Buffer.from('%PDF sample')},
    {filename:'general-open-bd.xlsx',content:Buffer.from('PK sample')},
  ]});
  assert.equal(attachment.filename,'nerve-center-director-reports-2026-09-01-director-19.zip');
  assert.equal(attachment.contentType,'application/zip');
  assert.equal(attachment.content.subarray(0,2).toString(),'PK');
  const zipText=attachment.content.toString('latin1');
  assert.match(zipText,/general-open-bd\.pdf/);
  assert.match(zipText,/general-open-bd\.xlsx/);
});
