import assert from 'node:assert/strict';
import test from 'node:test';
import {buildTableBundlePdf,buildTableExportPdf} from '../table-export-pdf.mjs';

const generatedAt=new Date('2026-09-15T13:30:00Z');
const title='Sasti OB site report';
const subtitle='Reporting window: 15-09-2026 07:00 AM to 07:00 PM IST';
const fragments=source=>[...source.matchAll(/<([0-9a-f]+)>/gi)].map((match)=>Buffer.from(match[1],'hex').toString('latin1')).join('');
const pageStreams=pdf=>[...pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match)=>match[1]);
const pageCount=pdf=>Number(pdf.toString('latin1').match(/\/Count (\d+)\b/)?.[1]);

test('site PDF starts each selected report on a clear page with site, window and section headers',async()=>{
  const tables=Object.freeze([
    Object.freeze({title:'Site activity',columns:Object.freeze([{label:'User'},{label:'Activity at'}]),rows:Object.freeze([Object.freeze(['Operator A','2026-09-15 17:00'])])}),
    Object.freeze({title:'Open breakdowns',columns:Object.freeze([{label:'Reference'},{label:'Remark'}]),rows:Object.freeze([Object.freeze(['REQ-1','Inspect pump & hose'])])}),
  ]);
  const pdf=await buildTableBundlePdf({title,subtitle,tables,generatedAt});
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal(pageCount(pdf),2);
  const pages=pageStreams(pdf).map(fragments);
  assert.equal(pages.length,2);
  pages.forEach((page,index)=>{
    assert.ok(page.includes(title));
    assert.ok(page.includes(subtitle));
    assert.ok(page.includes(tables[index].title));
    assert.ok(page.includes(`Page ${index+1} of 2`));
    assert.ok(page.includes('Generated 15-09-2026 07:00:00 PM'));
  });
  assert.match(pages[0],/Operator A.*5:00 PM 15-09-2026/);
  assert.doesNotMatch(pages[0],/Open breakdowns/);
  assert.match(pages[1],/REQ-1.*Inspect pump & hose/);
  assert.equal(tables[0].rows[0][1],'2026-09-15 17:00');
});

test('site PDF keeps empty activity, omits empty optional sections and tolerates no tables',async()=>{
  const columns=[{label:'Reference'}];
  const tables=[
    {title:'Site activity',columns,rows:[]},
    {title:'Empty optional report',columns,rows:[]},
    {title:'Selected report',columns,rows:[['REQ-KEPT']]},
    {title:'Missing optional rows',columns},
  ];
  const pdf=await buildTableBundlePdf({title,tables,generatedAt});
  assert.equal(pageCount(pdf),2);
  const pages=pageStreams(pdf).map(fragments);
  assert.match(pages[0],/Site activity.*Reference.*No records are available for this report\./);
  assert.match(pages[0],/0 records exported/);
  assert.match(pages[1],/Selected report.*REQ-KEPT/);
  assert.doesNotMatch(pages.join(''),/Empty optional report|Missing optional rows|undefined/);
  for(const options of [{}, {title,tables:[]}, {title,tables:tables.slice(0,2)}]){
    const empty=await buildTableBundlePdf({...options,generatedAt});
    assert.equal(pageCount(empty),1);
    assert.match(fragments(empty.toString('latin1')),/No records are available for this report\./);
  }
});

test('site PDF retains every row and every long remark token across pages and sections',async()=>{
  const columns=Array.from({length:24},(_,index)=>({label:`Field ${index+1}`}));
  const tokens=Array.from({length:280},(_,index)=>`NOTE_${String(index).padStart(4,'0')}`);
  const longRow=columns.map((_,index)=>index===0?'REQ-LONG':index===4?tokens.map((token)=>`${token} maintenance details recorded.`).join(' ')+' FINAL_REMARK':`VALUE_${index}`);
  const rows=Array.from({length:90},(_,index)=>[`ACTIVITY_${String(index).padStart(4,'0')}`]);
  const pdf=await buildTableBundlePdf({title,subtitle,generatedAt,tables:[
    {title:'Site activity',columns:[{label:'User activity'}],rows},
    {title:'Maintenance details',columns,rows:[longRow,columns.map((_,index)=>index===0?'REQ-AFTER-LONG':`NEXT_${index}`)]},
    {title:'Final selected report',columns:[{label:'Reference'}],rows:[['FINAL_REPORT_ROW']]},
  ]});
  const pages=pageStreams(pdf).map(fragments),text=pages.join('');
  assert.equal(pages.length,pageCount(pdf));
  assert.ok(pages.length>6);
  for(const [reference] of rows)assert.equal(text.split(reference).length-1,1,`lost or duplicated ${reference}`);
  for(const token of tokens)assert.equal(text.split(token).length-1,1,`lost or duplicated ${token}`);
  assert.match(text,/FINAL_REMARK.*REQ-AFTER-LONG.*FINAL_REPORT_ROW/);
  pages.forEach((page,index)=>{
    assert.ok(page.includes(title),`missing site on page ${index+1}`);
    assert.ok(page.includes(subtitle),`missing window on page ${index+1}`);
    assert.ok(page.includes(`Page ${index+1} of ${pages.length}`));
    if(page.includes('NOTE_'))assert.match(page,/Maintenance details.*Field 1.*REQ-LONG/);
  });
  const rectangles=[...pdf.toString('latin1').matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) re\b/g)].map((match)=>match.slice(1).map(Number));
  for(const [x,y,width,height] of rectangles){
    assert.ok(x>=27.99&&x+width<=1162.56,`column outside A3 content: ${x},${width}`);
    assert.ok(y>=28&&y+height<=791.90,`row outside page/footer boundary: ${y},${height}`);
  }
});

test('bundle uses the existing Hindi font and directional fallback without changing source data',async()=>{
  const table={title:'रखरखाव रिपोर्ट',columns:[{label:'कारण'}],rows:[['वाहन → रखरखाव']]};
  const pdf=await buildTableBundlePdf({title:'Sasti OB',subtitle:'हिंदी → रिपोर्ट',tables:[table],generatedAt});
  const source=pdf.toString('latin1');
  assert.match(source,/\/BaseFont \/[^\s]*NotoSansDevanagari-Regular/);
  for(const code of ['0935','003e','002d'])assert.ok(source.includes(`<${code}>`));
  assert.equal(table.rows[0][0],'वाहन → रखरखाव');
});

test('legacy empty table export keeps its original single-report layout',async()=>{
  const pdf=await buildTableExportPdf({title:'Legacy empty report',columns:[{label:'Reference'}],rows:[]});
  assert.equal(pageCount(pdf),1);
  assert.match(fragments(pdf.toString('latin1')),/Legacy empty report.*0 records exported.*Reference.*No records are available for this report\./);
});
