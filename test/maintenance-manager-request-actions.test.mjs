import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { managerRoleSelection } from "../admin-access.mjs";
import React from 'react';
import {transformWithOxc} from 'vite';

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const slice = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

const guards = new Function("managerRoleSelection", `${slice(server, "function requirePermission(", "async function requireSuper(")}
return { maintenanceManagerSession, requireMaintenanceUpdatePermission };`)(managerRoleSelection);

const run = (session, permission = "editRequests") => {
  let status = 200, passed = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  guards.requireMaintenanceUpdatePermission(permission)({ session }, res, () => { passed = true; });
  return passed ? 200 : status;
};

test("Maintenance Managers may edit, close and post daily updates; other managers stay blocked", () => {
  const manager = (roles) => ({ role: "super", permissions: { adminLevel: "Manager", managerRoles: roles } });
  assert.equal(run(manager(["Maintenance Manager"])), 200);
  assert.equal(run(manager(["Maintenance Manager"]), "closeRequests"), 200);
  assert.equal(run(manager(["Project Manager"]), "closeRequests"), 403);
  assert.equal(run(manager(["Production Manager", "Maintenance Manager"]), "closeRequests"), 200);
  assert.equal(run(manager(["Production Manager"])), 403);
  assert.equal(run(manager(["MIS Manager"]), "closeRequests"), 403);
  assert.equal(run({ role: "normal", assignedRole: "Maintenance User", permissions: { editRequests: true } }), 200);
  assert.equal(run({ role: "normal", assignedRole: "Maintenance User", permissions: {} }), 403);
});

test('manager Close request uses the existing closure dialog, preserves failures and resumes after arrival flagging',async()=>{
  const body=slice(source,'function ManagerRequestUpdate(','const OEM_CHART_VIEWPORT_GAP');
  const {code}=await transformWithOxc(body,'manager-close.jsx',{jsx:{runtime:'classic'}});
  const Null=()=>null,CloseRequestForm=()=>null;
  const names={React,useMasterRecords:()=>[[],null,true],CloseRequestForm,RequestEditForm:Null,DailyRemarkForm:Null,RequestRedFlagForm:Null,ResponsibilityRequestEditForm:Null,Modal:Null};
  const Component=new Function(...Object.keys(names),`${code};return ManagerRequestUpdate;`)(...Object.values(names));
  const changes=[],writes=[],request={ref:'REQ-MANAGER',site:'Sasti OB',status:'Open'};
  const props={update:{kind:'close'},request,linkedRequests:[request],onChange:value=>changes.push(value),onUpdateRequest:async(...args)=>writes.push(args)};
  let dialog=Component(props);
  assert.equal(dialog.type,CloseRequestForm);
  assert.deepEqual(dialog.props.linkedRequests,[request]);
  await dialog.props.onSave({status:'Closed',maintenanceWork:'Completed'});
  assert.deepEqual(writes,[[request.ref,{status:'Closed',maintenanceWork:'Completed'},'close']]);
  assert.deepEqual(changes,[null]);
  changes.length=0;
  dialog=Component({...props,onUpdateRequest:async()=>{throw new Error('Missing completion details');}});
  await assert.rejects(dialog.props.onSave({}),/Missing completion details/);
  assert.deepEqual(changes,[],'a failed save keeps the closure form open');
  dialog=Component({...props,onUpdateRequest:async()=>{throw Object.assign(new Error('Arrival reason required'),{code:'ARRIVAL_RED_FLAG_REQUIRED'});}});
  await dialog.props.onSave({});
  assert.deepEqual(changes,[{kind:'arrival',request,next:'close'}]);
});

test('Close request action opens active requests and is absent for closed, idle and verified history',async()=>{
  const table=slice(source,'function BreakdownTable','\nfunction ');
  const start=table.indexOf('  const rowUpdatable');
  const end=table.indexOf('  const [mobileControlsOpen',start);
  const {code}=await transformWithOxc(table.slice(start,end),'close-action.jsx',{jsx:{runtime:'classic'}});
  const clicked=[];
  const bindings={React,onClose:row=>clicked.push(row.ref),onDelete:null,onDeleteSelected:null,onEdit:null,onRemark:null,canDeleteRow:null,rows:[],isIdleVehicleRequest:()=>false,useState:initial=>[initial(),()=>{}],useEffect:()=>{},Pencil:()=>null,Trash2:()=>null,MessageCircle:()=>null,CheckCircle2:()=>null};
  const actions=new Function(...Object.keys(bindings),`${code};return requestActions;`)(...Object.values(bindings));
  for(const [row,expected] of [[{status:'Open'},true],[{status:'In progress'},true],[{status:'Running BD',verifiedAt:'previous'},true],[{status:'Closed'},false],[{status:'Idle'},false],[{status:'Open',verifiedAt:'verified'},false]]){
    const children=React.Children.toArray(actions({...row,ref:row.status}).props.children);
    const button=children.find(node=>node.type==='button');
    assert.equal(Boolean(button),expected,row.status);
    if(button)button.props.onClick();
  }
  assert.deepEqual(clicked,['Open','In progress','Running BD']);
});

test("manager request updates use the shared guard and stay within the manager's sites", () => {
  for (const route of ["daily-remarks',requireSession,requireMaintenanceUpdatePermission('closeRequests')",
    ":reference',requireSession,requireMaintenanceUpdatePermission('editRequests')",
    "delayed-reason',requireSession,requireMaintenanceUpdatePermission('editRequests')"]) assert.ok(server.includes(route), route);
  const guard = slice(server, "async function withMaintenanceArrivalGuard", "app.post('/api/requests/:reference/daily-remarks'");
  assert.match(guard, /maintenanceManagerSession\(req\.session\)&&!userManagesSite\(/);
  const arrival = slice(server, "app.patch('/api/requests/:reference/arrival-flag'", "app.post('/api/requests'");
  assert.match(arrival, /maintenanceManagerSession\(req\.session\)&&!userManagesSite\(/);
  assert.match(slice(server, "app.patch('/api/requests/:reference/close'", "app.patch('/api/requests/:reference/ideal-onroad'"), /requireMaintenanceUpdatePermission/);
});

test("the Maintenance Manager workload table shows Edit and Daily update actions", () => {
  const manager = slice(source, "function ManagerDashboard", "const OEM_CHART_VIEWPORT_GAP");
  assert.match(manager, /canUpdateRequests=activeManagerRole==="Maintenance Manager"&&queueTab==="active"/);
  assert.match(manager, /onEdit=\{canUpdateRequests\?/);
  assert.match(manager, /onClose=\{canCloseRequests\?/);
  assert.match(manager, /onRemark=\{canUpdateRequests\?/);
  assert.match(manager, /<RequestEditForm[\s\S]*<DailyRemarkForm[\s\S]*<RequestRedFlagForm flagKind="arrival"/);
  const table = slice(source, "function BreakdownTable", "\nfunction ");
  assert.match(table, /<Pencil \/> Edit/);
  assert.match(table, /<MessageCircle \/> Daily update/);
  assert.match(source, /onUpdateRequest=\{updateRequest\} onAddDailyRemark=\{addDailyRemark\} TimelineButton=\{RequestTimelineButton\} \/>/);
});
