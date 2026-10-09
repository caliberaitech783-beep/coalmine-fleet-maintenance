import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACCOUNT_DRILLS,accountDrill,vehicleKey} from '../iboss-drill.mjs';
import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS} from '../iboss-accounts.mjs';
import {MERGE_CHAINS,buildTrail,mergeStatements} from '../iboss-report-merge.mjs';

test('every drill column exists in its Accounts report and opens a real step of a real trail',()=>{
 for(const [view,columns] of Object.entries(ACCOUNT_DRILLS)){
  assert.ok(ACCOUNT_VIEWS[view],view);
  const keys=new Set(ACCOUNT_VIEWS[view].columns.map(column=>column.key));
  for(const [column,target] of Object.entries(columns)){
   assert.ok(keys.has(column),`${view}.${column} is a visible column`);
   assert.ok(MERGE_CHAINS[target.chain]?.steps.some(step=>step.key===target.step),`${view}.${column} → ${target.chain}/${target.step}`);
  }
 }
});

test('only reports with nothing to trace stay without drill-down',()=>{
 const without=Object.values(ACCOUNT_SECTIONS).flat().filter(view=>!ACCOUNT_DRILLS[view]).sort();
 assert.deepEqual(without,['asset-details','asset-register','bank-guarantee-nature','bank-guarantee-type','cost-centre','work-centre']);
});

test('clicked cells resolve to the right trail key, step and highlighted document',()=>{
 assert.deepEqual(accountDrill('debit-note','DEBITNOTENO',{ID:'7',DEBITNOTENO:'DN/12',PARTYCODE:'V001'}),{chain:'party-position',key:'V001',focus:{step:'debit-note',docNo:'DN/12'}});
 assert.deepEqual(accountDrill('day-book','VOUCHER_NO',{ID:'5512:3',VOUCHER_NO:'JV/88',ACCOUNT_CODE:'A1'}),{chain:'voucher',key:'5512',focus:{step:'voucher',docNo:'JV/88'}});
 assert.deepEqual(accountDrill('combined-emi-schedule','LOANNO',{ID:'91:4',LOANNO:'LN/9'}),{chain:'loan-emi',key:'91',focus:{step:'instalments',docNo:'LN/9'}});
 assert.deepEqual(accountDrill('bank-guarantee-commission','BANKGAURANTYCOMMISSIONNO',{ID:'3',BANKGAURANTYCOMMISSIONNO:'C/1',BANKGAURANTYTNO:44}),{chain:'bank-guarantee',key:'44',focus:{step:'commission',docNo:'C/1'}});
 assert.deepEqual(accountDrill('expense-vehicle','VEHICLENO',{ID:'1',VEHICLENO:'dt-12 a'}),{chain:'vehicle-cost',key:'DT12A',focus:{step:'expense',docNo:'dt-12 a'}});
 assert.equal(accountDrill('debit-note','DEBITNOTENO',{DEBITNOTENO:'DN/12',PARTYCODE:''}),null);
 assert.equal(accountDrill('debit-note','AMOUNT',{AMOUNT:5}),null);
 assert.equal(vehicleKey(' Dt-01 '),'DT01');
});

test('trails carry cross-links to related parties, banks, vouchers, deposits, guarantees and loans',()=>{
 const voucher=buildTrail('voucher',{voucher:[{ANCHOR:'5',DOC_NO:'JV/1',DOC_DATE:'2026-05-01'}],lines:[{ANCHOR:'5',DOC_NO:'Line 1 · Alpha',ACCOUNT_CODE:'V001',ACCOUNT_NAME:'Alpha',LINE_AMOUNT:-100}],tds:[]});
 assert.deepEqual(voucher[1].documents[0].details.find(item=>item.label==='Account Code').link,{chain:'party-position',key:'V001'});
 const party=buildTrail('party-position',{party:[{ANCHOR:'V001',DOC_NO:'V001'}],'day-book':[{ANCHOR:'V001',DOC_NO:'JV/1',VOUCHER_TNO:'5',DOC_DATE:'2026-05-01'}]});
 assert.deepEqual(party.find(step=>step.key==='day-book').documents[0].link,{chain:'voucher',key:'5'});
 const bank=buildTrail('bank-position',{bank:[{ANCHOR:'SBI',DOC_NO:'SBI'}],bg:[{ANCHOR:'SBI',DOC_NO:'BG/1',RECORD_TNO:'77'}],fd:[{ANCHOR:'SBI',DOC_NO:'FD/1',RECORD_TNO:'12'}],loan:[{ANCHOR:'SBI',DOC_NO:'LN/1',RECORD_TNO:'9'}]});
 assert.deepEqual(bank.find(step=>step.key==='bg').documents[0].link,{chain:'bank-guarantee',key:'77'});
 assert.deepEqual(bank.find(step=>step.key==='fd').documents[0].link,{chain:'fixed-deposit',key:'12'});
 assert.deepEqual(bank.find(step=>step.key==='loan').documents[0].link,{chain:'loan-emi',key:'9'});
 const bg=buildTrail('bank-guarantee',{bg:[{ANCHOR:'77',DOC_NO:'BG/1',BANK_CODE:'SBI'}]});
 assert.deepEqual(bg[0].documents[0].details.find(item=>item.label==='Issuing Bank Code').link,{chain:'bank-position',key:'SBI'});
 for(const statement of mergeStatements('voucher',MERGE_CHAINS.voucher.steps.map(step=>step.key),{from:'2026-04-01',to:'2026-09-30',anchorKey:'5'}))assert.match(statement.sql,/v\.tno = TO_NUMBER\(:anchor_key DEFAULT NULL ON CONVERSION ERROR\)/);
});

test('Masters, Transactions and Report Merge all open the shared drill panel',()=>{
 const accounts=fs.readFileSync(new URL('../src/iboss-accounts.jsx',import.meta.url),'utf8');
 assert.match(accounts,/accountDrill\(view,column\.key,row\)/);
 assert.match(accounts,/<DrillPanel target=\{drill\}/);
 const merge=fs.readFileSync(new URL('../src/iboss-report-merge.jsx',import.meta.url),'utf8');
 assert.match(merge,/<DrillPanel target=\{trail\}/);
 assert.match(merge,/filter\(\(\[,entry\]\)=>!entry\.drillOnly\)/);
});
