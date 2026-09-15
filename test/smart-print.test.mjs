import assert from 'node:assert/strict';
import test from 'node:test';
import {printColumnOptions,selectedPrintColumns,nextPrintLayout,printLayoutStorageKey,openSmartPrint} from '../src/smart-print.mjs';
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
 const first=nextPrintLayout([], [options[0].id]);
 const second=nextPrintLayout(JSON.parse(JSON.stringify([first])),[options[1].id]);
 assert.equal(first.number,1);assert.equal(second.number,2);
 assert.equal(selectedPrintColumns(options,second.columns)[0],options[1].column);
 assert.notEqual(printLayoutStorageKey('one',options),printLayoutStorageKey('two',options));
 assert.throws(()=>nextPrintLayout([],[]),/Select at least/);
});
test('dialog saves and restores a layout and prints only its checked columns',()=>{
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
  const columns=[{label:'Door',value:r=>r.door},{label:'Secret',value:r=>r.secret}],rows=[{door:'24',secret:'hidden'}],printed=[];
  const config={title:'Report',columns,rows,onPrint:args=>printed.push(args)};
  openSmartPrint(config);
  let nodes=all(body.children.at(-1));
  const checks=nodes.filter(n=>n.tag==='input');
  checks[1].checked=false;checks[1].onchange();
  nodes.find(n=>n.textContent==='Save as new layout').onclick();
  nodes.find(n=>n.textContent==='Print selected columns').onclick();
  assert.deepEqual(printed[0].columns,[columns[0]]);
  assert.equal(printed[0].rows,rows);
  openSmartPrint(config);nodes=all(body.children.at(-1));
  const select=nodes.find(n=>n.tag==='select');select.value='1';select.onchange();
  assert.deepEqual(nodes.filter(n=>n.tag==='input').map(n=>n.checked),[true,false]);
  nodes.find(n=>n.textContent==='Print selected columns').onclick();
  assert.deepEqual(printed[1].columns,[columns[0]]);
 } finally {globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
