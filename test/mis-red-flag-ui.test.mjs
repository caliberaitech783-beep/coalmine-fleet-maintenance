import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import * as requestAcceptance from '../request-acceptance.mjs';
import * as equipment from '../request-equipment.mjs';
import {normalizeEquipmentGroup} from '../equipment-group.mjs';
import {requestsVisibleToMisWorkspace} from '../mis-request-visibility.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const componentSource=source.slice(source.indexOf('function RequestRedFlagForm('),source.indexOf('function TripCardCell('))+'\n'+source.slice(source.indexOf('function MobileWorkflowTable('),source.indexOf('function RequestEditForm('))+'\n'+source.slice(source.indexOf('function Normal('),source.indexOf('function App('));
const {code:compiled}=await transformWithOxc(componentSource,'mis-red-flag-components.jsx',{jsx:{runtime:'classic'},target:'es2022'});
const {code:compiledEditor}=await transformWithOxc(source.slice(source.indexOf('function MeterReadingFields('),source.indexOf('function CloseRequestForm(')),'arrival-edit-component.jsx',{jsx:{runtime:'classic'},target:'es2022'});
const {code:compiledModal}=await transformWithOxc(source.slice(source.indexOf('function Modal('),source.indexOf('function requestStartParts(')),'workflow-modal.jsx',{jsx:{runtime:'classic'},target:'es2022'});
const Null=()=>null;
const ExportMenu=()=>null, PrintButton=()=>null;
const RequestEditForm=()=>null, DailyRemarkForm=()=>null, CloseRequestForm=()=>null, VerifyRequestForm=()=>null;
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
    ...equipment,
    Modal:({title,children})=>React.createElement('section',{},React.createElement('h1',{},title),children),
    ActionsTable:({children})=>React.createElement('table',{},children),
    FilterableHeader:({label})=>React.createElement('th',{},label),
    Status:({children})=>React.createElement('span',{},children),
    ExportMenu,PrintButton,TableParameterFilter:Null,MaintenanceRemarks:Null,MeterFileCell:Null,TripCardCell:Null,MaintenanceEtcInput:Null,
    formatTwelveHourDateTime:value=>value||'—',firstTripTimestamp:row=>row.firstTripAt,
    matchesSmartSearch:()=>true,tableRowMatchesFilters:()=>true,tableFilterText:value=>String(value||''),
    sortCollator:new Intl.Collator(),useSortableRows:rows=>[rows,{},()=>{}],
    calculateBreakdownDaysFromStart:()=>1,...requestAcceptance,normalizeEquipmentGroup,elapsedLabel:()=>'',
    RequestEditForm,DailyRemarkForm,CloseRequestForm,VerifyRequestForm,RequestTimelineButton:({reference})=>React.createElement('b',{},reference),authToken:'fixture',alert:()=>{},
    requestStartParts:start=>({date:String(start).slice(0,10),time:String(start).slice(11)}),
    requestMeterTypeForRequest:()=> 'HMR',indiaDateTimeInputValue:()=> '2026-09-08T10:59:00',TIME_24H_PATTERN:'.*',
    FormData:class{constructor(values){this.values=values;}get(name){return this.values[name];}},readMeterEvidence:async file=>file.evidence,
    window:{matchMedia:()=>({matches:false})},useMasterRecords:()=>[[],null,true],vehicles:[],MIS_VERIFICATION_MENU:'MIS verification',
    recordsForSite:rows=>rows,requestWithEquipmentMasterDetails:row=>row,visibleInOperationalUserRequests:()=>true,requestsVisibleToMisWorkspace,
    visibleInMisRequests:()=>true,visibleInMisHistory:()=>true,visibleInProductionHistory:()=>true,visibleInMaintenanceHistory:()=>true,preventTableAutoScroll:()=>{},
  };
  for(const icon of ['Flag','Menu','Search','ListFilter','MapPin','Pencil','Trash2','CheckCircle2','MessageCircle','ShieldCheck','Wrench','Plus','ChevronRight'])scope[icon]=Null;
  const components=new Function(...Object.keys(scope),`${compiled};return {RequestRedFlagForm,MobileWorkflowTable,Normal};`)(...Object.values(scope));
  components.ActualRequestEditForm=new Function(...Object.keys(scope),`${compiledEditor};return RequestEditForm;`)(...Object.values(scope));
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
  const view=harness().render('RequestRedFlagForm',{request:selected,close:()=>{},onSave:()=>{saves++;}});
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
  let tree=app.render('RequestRedFlagForm',props);
  find(tree,'textarea').props.onChange({target:{value:'   '}});
  tree=app.render('RequestRedFlagForm',props);
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  tree=app.render('RequestRedFlagForm',props);
  assert.equal(payloads.length,0);
  assert.ok(children(tree,node=>node.props.role==='alert').length);
  find(tree,'textarea').props.onChange({target:{value:'  Wrong meter reading  '}});
  tree=app.render('RequestRedFlagForm',props);
  const submit=find(tree,'form').props.onSubmit;
  const pending=submit({preventDefault(){}});
  await submit({preventDefault(){}});
  assert.equal(payloads.length,1);
  assert.deepEqual(payloads[0],{remark:'Wrong meter reading'});
  tree=app.render('RequestRedFlagForm',props);
  assert.equal(find(tree,'textarea').props.disabled,true);
  complete();
  await pending;
});

test('MIS form preserves entered remark on a server error and allows retry',async()=>{
  const app=harness();
  let closed=0,attempts=0;
  const props={request,close:()=>{closed++;},onSave:async()=>{attempts++;throw new Error('Connection interrupted');}};
  let tree=app.render('RequestRedFlagForm',props);
  find(tree,'textarea').props.onChange({target:{value:'Keep this inspection remark'}});
  tree=app.render('RequestRedFlagForm',props);
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  tree=app.render('RequestRedFlagForm',props);
  assert.equal(find(tree,'textarea').props.value,'Keep this inspection remark');
  assert.equal(find(tree,'textarea').props.disabled,false);
  assert.equal(text(children(tree,node=>node.props.role==='alert')[0]),'Connection interrupted');
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  assert.equal(attempts,2);
  assert.equal(closed,0);
});

test('maintenance red flag opens a required remark form and saved flags show their original reason',async()=>{
  const arrival={...request,status:'Open',acceptanceRequired:true};
  let selected;
  const tree=harness().render('MobileWorkflowTable',{rows:[arrival],showActions:true,onFlagArrival:row=>{selected=row;},onEdit:()=>{}});
  const buttons=children(children(tree,node=>node.type==='tr'&&node.key===arrival.ref)[0],node=>node.type==='button');
  assert.deepEqual(buttons.map(button=>text(button).trim()),['Red flag','Edit']);
  buttons[0].props.onClick();
  assert.equal(selected,arrival);
  const app=harness(),payloads=[];
  const props={flagKind:'arrival',request:selected,close:()=>{},onSave:payload=>payloads.push(payload)};
  let form=app.render('RequestRedFlagForm',props);
  assert.equal(find(form,'textarea').props.required,true);
  await find(form,'form').props.onSubmit({preventDefault(){}});
  assert.equal(payloads.length,0);
  find(form,'textarea').props.onChange({target:{value:'  Waiting for recovery vehicle  '}});
  form=app.render('RequestRedFlagForm',props);
  await find(form,'form').props.onSubmit({preventDefault(){}});
  assert.deepEqual(payloads,[{remark:'Waiting for recovery vehicle'}]);
  assert.ok(text(form).includes('Vehicle Arrival Red Flag Report'));
  for(const remark of ['Waiting for recovery vehicle','', '   ']){
    const saved={...arrival,arrivalFlaggedAt:'2026-09-08 11:00:00',arrivalFlaggedBy:'Maintenance inspector',arrivalFlagRemark:remark};
    const view=harness().render('RequestRedFlagForm',{...props,request:saved});
    assert.equal(find(view,'textarea').props.value,remark);
    assert.equal(find(view,'textarea').props.readOnly,Boolean(remark.trim()));
    assert.equal(children(view,node=>node.type==='button'&&node.props.type==='submit').length,remark.trim()?0:1);
  }
});

test('workspaces open their remark dialog and no longer offer red flag report tabs',async()=>{
  for(const role of ['Maintenance User','MIS User']){
    const app=harness(),saves=[];
    const row={...request,status:role==='MIS User'?'Closed':'Open',acceptanceRequired:true};
    const props={embedded:true,requests:[row],session:{assignedRole:role,location:'Sasti OB',permissions:{verifyRequests:true,editRequests:true}},onUpdateRequest:async(...args)=>{saves.push(args);return {...row,arrivalFlaggedAt:'2026-09-08 11:00:00',arrivalFlagRemark:args[1].remark};}};
    let tree=app.render('Normal',props);
    const tabs=children(tree,node=>node.props.role==='tablist')[0];
    assert.ok(tabs);
    assert.equal(text(tabs).includes('Red Flag Report'),false);
    const table=children(tree,node=>node.type?.name==='MobileWorkflowTable')[0];
    assert.ok(table);
    (role==='MIS User'?table.props.onMisFlag:table.props.onFlagArrival)(row);
    tree=app.render('Normal',props);
    const dialog=children(tree,node=>node.type?.name==='RequestRedFlagForm')[0];
    assert.equal(dialog.props.request,row);
    assert.equal(dialog.props.flagKind||'mis',role==='MIS User'?'mis':'arrival');
    await dialog.props.onSave({remark:'Record this reason'});
    assert.deepEqual(saves,[[row.ref,{remark:'Record this reason'},role==='MIS User'?'mis-flag':'arrival-flag']]);
  }
});

test('accepted-late vehicles retain the flag action and legacy blank flags request a reason',()=>{
  const late={...request,status:'Open',acceptedAt:'2026-09-08 11:01:00',acceptanceRequired:true};
  for(const row of [late,{...late,arrivalFlaggedAt:'2026-09-08 11:02:00',arrivalFlagRemark:'   '}]){
    let selected;
    const tree=harness().render('MobileWorkflowTable',{rows:[row],showActions:true,onFlagArrival:value=>{selected=value;},onEdit:()=>{}});
    const action=children(tree,node=>node.props.className==='arrival-red-flag')[0];
    assert.ok(action);
    assert.equal(text(action).trim(),'Red flag');
    action.props.onClick();
    assert.equal(selected,row);
    assert.equal(children(tree,node=>node.props.className==='arrival-flagged').length,0);
  }
  const complete={...late,arrivalFlaggedAt:'2026-09-08 11:02:00',arrivalFlagRemark:'Recovery vehicle was delayed'};
  const tree=harness().render('MobileWorkflowTable',{rows:[complete],showActions:true,onFlagArrival:()=>{}});
  assert.equal(text(children(tree,node=>node.props.className==='arrival-flagged')[0]).trim(),'View red flag');
  assert.equal(children(tree,node=>node.props.className==='arrival-red-flag').length,0);
});

test('maintenance Edit, Daily update and Close require the arrival reason and resume only after saving',async()=>{
  const row={...request,status:'Open',acceptanceRequired:true,acceptedAt:'2026-09-08 11:01:00'};
  for(const [callback,formType] of [['onEdit',RequestEditForm],['onRemark',DailyRemarkForm],['onClose',CloseRequestForm]]){
    const app=harness(),saves=[];
    const props={embedded:true,requests:[row],session:{assignedRole:'Maintenance User',location:'Sasti OB',permissions:{editRequests:true,closeRequests:true}},onUpdateRequest:async(...args)=>{saves.push(args);return {...row,arrivalFlaggedAt:'2026-09-08 12:00:00',arrivalFlagRemark:args[1].remark};}};
    let tree=app.render('Normal',props);
    if(callback==='onClose'){
      children(tree,node=>node.type==='button'&&text(node)==='Close request form')[0].props.onClick();
      tree=app.render('Normal',props);
    }
    const table=children(tree,node=>node.type?.name==='MobileWorkflowTable')[0];
    table.props[callback](row);
    tree=app.render('Normal',props);
    assert.equal(find(tree,formType),undefined);
    const flag=children(tree,node=>node.type?.name==='RequestRedFlagForm')[0];
    assert.ok(flag,callback);
    assert.equal(flag.props.request.ref,row.ref);
    await flag.props.onSave({remark:'Road blocked by recovery work'});
    tree=app.render('Normal',props);
    assert.ok(find(tree,formType),`${callback} resumes its form after saving`);
    assert.equal(children(tree,node=>node.type?.name==='RequestRedFlagForm').length,0);
    assert.deepEqual(saves,[[row.ref,{remark:'Road blocked by recovery work'},'arrival-flag']]);
  }
});

test('an arrival save failure retains the flag dialog and intended action for retry',async()=>{
  const row={...request,status:'Open',acceptanceRequired:true,acceptedAt:'2026-09-08 11:01:00'};
  const app=harness();
  let attempts=0;
  const props={embedded:true,requests:[row],session:{assignedRole:'Maintenance User',location:'Sasti OB',permissions:{editRequests:true}},onUpdateRequest:async(_ref,payload)=>{if(++attempts===1)throw new Error('Connection interrupted');return {...row,arrivalFlaggedAt:'2026-09-08 12:00:00',arrivalFlagRemark:payload.remark};}};
  let tree=app.render('Normal',props);
  children(tree,node=>node.type?.name==='MobileWorkflowTable')[0].props.onEdit(row);
  tree=app.render('Normal',props);
  let flag=children(tree,node=>node.type?.name==='RequestRedFlagForm')[0];
  await assert.rejects(flag.props.onSave({remark:'Recovery in progress'}),/Connection interrupted/);
  tree=app.render('Normal',props);
  assert.equal(find(tree,RequestEditForm),undefined);
  flag=children(tree,node=>node.type?.name==='RequestRedFlagForm')[0];
  assert.ok(flag);
  await flag.props.onSave({remark:'Recovery in progress'});
  tree=app.render('Normal',props);
  assert.ok(find(tree,RequestEditForm));
  assert.equal(attempts,2);
});

test('a server arrival-reason gate keeps the existing edit form mounted beneath the flag dialog',async()=>{
  const row={...request,status:'Open',acceptanceRequired:true,acceptedAt:'2026-09-08 10:30:00'};
  const app=harness();
  const props={embedded:true,requests:[row],session:{assignedRole:'Maintenance User',location:'Sasti OB',permissions:{editRequests:true}},onUpdateRequest:async()=>{const error=new Error('Arrival reason is required');error.code='ARRIVAL_RED_FLAG_REQUIRED';throw error;}};
  let tree=app.render('Normal',props);
  children(tree,node=>node.type?.name==='MobileWorkflowTable')[0].props.onEdit(row);
  tree=app.render('Normal',props);
  const existing=find(tree,RequestEditForm);
  assert.ok(existing);
  await existing.props.onSave({ref:row.ref,complaint:'Draft correction retained'});
  tree=app.render('Normal',props);
  assert.ok(find(tree,RequestEditForm));
  const flag=children(tree,node=>node.type?.name==='RequestRedFlagForm')[0];
  assert.ok(flag);
  flag.props.close();
  tree=app.render('Normal',props);
  assert.ok(find(tree,RequestEditForm));
  assert.equal(find(tree,RequestEditForm).key,existing.key);
  assert.equal(find(tree,RequestEditForm).props.request.ref,existing.props.request.ref);
  assert.equal(children(tree,node=>node.type?.name==='RequestRedFlagForm').length,0);
});

test('crossing one hour while editing blocks acceptance and retains draft fields and evidence for retry',async(t)=>{
  let now=new Date('2026-09-08T10:59:00+05:30').getTime();
  t.mock.method(Date,'now',()=>now);
  const row={...request,status:'Open',acceptanceRequired:true};
  const app=harness(),saves=[],flags=[];
  const props={request:row,close:()=>{},onSave:payload=>saves.push(payload),onRequireArrivalFlag:value=>flags.push(value)};
  assert.equal(requestAcceptance.arrivalRedFlagRequired(row),false);
  let tree=app.render('ActualRequestEditForm',props);
  children(tree,node=>node.type==='input'&&node.props.name==='openingMeterFile')[0].props.onChange({target:{files:[{name:'meter.jpg',size:10,evidence:'saved-evidence'}]}});
  tree=app.render('ActualRequestEditForm',props);
  const formValues={category:'Breakdown',complaint:'Draft repair details',expectedCompletionAt:'2026-09-09T12:00',openingMeterReading:'42'};
  now+=2*60*1000;
  await find(tree,'form').props.onSubmit({preventDefault(){},currentTarget:formValues});
  assert.equal(saves.length,0);
  assert.deepEqual(flags,[row]);
  const saved={...row,arrivalFlaggedAt:'2026-09-08 11:01:00',arrivalFlagRemark:'Recovery crew delayed'};
  tree=app.render('ActualRequestEditForm',{...props,request:saved});
  await find(tree,'form').props.onSubmit({preventDefault(){},currentTarget:formValues});
  assert.equal(saves.length,1);
  assert.equal(saves[0].complaint,formValues.complaint);
  assert.equal(saves[0].expectedCompletionAt,formValues.expectedCompletionAt);
  assert.equal(saves[0].openingMeterFileName,'meter.jpg');
  assert.equal(saves[0].openingMeterFile,'saved-evidence');
});

test('Cancel and dialog dismissal stay locked while a red flag is being saved',async()=>{
  for(const flagKind of ['mis','arrival']){
    const app=harness();
    let closed=0,complete;
    const props={request,flagKind,close:()=>{closed++;},onSave:()=>new Promise(resolve=>{complete=resolve;})};
    let tree=app.render('RequestRedFlagForm',props);
    find(tree,'textarea').props.onChange({target:{value:'Recorded delay reason'}});
    tree=app.render('RequestRedFlagForm',props);
    const pending=find(tree,'form').props.onSubmit({preventDefault(){}});
    tree=app.render('RequestRedFlagForm',props);
    const cancel=children(tree,node=>node.type==='button'&&text(node)==='Cancel')[0];
    assert.equal(cancel.props.disabled,true);
    cancel.props.onClick();
    tree.props.close();
    assert.equal(closed,0);
    complete();
    await pending;
    tree.props.close();
    assert.equal(closed,1);
  }
});

test('nested red flag dialog alone handles Escape and Tab without closing the underlying draft',()=>{
  const effects=[],listeners=new Set(),dialogs=[],focused=[];
  const document={activeElement:null,body:{style:{overflow:''}},querySelectorAll:()=>dialogs,
    addEventListener:(_event,listener)=>listeners.add(listener),removeEventListener:(_event,listener)=>listeners.delete(listener)};
  const Modal=new Function('React','useRef','useEffect','document','X',`${compiledModal};return Modal;`)(React,value=>({current:value}),effect=>effects.push(effect),document,Null);
  const closed=[];
  const mount=name=>{
    const input={getAttribute:()=>null,focus(){document.activeElement=input;focused.push(name);}};
    const dialog={contains:element=>element===input||element===dialog,querySelector:()=>input,querySelectorAll:()=>[input],focus:()=>input.focus()};
    const tree=Modal({title:name,close:()=>closed.push(name)});
    children(tree,node=>node.props.role==='dialog')[0].props.ref.current=dialog;
    dialogs.push(dialog);
    const cleanup=effects.pop()();
    return ()=>{dialogs.splice(dialogs.indexOf(dialog),1);cleanup();};
  };
  const removeEdit=mount('Edit draft'),removeFlag=mount('Arrival reason');
  focused.length=0;
  document.activeElement=null;
  for(const listener of listeners)listener({key:'Tab',preventDefault(){}});
  assert.deepEqual(focused,['Arrival reason']);
  for(const listener of listeners)listener({key:'Escape',preventDefault(){}});
  assert.deepEqual(closed,['Arrival reason']);
  removeFlag();
  for(const listener of listeners)listener({key:'Escape',preventDefault(){}});
  assert.deepEqual(closed,['Arrival reason','Edit draft']);
  removeEdit();
});
