import test from 'node:test';import assert from 'node:assert/strict';
import {TRADE_REPORTS,tradeCard} from '../iboss-trade-ledger.mjs';
import {buildDashboard,dashboardMetric,DASHBOARD_QUERIES} from '../iboss-dashboard.mjs';
import {companyScopedSql} from '../iboss-company-scope.mjs';
import {accountDrill} from '../iboss-drill.mjs';
test('trade cards follow reconciliation, retain opposing balances and show ledger side',()=>{
 const result=buildDashboard({'trade-payable':[{BALANCEAMOUNT:120},{BALANCEAMOUNT:-20}],'trade-receivable':[{BALANCEAMOUNT:-200},{BALANCEAMOUNT:30}]},{from:'2026-04-01',to:'2026-09-30'});
 assert.deepEqual(result.cards.slice(0,4).map(c=>c.key),['bank','bank-reconciliation','trade-payable','trade-receivable']);
 assert.equal(result.cards[2].amount,100);assert.equal(result.cards[2].balanceSide,'Cr');assert.equal(result.cards[2].count,2);
 assert.equal(result.cards[3].amount,170);assert.equal(result.cards[3].balanceSide,'Dr');
 assert.equal(tradeCard('trade-payable',[{BALANCEAMOUNT:-40}]).balanceSide,'Dr');assert.equal(tradeCard('trade-receivable',[]).balanceSide,'Nil');
});
test('trade cards and details share ERP descendant hierarchy and voucher ledger basis',()=>{
 for(const [key,root] of [['trade-payable','SUNDRYCREDITORS'],['trade-receivable','SUNDRYDEBTORS']]){
  const sql=TRADE_REPORTS[key].sql;assert.equal(sql,DASHBOARD_QUERIES[key].sql);
  assert.ok(sql.includes(`START WITH h.partycode='${root}' CONNECT BY NOCYCLE PRIOR h.partycode=h.parentcode`));
  assert.match(sql,/SUM\(NVL\(d.amount,0\)\) AS balanceamount/);assert.doesNotMatch(sql,/ap_bill_payable|bi_receivable|accountbalance/i);
  const scoped=companyScopedSql(sql,'1');assert.match(scoped,/companycode=:company_code/);
  const q=dashboardMetric(key,{from:'2026-04-01',to:'2026-09-30',company:'1',search:'Caliber',page:1});
  assert.equal(q.binds.to_date,'2026-09-30');assert.equal(q.binds.from_date,'2026-04-01');assert.equal(q.binds.row_offset,200);
  assert.equal(q.countBinds.search_text,'Caliber');assert.equal(q.countBinds.company_code,'1');
  const drill=accountDrill(key,'ACCOUNT_CODE',{ACCOUNT_CODE:'8200'});assert.ok(drill);assert.equal(drill.chain,'party-position');
 }
});
