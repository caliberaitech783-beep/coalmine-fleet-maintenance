import assert from 'node:assert/strict';
import test from 'node:test';
import {printColumnOptions,selectedPrintColumns,nextPrintLayout,normalizePrintLayoutName,printLayoutStorageKey,removePrintLayout,openSmartPrint,printFitScale,printPageSize,PRINT_PAGE_SIZES,normalizePageRanges,normalizePrintOptions,loadPrintOptions,savePrintOptions,PRINT_DUPLEX_OPTIONS,DEFAULT_PRINT_OPTIONS} from '../src/smart-print.mjs';
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
  // Then the print options: pages, sides and copies. Nothing prints until "Print now".
  assert.equal(printed.length,0);
  nodes=all(body.children.at(-1));
  assert.deepEqual(nodes.filter(n=>n.tag==='legend').map(n=>n.textContent),['Printer','Pages','Sides','Copies']);
  assert.equal(nodes.find(n=>n.tag==='p'&&/Loading the printers|chosen in the print window/.test(n.textContent)).textContent,'The printer is chosen in the print window.','no printer source registered in this test');
  const radios=nodes.filter(n=>n.tag==='input'&&n.type==='radio');
  assert.deepEqual(radios.map(n=>n.checked),[true,false,true,false,false],'all pages and single-sided by default');
  radios[3].onchange();
  const copiesInput=nodes.find(n=>n.tag==='input'&&n.type==='number');copiesInput.value='2';copiesInput.oninput();
  const pagesInput=nodes.find(n=>n.tag==='input'&&n.type==='text');pagesInput.value='1-2, 4';pagesInput.oninput();
  nodes.find(n=>n.textContent==='Print now').onclick();
  assert.deepEqual(printed[0].printOptions,{pages:'1-2,4',duplex:'long-edge',copies:2},'no printer key when none was chosen');
  assert.deepEqual(JSON.parse(data.get('bdms:smart-print:options')),{duplex:'long-edge',copies:2},'sides and copies are remembered; pages are not');
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
  // A single Export button asks only for the format; exports never ask for a page size.
  assert.equal(nodes.filter(n=>n.tag==='button'&&/^Export/.test(n.textContent)).length,1);
  nodes.find(n=>n.textContent==='Export').onclick();
  assert.equal(exported.length,0);
  assert.deepEqual(all(body.children.at(-1)).filter(n=>n.tag==='button'&&['PDF','Excel (.xlsx)'].includes(n.textContent)).map(n=>n.textContent),['PDF','Excel (.xlsx)']);
  assert.equal(all(body.children.at(-1)).some(n=>/^A[34] · /.test(n.textContent)),false);
  all(body.children.at(-1)).find(n=>n.textContent==='Excel (.xlsx)').onclick();
  await new Promise(resolve=>setTimeout(resolve));
  assert.equal(exported[0].format,'xlsx');
  assert.deepEqual(exported[0].columns,[columns[0],columns[2]]);
  assert.equal(exported[0].rows,rows);
  assert.equal(exported[0].highlightRow,highlightRow);
  nodes.find(n=>n.textContent==='Export').onclick();
  assert.equal(exported.length,1);
  all(body.children.at(-1)).find(n=>n.textContent==='PDF').onclick();
  await new Promise(resolve=>setTimeout(resolve));
  assert.equal(exported[1].format,'pdf');assert.equal(exported[1].pageSize,undefined);
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

test('print options: page ranges are validated, sides and copies are normalised and remembered',()=>{
  assert.equal(normalizePageRanges(''),'');
  assert.equal(normalizePageRanges(' 1-3, 5 ,8-8 '),'1-3,5,8');
  for(const bad of ['a','0','3-1','1,,2','1-','-2'])assert.throws(()=>normalizePageRanges(bad),/pages|Page numbers/,bad);
  assert.deepEqual(normalizePrintOptions({}),DEFAULT_PRINT_OPTIONS);
  assert.deepEqual(normalizePrintOptions({pages:'2-3',duplex:'short-edge',copies:'150'}),{pages:'2-3',duplex:'short-edge',copies:99});
  assert.deepEqual(normalizePrintOptions({duplex:'sideways',copies:0}),DEFAULT_PRINT_OPTIONS);
  assert.deepEqual(PRINT_DUPLEX_OPTIONS.map(option=>option.value),['one-sided','long-edge','short-edge']);
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  assert.deepEqual(loadPrintOptions(storage),DEFAULT_PRINT_OPTIONS);
  savePrintOptions({pages:'1-2',duplex:'long-edge',copies:3},storage);
  assert.deepEqual(loadPrintOptions(storage),{pages:'',duplex:'long-edge',copies:3},'the page selection is never remembered');
  assert.deepEqual(loadPrintOptions({getItem(){throw new Error('blocked')}}),DEFAULT_PRINT_OPTIONS);
});

test('the printer list from the helper is offered, the last used printer is preselected, and the choice reaches print',async()=>{
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
 globalThis.window={localStorage:storage,sessionStorage:storage,prompt:()=>'x',confirm:()=>true};
 const all=node=>[node,...node.children.flatMap(all)];
 try {
  const printed=[];
  const onListPrinters=async()=>({printers:['OneNote (Desktop)','iR C3326','iR C3326 (Copy 1)'],defaultPrinter:'iR C3326',remembered:'iR C3326 (Copy 1)'});
  openSmartPrint({title:'Report',columns:[{label:'Door',value:r=>r.door}],rows:[{door:'1'}],onPrint:args=>printed.push(args),onListPrinters});
  let nodes=all(body.children.at(-1));
  nodes.find(n=>n.textContent==='Print current selection').onclick();
  nodes=all(body.children.at(-1));nodes.find(n=>String(n.textContent).startsWith('A4 · ')).onclick();
  await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));
  nodes=all(body.children.at(-1));
  const printerBox=nodes.find(n=>n.tag==='fieldset'&&n.children[0]?.textContent==='Printer');
  const select=printerBox.children.find(n=>n.tag==='select');
  assert.deepEqual(select.children.map(n=>n.textContent),['OneNote (Desktop)','iR C3326 (default)','iR C3326 (Copy 1)']);
  assert.equal(select.value,'iR C3326 (Copy 1)','the printer used last time is preselected over the default');
  select.value='iR C3326';select.onchange();
  nodes.find(n=>n.textContent==='Print now').onclick();
  assert.equal(printed[0].printOptions.printer,'iR C3326');
  assert.deepEqual(normalizePrintOptions({printer:'  iR   C3326 '}).printer,'iR C3326');
 } finally {globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
