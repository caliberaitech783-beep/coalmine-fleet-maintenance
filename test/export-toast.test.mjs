import assert from 'node:assert/strict';
import test from 'node:test';
import {openSmartPrint} from '../src/smart-print.mjs';

test('PDF toast announces preparation, download handoff and errors without changing rows',async()=>{
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.attributes={};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(){} showModal(){} close(){} remove(){}
  }
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  const body=new Element('body'),storage={getItem:()=>null,setItem(){}};
  globalThis.document={body,createElement:tag=>new Element(tag)};
  globalThis.window={localStorage:storage,sessionStorage:storage};
  const all=node=>[node,...node.children.flatMap(all)];
  let resolve,reject,calls=0;
  try{
    const rows=[{door:'Sasti-1'}];
    openSmartPrint({title:'BD Balance',columns:[{label:'Door',value:r=>r.door}],rows,exportFormat:'pdf',exportOnly:true,
      onExport:args=>{calls++;assert.equal(args.rows,rows);return new Promise((yes,no)=>{resolve=yes;reject=no;});}});
    const nodes=all(body),download=nodes.find(n=>n.textContent==='Download PDF');
    const toast=nodes.find(n=>n.className==='smart-print-export-toast');
    assert.ok(nodes.find(n=>n.tag==='footer').children.includes(toast),'Toast stays inside the visible export footer');
    assert.equal(toast.hidden,true);
    download.onclick();
    assert.equal(toast.hidden,false);
    assert.equal(toast.attributes.role,'status');
    assert.match(toast.children[0].textContent,/Preparing PDF/);
    download.onclick();
    assert.equal(calls,0,'Allow preparation notification to paint before export starts');
    await new Promise(r=>setTimeout(r,70));
    assert.equal(calls,1);
    resolve();await new Promise(r=>setTimeout(r,0));
    assert.match(toast.children[0].textContent,/PDF download started/);
    assert.match(toast.className,/success/);
    download.onclick();await new Promise(r=>setTimeout(r,70));
    reject(new Error('Export failed'));await new Promise(r=>setTimeout(r,0));
    assert.match(toast.className,/error/);
    assert.equal(toast.children[0].textContent,'Export failed');
    toast.children[1].onclick();assert.equal(toast.hidden,true);
    nodes.find(n=>n.textContent==='Cancel').onclick();
  }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
