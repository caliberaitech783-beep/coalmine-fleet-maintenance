import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EDGE_INSPECTED_BODY_LIMIT_BYTES,JSON_BODY_CONTENT_TYPES,LARGE_JSON_BODY_THRESHOLD_BYTES,LARGE_JSON_CONTENT_TYPE,edgeSafeJsonInit,largeJsonBody} from '../request-body-transport.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('large JSON bodies are re-sent as text/plain so the edge firewall does not size-reject them',()=>{
  assert.ok(LARGE_JSON_BODY_THRESHOLD_BYTES<EDGE_INSPECTED_BODY_LIMIT_BYTES);
  const small=JSON.stringify({complaint:'x'});
  const large=JSON.stringify({openingMeterFile:'data:image/jpeg;base64,'+'A'.repeat(LARGE_JSON_BODY_THRESHOLD_BYTES)});
  assert.equal(largeJsonBody(small),false);
  assert.equal(largeJsonBody(large),true);
  const init={method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer t'},body:large};
  const rewritten=edgeSafeJsonInit(init);
  assert.equal(rewritten.headers['Content-Type'],LARGE_JSON_CONTENT_TYPE);
  assert.equal(rewritten.headers.Authorization,'Bearer t');
  assert.equal(rewritten.body,large);
  assert.equal(init.headers['Content-Type'],'application/json','the original init must not be mutated');
  const viaHeaders=edgeSafeJsonInit({headers:new Headers({'content-type':'application/json'}),body:large});
  assert.equal(viaHeaders.headers.get('content-type'),LARGE_JSON_CONTENT_TYPE);
});

test('small or non-JSON bodies are left untouched',()=>{
  const small={headers:{'Content-Type':'application/json'},body:JSON.stringify({complaint:'x'})};
  assert.equal(edgeSafeJsonInit(small),small);
  const csv={headers:{'Content-Type':'text/csv'},body:'a'.repeat(LARGE_JSON_BODY_THRESHOLD_BYTES+1)};
  assert.equal(edgeSafeJsonInit(csv),csv);
  const noBody={method:'DELETE',headers:{Authorization:'Bearer t'}};
  assert.equal(edgeSafeJsonInit(noBody),noBody);
});

test('the server parses text/plain bodies as JSON and the UI routes API calls through the transport helper',()=>{
  assert.deepEqual(JSON_BODY_CONTENT_TYPES,['application/json','text/plain']);
  assert.match(server,/express\.json\(\{limit:'20mb',type:JSON_BODY_CONTENT_TYPES\}\)/);
  assert.match(ui,/requestInit = edgeSafeJsonInit\(requestInit\)/);
});

test('the request edit form sends only the fields the edit route reads',()=>{
  const start=ui.indexOf('function RequestEditForm(');
  const form=ui.slice(start,ui.indexOf('\nfunction ',start+1));
  assert.ok(!form.includes('onSave({...request'),'the edit payload must not spread the whole request row (complaint audio and other large fields)');
  assert.match(form,/onSave\(\{ref: request\.ref, equipment:/);
});
