import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestDeletionBlocker,requestDeletable,requestStageLabel,requestDeletionSnapshot,normalizeDeletionReferences,REQUEST_BULK_DELETE_LIMIT} from '../request-deletion.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('verified requests are never deletable; Idle only for an Admin; every other unverified stage for both',()=>{
  const open={ref:'REQ-1',status:'Open'};
  const awaiting={ref:'REQ-2',status:'Open',acceptanceRequired:true};
  const inProgress={ref:'REQ-3',status:'In progress',acceptedAt:'2026-09-18 09:00:00',inProgressAt:'2026-09-18 10:00:00'};
  const idle={ref:'REQ-4',status:'Idle'};
  const closed={ref:'REQ-5',status:'Closed',closedAt:'2026-09-18 12:00:00'};
  const verified={ref:'REQ-6',status:'Closed',closedAt:'2026-09-18 12:00:00',verifiedAt:'2026-09-18 13:00:00'};
  for(const row of [open,awaiting,inProgress,closed]){
    assert.equal(requestDeletionBlocker(row),null,row.ref);
    assert.equal(requestDeletionBlocker(row,{administrator:true}),null,row.ref);
  }
  assert.equal(requestDeletionBlocker(idle),'Idle requests can only be deleted by an Admin.');
  assert.equal(requestDeletionBlocker(idle,{administrator:true}),null);
  assert.equal(requestDeletionBlocker(verified),'Verified requests cannot be deleted.');
  assert.equal(requestDeletionBlocker(verified,{administrator:true}),'Verified requests cannot be deleted.','Admins cannot delete verified requests either');
  assert.equal(requestDeletionBlocker(undefined,{administrator:true}),'The request no longer exists.');
  assert.equal(requestDeletable(closed),true);
  assert.equal(requestDeletable(verified,{administrator:true}),false);
  assert.deepEqual([open,awaiting,inProgress,idle,closed,verified].map(requestStageLabel),
    ['Open','Awaiting acceptance','In progress','Idle, awaiting on-road approval','Closed, awaiting MIS verification','Verified']);
});

test('the Audit Trail snapshot names the request in every field and bulk references are cleaned',()=>{
  const snapshot=requestDeletionSnapshot({ref:'REQ-9',status:'Open',equipmentGroup:'Dumper',door:'D-12',site:'Jayant OB',category:'Engine',owner:'Ravi',start:'2026-09-18 08:00:00'});
  assert.deepEqual(snapshot.map(entry=>entry.field),['REQ-9 · Stage','REQ-9 · Equipment','REQ-9 · Door no.','REQ-9 · Site','REQ-9 · Breakdown type','REQ-9 · Created by','REQ-9 · Started']);
  assert.ok(snapshot.every(entry=>entry.after===''));
  assert.deepEqual(normalizeDeletionReferences([' REQ-1 ','REQ-2','REQ-1','',null]),['REQ-1','REQ-2']);
  assert.deepEqual(normalizeDeletionReferences('REQ-1, REQ-2 REQ-3'),['REQ-1','REQ-2','REQ-3']);
  assert.deepEqual(normalizeDeletionReferences(undefined),[]);
  assert.equal(REQUEST_BULK_DELETE_LIMIT,200);
});

test('the API deletes in one transaction, keeps the Maintenance delete right, and adds an Admin-only bulk route',()=>{
  const helper=server.slice(server.indexOf('async function deleteMaintenanceRequests('),server.indexOf("app.delete('/api/requests/:reference',"));
  assert.match(helper,/await client\.query\('BEGIN'\)/);
  assert.match(helper,/requestDeletionBlocker\(byRef\.get\(reference\),\{administrator\}\)/);
  assert.ok(helper.indexOf('DELETE FROM request_corrections WHERE request_reference=ANY')<helper.indexOf('DELETE FROM maintenance_requests'),'corrections go first so the RESTRICT foreign key never fails');
  assert.match(helper,/DELETE FROM whatsapp_workflow_dispatches WHERE request_reference=ANY/);
  assert.match(helper,/DELETE FROM maintenance_requests WHERE reference=ANY\(\$1::text\[\]\) AND verified_at IS NULL AND \(\$2::boolean OR status NOT IN \('Idle','Ideal'\)\) RETURNING reference/);
  assert.match(helper,/ROLLBACK/);
  const single=server.slice(server.indexOf("app.delete('/api/requests/:reference',"),server.indexOf("app.post('/api/requests/bulk-delete',"));
  assert.match(single,/requirePermission\('deleteRequests',\{role:'Maintenance User'\}\)/,'Maintenance users keep their delete permission');
  assert.match(single,/administrator:administratorSession\(req\.session\)/);
  assert.match(single,/changedFields:requestDeletionSnapshot\(outcome\.deleted\[0\]\)/);
  const bulk=server.slice(server.indexOf("app.post('/api/requests/bulk-delete',"),server.indexOf("app.patch('/api/requests/:reference/mis-flag',"));
  assert.match(bulk,/requireSession,requireAdministrator,/,'only Admin / Super Admin');
  assert.match(bulk,/A deletion reason is required for the Audit Trail\./);
  assert.match(bulk,/REQUEST_BULK_DELETE_LIMIT/);
  assert.match(bulk,/deleteMaintenanceRequests\(references,\{administrator:true\}\)/);
  assert.match(bulk,/action:'Delete requests'/);
  assert.match(bulk,/res\.json\(\{deleted:deletedRefs,skipped:outcome\.skipped\}\)/);
  assert.match(server,/function administratorSession\(session\)\{[\s\S]*?\['admin','super admin'\]\.includes\(adminLevel\)/);
});

test('Admin sessions get Delete and Delete selected in every workspace table; Maintenance users keep only their single delete',()=>{
  const normal=client.slice(client.indexOf('function Normal({'),client.indexOf('\nfunction App() {'));
  assert.match(normal,/const administratorSession = session\?\.role === "super" && \["admin", "super admin"\]\.includes\(String\(permissions\.adminLevel \|\| ""\)\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(normal,/const canDeleteRow = \(row\) => requestDeletable\(row, \{ administrator: administratorSession \}\)/);
  assert.match(normal,/const adminDeleteProps = administratorSession \? \{ onDelete: deleteRequest, onDeleteSelected: deleteSelectedRequests, canDeleteRow \} : \{\}/);
  assert.match(normal,/isProduction && tab === "requests"[^\n]*columnOrder=\{PRODUCTION_REQUEST_COLUMNS\} \{\.\.\.adminDeleteProps\} \/>/,'Production workspace active requests');
  assert.match(normal,/isMaintenance && tab === "requests"[^\n]*onDelete=\{permissions\.deleteRequests \? deleteRequest : null\} canDeleteRow=\{canDeleteRow\} onDeleteSelected=\{deleteSelectedRequests\}[^\n]*\/>/,'Maintenance active requests');
  assert.match(normal,/isMaintenance && tab === "close"[^\n]*\{\.\.\.adminDeleteProps\}[^\n]*\/>/,'Maintenance close list');
  assert.equal((normal.match(/onMisFlag=\{permissions\.verifyRequests \? setMisFlagging : null\} \{\.\.\.adminDeleteProps\} \/>/g)||[]).length,2,'MIS awaiting verification and Verify lists');
  assert.match(normal,/tab === "idle"[^\n]*rows=\{idleRows\}[^\n]*\{\.\.\.adminDeleteProps\} \/>/,'Idle vehicles (on-road approval queue)');
  assert.match(normal,/tab === "history"[^\n]*<MobileWorkflowTable rows=\{historyRows\}[^\n]*\{\.\.\.adminDeleteProps\} \/>/,'closed history for the MIS-verification stage');
  assert.match(normal,/A deletion reason is required for the Audit Trail\./);
  assert.match(normal,/Permanently delete \$\{references\.length\} request\$\{plural\}\?/);
  const table=client.slice(client.indexOf('function MobileWorkflowTable('),client.indexOf('function RequestEditForm('));
  assert.match(table,/if \(onDelete \|\| onDeleteSelected\) showActions = true;/);
  assert.match(table,/\{onDelete && rowDeletable\(row\) && <button type="button" className="danger" onClick=\{\(\) => onDelete\(row\)\}><Trash2 \/> Delete<\/button>\}/);
  assert.match(table,/Delete selected \(\{selectedRefs\.size\}\)/);
  assert.match(table,/Select all shown/);
  const breakdown=client.slice(client.indexOf('function BreakdownTable('),client.indexOf('const masterFields ='));
  assert.match(breakdown,/const requestActions = \(onDelete \|\| onDeleteSelected \|\| onEdit \|\| onRemark\) \? \(row\) =>/);
  assert.match(breakdown,/Delete selected \(\{selectedRefs\.size\}\)/);
  assert.match(client,/case "requestAction": return showReadOnlyAction \? <td className="row-actions">\{requestActions \? requestActions\(r\) : <span>Read only<\/span>\}<\/td> : null;/);
  assert.match(client,/deleteRequestsBulk = async \(references, reason\) => \{\s*const response = await fetch\("\/api\/requests\/bulk-delete", \{method: "POST"/);
  assert.equal((client.match(/onDeleteRequest=\{deleteRequest\} onDeleteRequests=\{deleteRequestsBulk\}/g)||[]).length,2);
  const styles=readFileSync(new URL('../src/mobile-workflow.css',import.meta.url),'utf8');
  assert.match(styles,/\.request-bulk-delete button\.danger\{color:#fff;background:#c9253d/);
});
