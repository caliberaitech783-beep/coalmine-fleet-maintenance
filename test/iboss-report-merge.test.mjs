import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MERGE_CHAINS,MAX_MERGE_STEPS,mergeChain,resolveSelection,mergeStatements,buildMergedReport,buildTrail} from '../iboss-report-merge.mjs';

import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';

const range={from:'2026-04-01',to:'2026-09-30'};

test('selections above 10 reports are refused, and vehicles match on letters and digits only',()=>{
 const party=MERGE_CHAINS['party-position'].steps.map(step=>step.key);
 assert.throws(()=>resolveSelection('party-position',party.slice(0,11)),/at most 10/);
 assert.equal(resolveSelection('party-position',party.slice(0,10)).steps.length,10);
 const [anchor,emi]=mergeStatements('vehicle-cost',['vehicle','emi','expense'],range);
 assert.match(anchor.sql,/SELECT k AS anchor,k AS doc_no FROM \(SELECT REGEXP_REPLACE\(UPPER\(NVL\(e\.doorno,''\)\),'\[\^A-Z0-9\]',''\) AS k .* UNION SELECT REGEXP_REPLACE\(UPPER\(NVL\(x\.vehicleno/);
 assert.match(emi.sql,/REGEXP_REPLACE\(UPPER\(NVL\(e\.doorno,''\)\),'\[\^A-Z0-9\]',''\) AS anchor/);
 const [bank,balance]=mergeStatements('bank-position',['bank','balance'],range);
 assert.match(bank.sql,/p\.partytypecode='BANK' AND p\.partycode IN \(SELECT b\.accountcode FROM cmpl\.accountbalance b/);
 assert.deepEqual(balance.binds,{to_date:range.to});
 assert.match(balance.sql,/PARTITION BY b\.companycode,b\.accountcode ORDER BY b\.fordate DESC/);
});

test('only master lookups and the unlinked asset reports stay outside Report Merge',()=>{
 const merged=new Set(Object.values(MERGE_CHAINS).flatMap(chain=>chain.steps.map(step=>step.title.replace(' (Banks)',''))));
 const outside=Object.values(ACCOUNT_VIEWS).map(view=>view.title).filter(title=>!merged.has(title));
 assert.deepEqual(outside.sort(),['Asset Details Report','Asset Register','Chart Of Accounts','Cost Centre Master','Work Centre Master']);
});

test('six processes each have one anchor, valid 10-report defaults and read-only SQL',()=>{
 assert.deepEqual(Object.keys(MERGE_CHAINS),['bank-guarantee','fixed-deposit','loan-emi','party-position','bank-position','vehicle-cost','voucher']);
 assert.deepEqual(Object.entries(MERGE_CHAINS).filter(([,chain])=>chain.drillOnly).map(([key])=>key),['voucher']);
 const titles=new Set(Object.values(MERGE_CHAINS).flatMap(chain=>chain.steps.map(step=>step.title)));
 for(const title of ['Vendor Master','Account Opening Register','Day Book','Party Wise TCS Summary','Bill Outstanding More than 180 Days','Imprest Balance','Internal Balance Details','Bank Balance Details','Bank Interest','EMI Schedule','Expense Vehiclewise'])assert.ok(titles.has(title),title);
 assert.equal(MERGE_CHAINS['party-position'].steps.length,16);
 for(const [key,chain] of Object.entries(MERGE_CHAINS)){
  assert.equal(chain.steps.filter(step=>step.role==='anchor').length,1,key);
  assert.ok(chain.defaults.length<=MAX_MERGE_STEPS,key);
  assert.deepEqual(resolveSelection(key,chain.defaults).steps.length,chain.defaults.length,`${key} defaults are complete and in range`);
  const all=chain.steps.map(step=>step.key);
  for(const mode of [{...range},{...range,anchorKey:'42'}])for(const statement of mergeStatements(key,all,mode)){
   assert.doesNotMatch(statement.sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|MERGE|ALTER|GRANT)\b/i);
   const used=[...statement.sql.matchAll(/:(\w+)/g)].map(match=>match[1]);
   assert.deepEqual(Object.keys(statement.binds).sort(),[...new Set(used)].sort(),`${key}/${statement.step} binds exactly what it uses`);
   assert.match(statement.sql,/\bAS anchor\b/i);
  }
 }
});

test('selection always includes the main record and auto-adds bridge reports in process order',()=>{
 assert.deepEqual(resolveSelection('loan-emi',['payment']),{steps:['loan','instalments','payment'],autoAdded:['loan','instalments']});
 assert.deepEqual(resolveSelection('bank-guarantee',['closure','type']),{steps:['bg','type','closure'],autoAdded:['bg']});
 assert.deepEqual(resolveSelection('party-position',[]).steps,['party']);
 assert.throws(()=>resolveSelection('loan-emi',['bogus']),/Unknown report/);
 assert.throws(()=>mergeChain('payroll'),/Unknown Report Merge/);
});

test('trail mode looks up one anchor by key; party trails stay inside the date range',()=>{
 const [bg]=mergeStatements('bank-guarantee',['bg'],{...range,anchorKey:'7'});
 assert.match(bg.sql,/TO_CHAR\(a\.tno\) = :anchor_key/);assert.deepEqual(bg.binds,{anchor_key:'7'});
 const party=mergeStatements('party-position',['party','debit-note'],{...range,anchorKey:'V001'});
 assert.match(party[1].sql,/c\.partycode = :anchor_key AND c\.debitnotedate >= TO_DATE/);
 const list=mergeStatements('party-position',['party','debit-note','payment-advice'],range);
 assert.match(list[0].sql,/p\.partycode IN \(SELECT c\.partycode FROM cmpl\.debitnote c .* UNION SELECT c\.partycode FROM cmpl\.paymentadvice c/);
});

test('merged report has one row per main record, no repeated columns and summarised child reports',()=>{
 const steps=MERGE_CHAINS['bank-guarantee'].steps.map(step=>step.key);
 const report=buildMergedReport('bank-guarantee',steps,{
  bg:[{ANCHOR:'1',DOC_NO:'BG/1',DOC_DATE:'2026-05-01',COMPANYCODE:'CMPL',TYPE_CODE:'PB',EXPIRY_DATE:'2099-01-01',AMOUNT:1000},{ANCHOR:'2',DOC_NO:'BG/2',DOC_DATE:'2026-05-02',EXPIRY_DATE:'2020-01-01',AMOUNT:500}],
  type:[{ANCHOR:'1',DOC_NO:'PB',TYPE_NAME:'Performance'}],nature:[],
  commission:[{ANCHOR:'1',DOC_NO:'C1',DOC_DATE:'2026-06-01',COMMISSION_AMOUNT:10,TOTAL_AMOUNT:11.8,PERIOD_TO:'2026-06-30'},{ANCHOR:'1',DOC_NO:'C2',DOC_DATE:'2026-07-01',COMMISSION_AMOUNT:10,TOTAL_AMOUNT:11.8,PERIOD_TO:'2026-07-31'}],
  closure:[{ANCHOR:'2',DOC_NO:'CL1',DOC_DATE:'2026-08-01'}]
 });
 const labels=report.columns.map(column=>column.label),keys=report.columns.map(column=>column.key);
 assert.equal(new Set(labels).size,labels.length);assert.equal(new Set(keys).size,keys.length);
 assert.ok(!labels.includes('BG Type Code'),'type code is replaced by the BG Type lookup');
 assert.equal(report.rows.length,2);
 const [first,second]=report.rows;
 assert.equal(first.type__TYPE_NAME,'Performance');
 assert.deepEqual(first.commission__DOCS,['C1','C2']);assert.equal(first.commission__COUNT,2);
 assert.equal(first.commission__SUM_COMMISSION_AMOUNT,20);assert.equal(first['commission__LATEST_PERIOD_TO'],'2026-07-31');
 assert.equal(first.BG_STATUS,'Active');assert.equal(second.BG_STATUS,'Closed');assert.deepEqual(second.closure__DOCS,['CL1']);
 assert.equal(second.commission__COUNT,0);assert.equal(second.commission__SUM_COMMISSION_AMOUNT,'');
});

test('party merge hides parties with no activity and only adds derived columns whose reports are selected',()=>{
 const steps=['party','debit-note'];
 const report=buildMergedReport('party-position',steps,{party:[{ANCHOR:'V1',DOC_NO:'V1',PARTY_NAME:'Alpha'},{ANCHOR:'V2',DOC_NO:'V2',PARTY_NAME:'Beta'}],'debit-note':[{ANCHOR:'V1',DOC_NO:'DN1',DOC_DATE:'2026-05-01',DEBIT_AMOUNT:250}]});
 assert.deepEqual(report.rows.map(row=>row.ANCHOR),['V1']);
 assert.ok(!report.columns.some(column=>column.key==='NET_NOTES'));
 assert.ok(report.columns.some(column=>column.key==='DOCUMENT_COUNT'));
});

test('trail lists every report of the process in order, marking unrecorded steps empty',()=>{
 const trail=buildTrail('loan-emi',{loan:[{ANCHOR:'9',DOC_NO:'L9',DOC_DATE:'2026-04-02',LOAN_AMOUNT:900000}],instalments:[{ANCHOR:'9',DOC_NO:'EMI 1',DOC_DATE:'2026-05-02',INSTALMENT_EMI:30000,ISPAID:'Y'}],payment:[]});
 assert.deepEqual(trail.map(step=>step.key),['loan','instalments','payment']);
 assert.equal(trail[0].documents[0].docNo,'L9');
 assert.ok(trail[0].documents[0].details.some(item=>item.label==='Loan Amount'&&item.value===900000));
 assert.equal(trail[2].documents.length,0);
});

test('Report Merge remains an Accounts page tab alongside Dashboard, protected by Accounts permissions, with its own API',()=>{
 const accounts=fs.readFileSync(new URL('../src/iboss-accounts.jsx',import.meta.url),'utf8');
 assert.ok(accounts.includes("SECTIONS=[['dashboard','Dashboard'],['masters','Masters'],['transactions','Transactions'],['merge','Report Merge']]"));
 assert.ok(accounts.includes(`section==='merge'?<div role="tabpanel" id="accounts-panel-merge" aria-labelledby="accounts-tab-merge"><IbossReportMerge token={token} ReportSection={ReportSection} embedded initialChain={mergeContext?.chain||''} initialRange={mergeContext?.range}/>`));
 const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.ok(server.includes("app.get('/api/reports/iboss-accounts-merge/:chain',requireSession"));
 assert.ok(server.includes("app.get('/api/reports/iboss-accounts-merge/:chain/trail',requireSession"));
 assert.ok(server.includes("if(!await accountsMergeAllowed(req))"));
});
