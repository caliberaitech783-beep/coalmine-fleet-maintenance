import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildTableExportPdf} from '../table-export-pdf.mjs';

test('table exports produce a complete downloadable PDF',async()=>{
  const pdf=await buildTableExportPdf({title:'Equipment master report',columns:[{label:'Door no.'},{label:'Make'}],rows:[['S235','Tata']]});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>1500);
  assert.match(pdf.toString('latin1'),/Equipment master report/);
  assert.match(pdf.toString('latin1'),/\/Count 1\b/);
  const source=readFileSync(new URL('../table-export-pdf.mjs',import.meta.url),'utf8');
  assert.match(source,/function drawColumnHeader/);
  assert.match(source,/size:'A3',layout:'landscape'/);
  assert.doesNotMatch(source,/join\('   \|   '\)/);
});

test('highlighted rows are filled red in the exported PDF',async()=>{
  const plain=await buildTableExportPdf({title:'Closed history',columns:[{label:'Job reference'}],rows:[['REQ-1'],['REQ-2']]});
  const highlighted=await buildTableExportPdf({title:'Closed history',columns:[{label:'Job reference'}],rows:[['REQ-1'],['REQ-2']],highlights:[1]});
  assert.doesNotMatch(plain.toString('latin1'),/0\.97\d* 0\.79\d* 0\.79\d* scn/);
  assert.match(highlighted.toString('latin1'),/0\.97\d* 0\.79\d* 0\.79\d* scn/);
});
