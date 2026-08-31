import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTableExportPdf} from '../table-export-pdf.mjs';

test('table exports produce a complete downloadable PDF',async()=>{
  const pdf=await buildTableExportPdf({title:'Equipment master report',columns:[{label:'Door no.'},{label:'Make'}],rows:[['S235','Tata']]});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>1500);
  assert.match(pdf.toString('latin1'),/Equipment master report/);
  assert.match(pdf.toString('latin1'),/\/Count 1\b/);
});
