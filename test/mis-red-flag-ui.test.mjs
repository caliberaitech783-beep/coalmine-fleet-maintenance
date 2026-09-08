import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const componentSource=source.slice(source.indexOf('function MisRedFlagForm('),source.indexOf('function TripCardCell('))+'\n'+source.slice(source.indexOf('function MobileWorkflowTable('),source.indexOf('function RequestEditForm('));
const {code:compiled}=await transformWithOxc(componentSource,'mis-red-flag-components.jsx',{jsx:{runtime:'classic'},target:'es2022'});
const Null=()=>null;
const ExportMenu=()=>null, PrintButton=()=>null;
const children=(tree,predicate)=>{
  const result=[];
  function visit(node){
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!React.isValidElement(node))return;
    if(predicate(node))result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
};
const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
const find=(tree,type)=>children(tree,node=>node.type===type)[0];
const request={ref:'REQ-MIS-UI',status:'Closed',door:'D23',site:'Sasti OB',start:'2026-09-08 10:00:00'};

function harness(){
  const slots=[];
  let cursor=0;
  const state=initial=>{
    const index=cursor++;
    if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
    return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];
  };
  const scope={React:{...React,useId:()=> 'test-controls'},useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect:()=>{},
    Modal:({title,children})=>React.createElement('section',{},React.createElement('h1',{},title),children),
    ActionsTable:({children})=>React.createElement('table',{},children),
    FilterableHeader:({label})=>React.createElement('th',{},label),
    Status:({children})=>React.createElement('span',{},children),
    ExportMenu,PrintButton,TableParameterFilter:Null,MaintenanceRemarks:Null,MeterFileCell:Null,TripCardCell:Null,
    formatTwelveHourDateTime:value=>value||'—',firstTripTimestamp:row=>row.firstTripAt,
    matchesSmartSearch:()=>true,tableRowMatchesFilters:()=>true,tableFilterText:value=>String(value||''),
    sortCollator:new Intl.Collator(),useSortableRows:rows=>[rows,{},()=>{}],
    calculateBreakdownDaysFromStart:()=>1,requestAwaitingAcceptance:()=>false,requestAcceptedLate:()=>false,elapsedLabel:()=>'',
  };
  for(const icon of ['Flag','Menu','Search','ListFilter','MapPin','Pencil','Trash2','CheckCircle2','MessageCircle','ShieldCheck'])scope[icon]=Null;
  const components=new Function(...Object.keys(scope),`${compiled};return {MisRedFlagForm,MobileWorkflowTable};`)(...Object.values(scope));
  return {render(name,props){cursor=0;return components[name](props);}};
}

test('MIS red flag sits beside Verify and opens the exact eligible request',()=>{
  let selected,verified;
  const tree=harness().render('MobileWorkflowTable',{rows:[request],showActions:true,onVerify:row=>{verified=row;},onMisFlag:row=>{selected=row;}});
  const row=children(tree,node=>node.type==='tr'&&node.key===request.ref)[0];
  const buttons=children(row,node=>node.type==='button');
  assert.deepEqual(buttons.map(button=>text(button).trim()),['Verify','Red flag']);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.equal(verified,request);
  assert.equal(selected,request);
  for(const ineligible of [{...request,status:'Open'},{...request,status:'Idle'},{...request,verifiedAt:'2026-09-08 12:00:00'}]){
    const hidden=harness().render('MobileWorkflowTable',{rows:[ineligible],showActions:true,onMisFlag:()=>{}});
    assert.equal(children(hidden,node=>node.props.className==='mis-red-flag').length,0);
  }
});

test('verified rows retain a saved red flag view with immutable remark',async()=>{
  const flagged={...request,misFlaggedAt:'2026-09-08 11:00:00',misFlaggedBy:'MIS inspector',misFlagRemark:'Wrong trip-card reading',verifiedAt:'2026-09-08 12:00:00'};
  let selected,saves=0;
  const tree=harness().render('MobileWorkflowTable',{rows:[flagged],showActions:true,onMisFlag:row=>{selected=row;}});
  const button=children(tree,node=>node.props.className==='mis-red-flag')[0];
  assert.equal(text(button).trim(),'View red flag');
  button.props.onClick();
  assert.equal(selected,flagged);
  const view=harness().render('MisRedFlagForm',{request:selected,close:()=>{},onSave:()=>{saves++;}});
  assert.equal(find(view,'textarea').props.value,flagged.misFlagRemark);
  assert.equal(find(view,'textarea').props.readOnly,true);
  assert.equal(children(view,node=>node.type==='button'&&node.props.type==='submit').length,0);
  await find(view,'form').props.onSubmit({preventDefault(){}});
  assert.equal(saves,0);
});

test('MIS report displays and exports remark, actor, time and verification status as text',()=>{
  const flagged={...request,misFlaggedAt:'2026-09-08 11:01:02',misFlaggedBy:'MIS inspector',misFlagRemark:'<img src=x onerror=alert(1)> & wrong meter'};
  const tree=harness().render('MobileWorkflowTable',{rows:[flagged],showMisFlagData:true,exportTitle:'MIS Red Flag Report'});
  const exportProps=find(tree,ExportMenu).props;
  assert.equal(exportProps.title,'MIS Red Flag Report');
  assert.equal(exportProps.rows[0],flagged);
  const expected={misFlaggedAt:flagged.misFlaggedAt,misFlaggedBy:flagged.misFlaggedBy,misFlagRemark:flagged.misFlagRemark,misVerificationStatus:'Awaiting verification'};
  for(const [key,value] of Object.entries(expected))assert.equal(exportProps.columns.find(column=>column.key===key).value(flagged),value);
  assert.equal(exportProps.columns.find(column=>column.key==='misVerificationStatus').value({...flagged,verifiedAt:'2026-09-08 12:00:00'}),'Verified');
  const html=renderToStaticMarkup(tree);
  for(const label of ['MIS red flag raised','Flagged by','MIS remark','Verification status',flagged.misFlaggedAt,flagged.misFlaggedBy,'Awaiting verification'])assert.ok(html.includes(label),label);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; wrong meter'));
  assert.equal(html.includes('<img'),false);
});

test('MIS form rejects whitespace, trims saves and prevents concurrent submissions',async()=>{
  const app=harness();
  const payloads=[];
  let complete;
  const props={request,close:()=>{},onSave:payload=>{payloads.push(payload);return new Promise(resolve=>{complete=resolve;});}};
  let tree=app.render('MisRedFlagForm',props);
  find(tree,'textarea').props.onChange({target:{value:'   '}});
  tree=app.render('MisRedFlagForm',props);
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  tree=app.render('MisRedFlagForm',props);
  assert.equal(payloads.length,0);
  assert.ok(children(tree,node=>node.props.role==='alert').length);
  find(tree,'textarea').props.onChange({target:{value:'  Wrong meter reading  '}});
  tree=app.render('MisRedFlagForm',props);
  const submit=find(tree,'form').props.onSubmit;
  const pending=submit({preventDefault(){}});
  await submit({preventDefault(){}});
  assert.equal(payloads.length,1);
  assert.deepEqual(payloads[0],{remark:'Wrong meter reading'});
  tree=app.render('MisRedFlagForm',props);
  assert.equal(find(tree,'textarea').props.disabled,true);
  complete();
  await pending;
});

test('MIS form preserves entered remark on a server error and allows retry',async()=>{
  const app=harness();
  let closed=0,attempts=0;
  const props={request,close:()=>{closed++;},onSave:async()=>{attempts++;throw new Error('Connection interrupted');}};
  let tree=app.render('MisRedFlagForm',props);
  find(tree,'textarea').props.onChange({target:{value:'Keep this inspection remark'}});
  tree=app.render('MisRedFlagForm',props);
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  tree=app.render('MisRedFlagForm',props);
  assert.equal(find(tree,'textarea').props.value,'Keep this inspection remark');
  assert.equal(find(tree,'textarea').props.disabled,false);
  assert.equal(text(children(tree,node=>node.props.role==='alert')[0]),'Connection interrupted');
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  assert.equal(attempts,2);
  assert.equal(closed,0);
});
