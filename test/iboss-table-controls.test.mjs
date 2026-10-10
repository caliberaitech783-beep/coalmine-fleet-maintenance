import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPortalTarget,sameReportView} from '../src/report-portal-target.mjs';
import {ledgerReportColumns} from '../src/iboss-ledger-report.mjs';

test('report controls stay inside the topmost native ledger or dashboard dialog',()=>{
 const body={},dashboard={},ledger={};let dialogs=[];
 const doc={body,querySelectorAll:selector=>{assert.equal(selector,'dialog:modal');return dialogs;}};
 assert.equal(reportPortalTarget(doc),body);
 dialogs=[dashboard];assert.equal(reportPortalTarget(doc),dashboard);
 dialogs=[dashboard,ledger];assert.equal(reportPortalTarget(doc),ledger);
});
test('export view detects filtering, sorting, visible columns and source refresh without render loops',()=>{
 const a={id:1},b={id:2},rows=[a,b],columns=[{key:'id'},{key:'amount'}];
 const view={sourceRows:rows,rows,columns};
 assert.equal(sameReportView(null,view),false);
 assert.equal(sameReportView(view,{...view,rows:[a,b],columns:columns.map(c=>({...c}))}),true);
 for(const changed of [{rows:[b]},{rows:[b,a]},{columns:[columns[1]]},{columns:[columns[1],columns[0]]},{sourceRows:[a,b]}])assert.equal(sameReportView(view,{...view,...changed}),false);
});
test('ledger report keeps numeric Dr/Cr sortable and exposes narration and audit details',()=>{
 const columns=ledgerReportColumns(),row={AMOUNT:-1250.5,RUNNING_BALANCE:400,NARRATION:'Invoice settlement',CREATOR:'USER',CREATOR_NAME:'Example User'};
 const value=key=>columns.find(c=>c.key===key).value(row);
 assert.equal(value('DEBIT'),1250.5);assert.equal(value('CREDIT'),0);
 assert.equal(value('BALANCE_DR'),0);assert.equal(value('BALANCE_CR'),400);
 assert.equal(value('NARRATION'),'Invoice settlement');assert.equal(value('CREATOR_NAME'),'Example User');
 assert.equal(columns.find(c=>c.key==='DEBIT').render(row),'1,250.50');
});
