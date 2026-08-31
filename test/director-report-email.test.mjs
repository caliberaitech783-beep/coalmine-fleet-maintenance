import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDirectorReportEmail} from '../director-report-email.mjs';

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
