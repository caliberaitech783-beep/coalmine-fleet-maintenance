import assert from 'node:assert/strict';
import test from 'node:test';
import {printColumnOptions,selectedPrintColumns,nextPrintLayout,normalizePrintLayoutName,printLayoutStorageKey,removePrintLayout,openSmartPrint,printFitScale,printPageSize,PRINT_PAGE_SIZES} from '../src/smart-print.mjs';
test('only chosen headings and values reach print in table order',()=>{
 const columns=[{label:'Door',value:r=>r.door},{label:'Private',value:()=>{throw Error('Excluded value read');}},{label:'Status',value:r=>r.status}];
 const options=printColumnOptions(columns);
 const selected=selectedPrintColumns(options,[options[2].id,options[0].id]);
 assert.deepEqual(selected.map(c=>c.label),['Door','Status']);
 assert.deepEqual(selected.map(c=>c.value({door:'24',status:'Open'})),['24','Open']);
 assert.deepEqual(selectedPrintColumns(options,[]),[]);
});
test('saved layouts are sequential, reusable and account scoped',()=>{
 const options=printColumnOptions([{label:'Door'},{label:'Door'}]);
 assert.notEqual(options[0].id,options[1].id);
 const first=nextPrintLayout([], [options[0].id],'Daily breakdown');
 const second=nextPrintLayout(JSON.parse(JSON.stringify([first])),[options[1].id],'Night shift');
 assert.equal(first.number,1);assert.equal(second.number,2);
 assert.equal(first.name,'Daily breakdown');assert.equal(second.name,'Night shift');
 assert.equal(selectedPrintColumns(options,second.columns)[0],options[1].column);
 assert.notEqual(printLayoutStorageKey('one',options),printLayoutStorageKey('two',options));
 assert.equal(normalizePrintLayoutName('  Daily   report  '),'Daily report');
 assert.throws(()=>nextPrintLayout([],[],'Empty'),/Select at least/);
 assert.throws(()=>nextPrintLayout([first],[options[1].id],'daily BREAKDOWN'),/already exists/);
 assert.throws(()=>normalizePrintLayoutName('   '),/Enter a report name/);
 assert.deepEqual(removePrintLayout([first,second],first.number),[second]);
 assert.throws(()=>removePrintLayout([first],99),/no longer exists/);
});
test('dialog prompts for a report name, restores it, prints it, and can delete it',()=>{
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.value='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){} addEventListener(){} showModal(){} close(){} remove(){}
 }
 const body=new Element('body'), data=new Map([['nerveCenterSession',JSON.stringify({login:'tester'})]]);
 const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={body,createElement:tag=>new Element(tag)};
 globalThis.window={localStorage:storage,sessionStorage:storage,prompt:()=> 'Operations summary',confirm:()=>true};
 const all=node=>[node,...node.children.flatMap(all)];
 try {
  const columns=[{label:'Door',value:r=>r.door},{label:'Secret',value:r=>r.secret}],rows=[{door:'24',secret:'hidden'}],printed=[];
  const config={title:'Report',columns,rows,onPrint:args=>printed.push(args)};
  openSmartPrint(config);
  let nodes=all(body.children.at(-1));
  const checks=nodes.filter(n=>n.tag==='input');
  checks[1].checked=false;checks[1].onchange();
  nodes.find(n=>n.textContent==='Save as new layout').onclick();
  nodes=all(body.children.at(-1));
  assert.equal(nodes.find(n=>n.textContent==='Operations summary').value,'1');
  assert.match(nodes.find(n=>n.tag==='p'&&String(n.textContent).includes('Operations summary')).textContent,/Print saved layout/);
  nodes.find(n=>n.textContent==='Print saved layout').onclick();
  // Print first asks for the page size; nothing prints until A4 or A3 is chosen.
  assert.equal(printed.length,0);
  nodes=all(body.children.at(-1));
  assert.deepEqual(nodes.filter(n=>n.tag==='button'&&/^A[34] · /.test(n.textContent)).map(n=>n.textContent.slice(0,2)),['A4','A3']);
  nodes.find(n=>String(n.textContent).startsWith('A3 · ')).onclick();
  assert.deepEqual(printed[0].columns,[columns[0]]);
  assert.equal(printed[0].rows,rows);
  assert.equal(printed[0].title,'Operations summary');
  assert.equal(printed[0].pageSize,'A3');
  openSmartPrint(config);nodes=all(body.children.at(-1));
  const select=nodes.find(n=>n.tag==='select');select.value='1';select.onchange();
  assert.deepEqual(nodes.filter(n=>n.tag==='input').map(n=>n.checked),[true,false]);
  nodes.find(n=>n.textContent==='Delete saved layout').onclick();
  assert.equal(JSON.parse(data.get([...data.keys()].find(key=>key.startsWith('bdms:smart-print:')))).length,0);
  assert.equal(select.children.some(n=>n.textContent==='Operations summary'),false);
  assert.equal(nodes.find(n=>n.textContent==='Delete saved layout').disabled,true);
 } finally {globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
test('exports carry the chosen columns, rows and page size, and the preview mirrors the output',async()=>{
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.value='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){} addEventListener(){} showModal(){} close(){} remove(){}
 }
 const body=new Element('body'), data=new Map([['nerveCenterSession',JSON.stringify({login:'tester'})]]);
 const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={body,createElement:tag=>new Element(tag)};
 globalThis.window={localStorage:storage,sessionStorage:storage};
 const all=node=>[node,...node.children.flatMap(all)];
 try {
  const columns=[{label:'Door',value:r=>r.door},{label:'Secret',value:r=>r.secret},{label:'Status',value:r=>r.status}];
  const rows=[{door:'24',secret:'hidden',status:'Open'},{door:'25',secret:'hidden',status:'Closed'}],exported=[];
  const highlightRow=row=>row.status==='Open';
  openSmartPrint({title:'Report',columns,rows,highlightRow,onPrint(){},onExport:args=>{exported.push(args);}});
  let nodes=all(body.children.at(-1));
  const checks=nodes.filter(n=>n.tag==='input');
  checks[1].checked=false;checks[1].onchange();
  nodes=all(body.children.at(-1));
  // The preview shows the automatic Sr. No. column, only the chosen columns in table order, and highlighted rows.
  assert.deepEqual(nodes.filter(n=>n.tag==='th').map(n=>n.textContent),['Sr. No.','Door','Status']);
  assert.deepEqual(nodes.filter(n=>n.tag==='td').map(n=>n.textContent),['1','24','Open','2','25','Closed']);
  assert.deepEqual(nodes.filter(n=>n.tag==='tr'&&n.className==='highlight-row').length,1);
  nodes.find(n=>n.textContent==='Export Excel').onclick();
  await new Promise(resolve=>setTimeout(resolve));
  assert.equal(exported[0].format,'xlsx');
  assert.deepEqual(exported[0].columns,[columns[0],columns[2]]);
  assert.equal(exported[0].rows,rows);
  assert.equal(exported[0].highlightRow,highlightRow);
  nodes.find(n=>n.textContent==='Export PDF').onclick();
  assert.equal(exported.length,1);
  all(body.children.at(-1)).find(n=>String(n.textContent).startsWith('A4 · ')).onclick();
  await new Promise(resolve=>setTimeout(resolve));
  assert.equal(exported[1].format,'pdf');assert.equal(exported[1].pageSize,'A4');
  assert.deepEqual(exported[1].columns,[columns[0],columns[2]]);
  assert.match(all(body.children.at(-1)).find(n=>n.className==='smart-print-notice').textContent,/PDF export downloaded with 2 columns and 2 records/);
 } finally {globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
test('wide reports are scaled down to the page and never enlarged',()=>{
 assert.equal(printFitScale(800,1032),1);
 assert.equal(printFitScale(2064,1032),.5);
 assert.equal(printFitScale(3096,1032),.333);
 assert.equal(printFitScale(100000,1032),.3);
 assert.equal(printFitScale(0,1032),1);
 assert.equal(printPageSize('a3').widthMm,420);
 assert.equal(printPageSize('unknown').name,'A4');
 assert.deepEqual(PRINT_PAGE_SIZES.map(page=>page.name),['A4','A3']);
});
