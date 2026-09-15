import assert from 'node:assert/strict';
import test from 'node:test';
import {buildXlsxReportBundleBuffer,buildXlsxWorkbookBuffer} from '../director-report-bundle.mjs';

function storedFiles(buffer){
  assert.ok(Buffer.isBuffer(buffer));
  const files=new Map();
  let offset=0;
  while(buffer.readUInt32LE(offset)===0x04034b50){
    assert.equal(buffer.readUInt16LE(offset+8),0);
    const size=buffer.readUInt32LE(offset+18),nameLength=buffer.readUInt16LE(offset+26),extraLength=buffer.readUInt16LE(offset+28);
    const name=buffer.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extraLength;
    assert.ok(!files.has(name),`duplicate ZIP entry ${name}`);
    files.set(name,buffer.subarray(start,start+size).toString('utf8'));
    offset=start+size;
  }
  assert.equal(buffer.readUInt32LE(offset),0x02014b50);
  assert.equal(buffer.readUInt32LE(buffer.length-22),0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length-12),files.size);
  return files;
}

const unescapeXml=value=>value.replace(/&(amp|lt|gt|quot|apos);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity]));
const sheetNames=files=>[...files.get('xl/workbook.xml').matchAll(/<sheet name="([^"]*)" sheetId="(\d+)" r:id="rId(\d+)"\/>/g)].map((match)=>{
  assert.equal(match[2],match[3]);
  return unescapeXml(match[1]).replace(/_x([0-9a-f]{4})_/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));
});
const cells=xml=>[...xml.matchAll(/<c r="([A-Z]+\d+)" t="inlineStr"><is><t(?: xml:space="preserve")?>([\s\S]*?)<\/t><\/is><\/c>/g)].map((match)=>({reference:match[1],value:unescapeXml(match[2])}));

test('XLSX bundle has one ordered worksheet per selected report with complete relationships',()=>{
  const tables=Object.freeze([
    Object.freeze({title:'Site activity',columns:[{label:'User'},{label:'Activity at'}],rows:Object.freeze([Object.freeze(['Operator A','2026-09-15 17:00'])])}),
    Object.freeze({title:'Open breakdowns',columns:[{label:'Reference'},{label:'Remark'}],rows:[['REQ-1','Inspection']] }),
  ]);
  const files=storedFiles(buildXlsxReportBundleBuffer({title:'Sasti OB & reporting window',tables}));
  assert.deepEqual(sheetNames(files),['Site activity','Open breakdowns']);
  assert.match(files.get('docProps/core.xml'),/<dc:title>Sasti OB &amp; reporting window<\/dc:title>/);
  tables.forEach((table,index)=>{
    const number=index+1;
    assert.ok(files.get('[Content_Types].xml').includes(`PartName="/xl/worksheets/sheet${number}.xml"`));
    assert.ok(files.get('xl/_rels/workbook.xml.rels').includes(`Id="rId${number}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${number}.xml"`));
    const xml=files.get(`xl/worksheets/sheet${number}.xml`);
    // Title row, record-count row, heading row, then one row per record.
    assert.equal([...xml.matchAll(/<row r=/g)].length,table.rows.length+3);
    assert.match(xml,new RegExp(`<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">${table.rows.length} record${table.rows.length===1?'':'s'} · Generated `));
    const widths=[...xml.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)" customWidth="1"\/>/g)];
    assert.equal(widths.length,table.columns.length+1);
    widths.forEach((match)=>{assert.equal(match[1],match[2]);assert.ok(Number(match[3])>=12&&Number(match[3])<=48);});
  });
  assert.deepEqual(cells(files.get('xl/worksheets/sheet1.xml')).map((cell)=>cell.value).slice(2),['Sr. No.','User','Activity at','1','Operator A','5:00 PM 15-09-2026']);
  assert.equal(cells(files.get('xl/worksheets/sheet1.xml'))[0].value,'Site activity');
  assert.equal(tables[0].rows[0][1],'2026-09-15 17:00');
});

test('XLSX bundle retains empty selected tables and supplies a valid worksheet when none are selected',()=>{
  const files=storedFiles(buildXlsxReportBundleBuffer({tables:[
    {title:'Site activity',columns:[{label:'User'}],rows:[]},
    {title:'Empty optional report',columns:[{label:'Reference'}],rows:[]},
    {title:'No columns or rows'},
  ]}));
  assert.deepEqual(sheetNames(files),['Site activity','Empty optional report','No columns or rows']);
  assert.deepEqual(cells(files.get('xl/worksheets/sheet1.xml')).slice(2),[{reference:'A3',value:'Sr. No.'},{reference:'B3',value:'User'}]);
  assert.deepEqual(cells(files.get('xl/worksheets/sheet2.xml')).slice(2),[{reference:'A3',value:'Sr. No.'},{reference:'B3',value:'Reference'}]);
  assert.match(files.get('xl/worksheets/sheet3.xml'),/<row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">Sr\. No\.<\/t><\/is><\/c><\/row><\/sheetData>/);
  for(const options of [undefined,{title:'Empty',tables:[]}]){
    const empty=storedFiles(buildXlsxReportBundleBuffer(options));
    assert.deepEqual(sheetNames(empty),['Report']);
    assert.ok(empty.has('xl/worksheets/sheet1.xml'));
  }
});

test('XLSX sheet names are valid, case-insensitively unique, escaped and at most 31 characters',()=>{
  const long='Location wise opened breakdowns for Sasti OB';
  const titles=[long,long,long.toUpperCase(),'Case','case','Case (2)','A/B','A\\B','A:B','[]:*?/\\',"'Report'","'",'',undefined,'History','history','A'.repeat(30)+"'tail",'😀'.repeat(20),'😀'.repeat(20),'R&D <Ops> "one"',"O'Brien",'Bad\u0000name',"'  'Report'  '","A".repeat(28)+"'  end",'literal _x0001_'];
  const files=storedFiles(buildXlsxReportBundleBuffer({tables:titles.map((title,index)=>({title,columns:[{label:'Value'}],rows:[[String(index)]]}))}));
  const names=sheetNames(files);
  assert.equal(names.length,titles.length);
  assert.equal(new Set(names.map((name)=>name.toLowerCase())).size,names.length);
  names.forEach((name,index)=>{
    assert.ok(name.length>0&&name.length<=31,`invalid sheet name length: ${name}`);
    assert.doesNotMatch(name,/[\u0000-\u001f\\/?*:[\]]/);
    assert.doesNotMatch(name,/^'|'$/);
    assert.notEqual(name.toLowerCase(),'history');
    assert.ok(name.isWellFormed());
    assert.equal(cells(files.get(`xl/worksheets/sheet${index+1}.xml`)).at(-1).value,String(index));
  });
  assert.equal(names[0],long.slice(0,31));
  assert.match(names[1],/ \(2\)$/);
  assert.match(names[2],/ \(3\)$/);
  assert.ok(names.includes('R&D <Ops> "one"'));
  assert.ok(names.includes("O'Brien"));
});

test('XLSX keeps all long rows, Unicode, XML characters and whitespace without interpreting formulas',()=>{
  const long='Maintenance & inspection <complete> "quoted" \'notes\' → वाहन. '.repeat(160)+'FINAL_LONG_CELL';
  const rows=Array.from({length:5005},(_,index)=>[`ROW_${String(index).padStart(5,'0')}`,index===2500?long:`Remark ${index}`]);
  rows.push(['  leading\ntrailing  ','=SUM(A1:A2)'],['Control\u0001text\r\nnext','literal _x0001_'],[0,false]);
  const xml=storedFiles(buildXlsxReportBundleBuffer({tables:[{title:'Long rows',columns:[{label:'Reference & ID'},{label:'Remark <details>'}],rows}]})).get('xl/worksheets/sheet1.xml');
  assert.equal([...xml.matchAll(/<row r=/g)].length,rows.length+3);
  const values=cells(xml).map((cell)=>cell.value);
  assert.ok(values.includes(long));
  // Title, count and three heading cells precede the data; each data row holds Sr. No. plus two cells.
  for(let index=0;index<5005;index++)assert.equal(values[index*3+6],rows[index][0]);
  assert.ok(values.includes('  leading\ntrailing  '));
  assert.ok(values.includes('=SUM(A1:A2)'));
  assert.ok(values.includes('Control_x0001_text_x000D_\nnext'));
  assert.ok(values.includes('literal _x005F_x0001_'));
  assert.deepEqual(values.slice(-2),['0','false']);
  assert.doesNotMatch(xml,/<f>|\u0001/);
  assert.match(xml,/<t xml:space="preserve">Reference &amp; ID<\/t>/);
  assert.match(xml,/Remark &lt;details&gt;/);
  assert.match(xml,/&quot;quoted&quot; &apos;notes&apos;/);
  assert.match(xml,/width="48"/);
});

test('wide bundle worksheets use valid references beyond Z and legacy workbooks keep the Report tab',()=>{
  const columns=Array.from({length:28},(_,index)=>({label:`Field ${index}`})),rows=[columns.map((_,index)=>`VALUE_${index}`)];
  const bundle=storedFiles(buildXlsxReportBundleBuffer({tables:[{title:'Wide report',columns,rows}]}));
  assert.deepEqual(cells(bundle.get('xl/worksheets/sheet1.xml')).at(-1),{reference:'AC4',value:'VALUE_27'});
  const legacy=storedFiles(buildXlsxWorkbookBuffer('Legacy title',columns,rows));
  assert.deepEqual(sheetNames(legacy),['Report']);
  // Both workbooks share the heading and data rows; only the title row differs.
  assert.deepEqual(cells(legacy.get('xl/worksheets/sheet1.xml')).slice(2),cells(bundle.get('xl/worksheets/sheet1.xml')).slice(2));
  assert.doesNotMatch(legacy.get('xl/worksheets/sheet1.xml'),/xml:space/);
  const empty=storedFiles(buildXlsxWorkbookBuffer('Empty legacy',[{label:'Reference'}],[]));
  assert.deepEqual(cells(empty.get('xl/worksheets/sheet1.xml')).slice(2),[{reference:'A3',value:'Sr. No.'},{reference:'B3',value:'Reference'}]);
});
