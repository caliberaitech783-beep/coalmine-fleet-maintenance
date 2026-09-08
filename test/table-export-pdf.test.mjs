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

test('wide tables and multi-page remarks stay inside the page and retain the final text',async()=>{
  const columns=Array.from({length:24},(_,index)=>({label:`Field ${index+1}`}));
  const row=columns.map((_,index)=>index===4?`${'Maintenance remark awaiting recovery. '.repeat(220)}FINAL_SENTINEL`:index===0?'REQ-LONG':String(index));
  const pdf=await buildTableExportPdf({title:'Long remark report',columns,rows:[row],highlights:[0]});
  const text=pdf.toString('latin1');
  assert.ok(Number(text.match(/\/Count (\d+)\b/)?.[1])>1);
  const textFragments=[...text.matchAll(/<([0-9a-f]+)>/gi)].map(match=>Buffer.from(match[1],'hex').toString('latin1')).join('');
  assert.match(textFragments,/FINAL_SENTINEL/);
  const rectangles=[...text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) re\b/g)].map(match=>match.slice(1).map(Number));
  assert.ok(rectangles.length>columns.length);
  for(const [x,y,width,height] of rectangles){
    assert.ok(x>=27.99 && x+width<=1162.56,`column outside A3 content: ${x},${width}`);
    assert.ok(y>=28 && y+height<=791.90,`row outside page/footer boundary: ${y},${height}`);
  }
});

test('mixed Hindi and English report text uses embedded Unicode shaping, not lost glyphs',async()=>{
  const pdf=await buildTableExportPdf({title:'रखरखाव रिपोर्ट - Maintenance',columns:[{label:'Remark / कारण'}],rows:[['वाहन नहीं पहुंचा - REQ-1']]});
  const text=pdf.toString('latin1');
  assert.match(text,/\/BaseFont \/[^\s]*NotoSansDevanagari-Regular/);
  assert.match(text,/\/ToUnicode/);
  for(const code of ['0935','093e','0939','0928','0052'])assert.ok(text.includes(`<${code}>`),`missing Unicode map for ${code}`);
  assert.match(text,/\/Count 1\b/);
  const license=readFileSync(new URL('../assets/fonts/OFL.txt',import.meta.url),'utf8');
  assert.match(license,/SIL OPEN FONT LICENSE Version 1.1/);
});
