import test from 'node:test';
import assert from 'node:assert/strict';
import {beginDownload,runDownloadNotice} from '../src/download-notice.mjs';

function fakeDocument(){
  class Element{
    constructor(){this.style={};this.children=[];this.attributes={};}
    setAttribute(k,v){this.attributes[k]=v;}
    append(...nodes){this.children.push(...nodes);}
    remove(){this.removed=true;}
    showPopover(){this.shown=true;}
  }
  return {body:new Element(),createElement:()=>new Element()};
}
test('download notifications announce preparation, success, failure and cancellation above dialogs',()=>{
  const doc=fakeDocument(),notice=beginDownload('Excel',doc),host=doc.body.children[0];
  assert.equal(host.shown,true);assert.equal(host.attributes.role,'status');
  assert.match(host.children[0].textContent,/Preparing Excel/);
  notice.success();assert.match(host.children[0].textContent,/download started/);
  host.children[1].onclick();assert.equal(host.removed,true);
  const failed=beginDownload('PDF',doc);failed.error(new Error('Network unavailable'));
  assert.match(doc.body.children[1].children[0].textContent,/Network unavailable/);
  doc.body.children[1].children[1].onclick();
  const cancelled=beginDownload('Backup',doc);cancelled.error({name:'AbortError'});
  assert.equal(doc.body.children[2].children[0].textContent,'Download cancelled.');
  doc.body.children[2].children[1].onclick();
});
test('wrapper yields before work, keeps task result, and reports thrown errors',async()=>{
  const original=globalThis.document;globalThis.document=fakeDocument();
  try{
    let ran=false;
    const job=runDownloadNotice('CSV',()=>{ran=true;return 42;});
    assert.equal(ran,false);assert.equal(await job,42);
    await runDownloadNotice('CSV',()=>{throw Error('Could not generate');});
    assert.match(document.body.children[1].children[0].textContent,/Could not generate/);
    document.body.children.forEach(host=>host.children[1].onclick());
  }finally{globalThis.document=original;}
});
