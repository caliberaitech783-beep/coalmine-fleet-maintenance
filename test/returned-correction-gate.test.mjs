import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {renderToStaticMarkup} from 'react-dom/server';
import * as policy from '../request-correction-policy.mjs';
import * as icons from 'lucide-react';

const source=readFileSync(new URL('../src/returned-correction-gate.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace('export default function','function'),'gate.jsx',{jsx:{runtime:'classic'}});
test('returned correction popup blocks Escape and has no close or timeout action',()=>{
  const effects=[];
  const state={records:[{id:7,canManage:true,canDelete:true}],fieldOptions:{},error:''};
  const bindings={React,useState:()=>[state,()=>{}],useEffect:effect=>effects.push(effect),useRef:value=>({current:value}),createPortal:node=>node,CorrectionCard:()=>null,document:{body:{}}};
  const Gate=new Function(...Object.keys(bindings),code+';return ReturnedCorrectionGate;')(...Object.values(bindings));
  const tree=Gate({token:'fixture'});
  assert.equal(tree.type,'dialog');
  let prevented=false;
  tree.props.onCancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(tree.props.onClose,undefined);
  assert.equal(tree.props.onClick,undefined);
  assert.doesNotMatch(source.slice(source.indexOf('export default function ReturnedCorrectionGate')),/setTimeout|onClose=|close=|onClick=.*close/);
  assert.match(source,/element.showModal\(\)/);
  state.records=[];
  assert.equal(Gate({token:'fixture'}),null);
});
test('gate is mounted for both workspaces and fetches owner-only durable records',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.equal((main.match(/<ReturnedCorrectionGate key=\{authToken\} token=\{authToken\} \/>/g)||[]).length,2);
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const route=server.slice(server.indexOf("app.get('/api/request-corrections/returned'"),server.indexOf("app.patch('/api/request-corrections/:id/admin-decision'"));
  assert.match(route,/requireSession/);
  assert.match(route,/lower\(trim\(requested_by_login\)\)=\$1 AND status=\$2/);
  assert.match(route,/REQUEST_CORRECTION_STATUS.RETURNED/);
  assert.match(source,/\[token\]/);
  assert.match(source,/if\(active\)setState\(current=>\(\{\.\.\.current,error:error.message\}\)\)/);
});

test('Admin sees Revert only for an application error and Reject only while approved',async()=>{
  const source=readFileSync(new URL('../src/request-corrections.jsx',import.meta.url),'utf8');
  const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replaceAll('export default function','function').replaceAll('export function','function'),'corrections.jsx',{jsx:{runtime:'classic'}});
  const bindings={React,useState:React.useState,...policy,...Object.fromEntries(Object.entries(icons).filter(([key])=>key!=='default' && /^[A-Za-z_$][\w$]*$/.test(key))),RequestTimelineButton:()=>null};
  const Card=new Function(...Object.keys(bindings),code+';return CorrectionCard;')(...Object.values(bindings));
  const record={id:7,status:policy.REQUEST_CORRECTION_STATUS.APPROVED,correctionType:'maintenance',originalValues:{},proposedChanges:{},requestedByName:'Original Requester'};
  const render=(changes={},capabilities={canApply:true})=>renderToStaticMarkup(React.createElement(Card,{record:{...record,...changes},capabilities,token:'fixture',onChanged:async()=>{}}));
  assert.doesNotMatch(render(),/Revert error to/);
  assert.match(render(),/Reject approved correction/);
  assert.match(render({applyError:'Invalid closure'}),/Revert error to Original Requester/);
  assert.doesNotMatch(render({applyError:'Invalid closure'},{}),/Revert error to|Reject approved correction/);
  assert.doesNotMatch(render({status:policy.REQUEST_CORRECTION_STATUS.APPLIED,applyError:'Old error'}),/Revert error to|Reject approved correction/);
});
