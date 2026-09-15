import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePhotoForInput} from '../src/camera-upload.mjs';
test('camera selection populates original required input and invokes the existing upload change flow',()=>{
  const file={name:'camera.jpg',type:'image/jpeg',size:123};
  const events=[];
  const target={dispatchEvent:event=>events.push(event)};
  let picker;
  capturePhotoForInput(target,{document:{createElement(){picker={setAttribute(key,value){this[key]=value;},click(){this.clicked=true;}};return picker;}},DataTransfer:class{files=[];items={add:file=>this.files.push(file)};},Event:class{constructor(type,options){this.type=type;Object.assign(this,options);}}});
  assert.equal(picker.capture,'environment');
  assert.equal(picker.clicked,true);
  assert.equal(picker.accept,'image/jpeg,image/png,image/webp');
  picker.files=[file];picker.onchange();
  assert.deepEqual(target.files,[file]);
  assert.equal(events[0].type,'change');
  assert.equal(events[0].bubbles,true);
  picker.files=[];picker.onchange();
  assert.deepEqual(target.files,[file]);
  assert.equal(events.length,1);
});
test('camera fallback reports unsupported file transfer and respects disabled fields',()=>{
  let picker,message;
  const document={createElement(){return picker={setAttribute(){},click(){}};}};
  capturePhotoForInput({disabled:true},{document});
  assert.equal(picker,undefined);
  capturePhotoForInput({},{document,DataTransfer:class{constructor(){throw Error('unsupported');}},notify:value=>message=value});
  picker.files=[{}];picker.onchange();
  assert.match(message,/Choose file/);
});
