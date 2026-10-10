import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePhotoForInput} from '../src/camera-upload.mjs';
function input(){
 const attrs=new Map([['accept','image/jpeg,application/pdf']]),listeners=new Map();
 return {files:[],getAttribute:n=>attrs.get(n)??null,setAttribute:(n,v)=>attrs.set(n,v),removeAttribute:n=>attrs.delete(n),
 addEventListener(n,h){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(h);},removeEventListener(n,h){listeners.get(n)?.delete(h);},
 emit(n){for(const h of [...(listeners.get(n)||[])])h();},click(){this.emit('click');this.clicked=true;this.opened=[this.getAttribute('accept'),this.getAttribute('capture')];}};
}
test('camera selection populates original required input and invokes the existing upload change flow',()=>{
  const file={name:'camera.jpg',type:'image/jpeg',size:123};
  const events=[];
  const target=input();
  target.addEventListener('change',()=>events.push('change'));
  capturePhotoForInput(target);
  assert.deepEqual(target.opened,['image/*','environment']);
  assert.equal(target.clicked,true);
  target.files=[file];target.emit('change');
  assert.deepEqual(target.files,[file]);
  assert.equal(events[0],'change');
  assert.equal(target.getAttribute('capture'),null);
  assert.match(target.getAttribute('accept'),/pdf/);
  capturePhotoForInput(target);target.emit('cancel');
  assert.deepEqual(target.files,[file]);
  assert.equal(events.length,1);
});
test('camera fallback reports picker failure and respects disabled fields',()=>{
  let message;
  const target=input();target.disabled=true;
  capturePhotoForInput(target);assert.equal(target.clicked,undefined);
  target.disabled=false;target.click=()=>{throw Error('blocked');};
  capturePhotoForInput(target,{notify:value=>message=value});
  assert.match(message,/Choose file/);
  assert.equal(target.getAttribute('capture'),null);
});

test('repeated capture and subsequent Choose file restore original attributes',()=>{
 const target=input();capturePhotoForInput(target);capturePhotoForInput(target);target.emit('click');
 assert.equal(target.getAttribute('capture'),null);assert.match(target.getAttribute('accept'),/pdf/);
});
