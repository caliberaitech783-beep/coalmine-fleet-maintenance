import test from 'node:test';
import assert from 'node:assert/strict';
import {describePrintJob,showPrintPreview} from '../src/print-preview.mjs';

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};}
  append(...nodes){this.children.push(...nodes);}
  appendChild(node){this.children.push(node);}
  setAttribute(name,value){this[`attr_${name}`]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  showModal(){this.open=true;} close(){this.open=false;} remove(){this.removed=true;} focus(){this.focused=true;}
}
const all=(node)=>[node,...node.children.flatMap(all)];
const fakeDocument=()=>{const body=new Element('body');return {body,createElement:(tag)=>new Element(tag)};};
const pdf={size:1234};

test('the job is described in one line',()=>{
  assert.equal(describePrintJob({page:{name:'A3'},printOptions:{pages:'1-3,5',duplex:'long-edge',copies:2},printer:'iR C3326'}),'A3 · Pages 1-3,5 · Double-sided · long edge · 2 copies · iR C3326');
  assert.equal(describePrintJob({page:{name:'A4'},printOptions:{},printer:''}),'A4 · All pages · Single-sided · 1 copy · Default printer');
  assert.equal(describePrintJob(),'All pages · Single-sided · 1 copy · Default printer');
});

test('the preview shows the exact PDF and prints only when the user clicks Print',async()=>{
  const doc=fakeDocument();const revoked=[];
  const pending=showPrintPreview({pdf,title:'BD Balance',page:{name:'A3'},printOptions:{duplex:'short-edge',copies:1},printer:'iR C3326',doc,createUrl:()=>'blob:preview-1',revokeUrl:(url)=>revoked.push(url),canShowPdf:true});
  const dialog=doc.body.children[0];
  assert.equal(dialog.tag,'dialog');assert.equal(dialog.open,true);
  const nodes=all(dialog);
  const frame=nodes.find((node)=>node.tag==='iframe');
  assert.equal(frame.src,'blob:preview-1#toolbar=1&view=FitH','the same bytes that will be printed are shown');
  assert.equal(nodes.find((node)=>node.tag==='small').textContent,'A3 · All pages · Double-sided · short edge · 1 copy · iR C3326');
  assert.match(nodes.find((node)=>node.tag==='span').textContent,/Nothing is sent to the printer until you click Print/);
  nodes.find((node)=>node.tag==='button'&&node.textContent==='Print').onclick();
  assert.equal(await pending,true);
  assert.deepEqual([dialog.removed,revoked],[true,['blob:preview-1']],'closed and the preview URL released');
});

test('Cancel, the close button, Escape and closing the dialog all print nothing',async()=>{
  for(const way of ['cancel-button','close-button','escape','close-event']){
    const doc=fakeDocument();
    const pending=showPrintPreview({pdf,title:'Report',page:{name:'A4'},doc,createUrl:()=>'blob:x',revokeUrl:()=>{},canShowPdf:true});
    const dialog=doc.body.children[0],nodes=all(dialog);
    if(way==='cancel-button')nodes.find((node)=>node.tag==='button'&&node.textContent==='Cancel').onclick();
    if(way==='close-button')nodes.find((node)=>node.tag==='button'&&node.textContent==='×').onclick();
    if(way==='escape')dialog.listeners.cancel({preventDefault(){}});
    if(way==='close-event')dialog.listeners.close();
    assert.equal(await pending,false,way);
    assert.equal(dialog.removed,true,way);
  }
});

test('a device that cannot show PDFs inline still gets Print / Cancel and a link to the PDF',async()=>{
  const doc=fakeDocument();
  const pending=showPrintPreview({pdf,title:'Report',page:{name:'A4'},doc,createUrl:()=>'blob:y',revokeUrl:()=>{},canShowPdf:false});
  const nodes=all(doc.body.children[0]);
  assert.equal(nodes.some((node)=>node.tag==='iframe'),false);
  const link=nodes.find((node)=>node.tag==='a');
  assert.deepEqual([link.href,link.target,link.textContent],['blob:y','_blank','Open the PDF in a new tab']);
  nodes.find((node)=>node.tag==='button'&&node.textContent==='Print').onclick();
  assert.equal(await pending,true);
});
