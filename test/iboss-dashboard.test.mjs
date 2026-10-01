import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildDashboard,dashboardMetric,DASHBOARD_QUERIES,DASHBOARD_METRICS} from '../iboss-dashboard.mjs';
const range={from:'2026-09-01',to:'2026-10-02'};
test('Dashboard preserves signed credits and totals across parties and ageing buckets',()=>{
 const result=buildDashboard({bank:[{BALANCEAMOUNT:1000},{BALANCEAMOUNT:-200}],payable:[{PARTY_CODE:'A',PARTY_NAME:'A',AGE_BAND:'0–30',BALANCE:500,BILLS:2},{PARTY_CODE:'A',AGE_BAND:'180+',BALANCE:-100,BILLS:1}],receivable:[{PARTY_CODE:'B',AGE_BAND:'180+',BALANCE:350,BILLS:3}]},range);
 assert.equal(result.cards.find(c=>c.key==='bank').amount,800);
 assert.equal(result.cards.find(c=>c.key==='payable').amount,400);
 assert.equal(result.parties.payable[0].bills,3);
 assert.equal(result.parties.payable[0].balance,400);
 assert.equal(result.aging.reduce((s,r)=>s+r.payable,0),400);
 assert.equal(result.cards.find(c=>c.key==='aged-receivable').amount,350);
});
test('Overdue and upcoming commitments remain distinct and advice uses native pending flag',()=>{
 const result=buildDashboard({emi:[{BUCKET:'Overdue',INSTALMENTS:2,AMOUNT:100},{BUCKET:'Next 7 days',INSTALMENTS:1,AMOUNT:50},{BUCKET:'Next 30 days',INSTALMENTS:3,AMOUNT:150}],advice:[{STATE:'Pending',RECORDS:2,AMOUNT:75},{STATE:'Completed',RECORDS:5,AMOUNT:200}]},range);
 assert.equal(result.cards.find(c=>c.key==='overdue-emi').amount,100);
 assert.equal(result.cards.find(c=>c.key==='upcoming-emi').amount,200);
 assert.equal(result.cards.find(c=>c.key==='pending-advice').amount,75);
 assert.match(DASHBOARD_QUERIES.emi.sql,/e.emistatus='UNPAID'/);
 assert.match(result.note,/not unpaid tax liability/);
});
test('Bank source chooses latest snapshot per company/account without summing history',()=>{
 assert.match(DASHBOARD_QUERIES.bank.sql,/PARTITION BY b.companycode,b.accountcode/);
 assert.match(DASHBOARD_QUERIES.bank.sql,/b.rn=1/);
 assert.match(DASHBOARD_QUERIES.bank.sql,/p.partytypecode='BANK'/);
});
test('Closure and withdrawal checks exclude completed instruments from expiry alerts',()=>{
 assert.match(DASHBOARD_QUERIES.fd.sql,/NOT EXISTS.*fixeddepositwithdrawl/s);
 assert.match(DASHBOARD_QUERIES.guarantee.sql,/NOT EXISTS.*bankgaurantycloser/s);
});
test('Metric date scopes match card basis and pagination binds stay bounded',()=>{
 const old=dashboardMetric('overdue-emi',range),upcoming=dashboardMetric('upcoming-emi',range),bank=dashboardMetric('bank',range),advice=dashboardMetric('pending-advice',{...range,page:2});
 assert.equal(old.binds.to_date,'2026-10-01');assert.equal(upcoming.binds.from_date,'2026-10-02');assert.equal(upcoming.binds.to_date,'2026-11-01');assert.equal(bank.binds.to_date,range.to);assert.equal(advice.binds.row_offset,400);assert.equal(advice.binds.row_limit,201);
 for(const key of Object.keys(DASHBOARD_METRICS)){const r=dashboardMetric(key,range);assert.ok(Object.values(r.binds).every(v=>v!==undefined));}
});
test('Unknown metrics, malformed ranges and invalid pages cannot become SQL',()=>{
 for(const key of ['x','__proto__','constructor',"bank' OR 1=1"]){assert.throws(()=>dashboardMetric(key,range));}
 for(const page of [-1,5001,1.5])assert.throws(()=>dashboardMetric('bank',{...range,page}));
 assert.throws(()=>dashboardMetric('bank',{from:'bad',to:range.to}));
});
test('Dashboard endpoints retain authenticated Accounts report access and no-store responses',()=>{
 const s=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 for(const path of ['/api/reports/iboss-accounts-dashboard','/api/reports/iboss-accounts-dashboard/:metric']){
 const start=s.indexOf(`app.get('${path}',requireSession`);assert.ok(start>=0);const handler=s.slice(start,s.indexOf('\n});',start));assert.match(handler,/accountsMergeAllowed\(req\)/);assert.match(handler,/Cache-Control','no-store/);assert.match(handler,/status\(503\)/);
 }
});
