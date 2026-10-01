import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS,accountView} from '../iboss-accounts.mjs';
import {TRANSACTION_VIEWS} from '../iboss-account-transactions.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
const titles=['Payment Advice Register','Asset Register','Debit Note Register','Credit Note Register','Bill Receipt Register','Payable/Receivable Report','Bill Outstanding More than 180 Days','TDS Payable Summary','TDS Receivable','Party Wise TCS Summary','Cash Purchase Register','Emi Details','Fixed Deposit Register','Bank Guaranty Report','Bank Guaranty Closer','Bank Guaranty Nature','Bank Guaranty Type','Bank Guaranty Commission','Fixed Deposit Interest','Fixed Deposit Withdrawl','Asset Details Report','Imprest Balance','Internal Balance Details','Bank Balance Details','Expense Vehiclewise','EMI Schedule','Combined and Individual EMI Schedule'];
test('Masters and Transactions contain exactly the reference links without mixing the sections',()=>{
 assert.equal(ACCOUNT_SECTIONS.masters.length,8);
 assert.deepEqual(ACCOUNT_SECTIONS.transactions.map(key=>accountView(key).title),titles);
 assert.equal(new Set([...ACCOUNT_SECTIONS.masters,...ACCOUNT_SECTIONS.transactions]).size,35);
 for(const key of ACCOUNT_SECTIONS.transactions)assert.equal(accountView(key).section,'transactions');
});
test('registers preserve stored financial fields and use inclusive start / exclusive next-day ranges',()=>{
 for(const [key,view] of Object.entries(TRANSACTION_VIEWS)){
  assert.doesNotMatch(view.sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|MERGE)\b/i);
  assert.ok(view.source,`${key} documents its Oracle source`);
  if(view.dated){assert.match(view.sql,/>= TO_DATE\(:from_date,'YYYY-MM-DD'\)/);assert.match(view.sql,/< TO_DATE\(:to_date,'YYYY-MM-DD'\)\+1/);}
 }
 assert.match(TRANSACTION_VIEWS['combined-emi-schedule'].sql,/d\.ispaid/);
 assert.match(TRANSACTION_VIEWS['fixed-deposit-interest'].sql,/a\.interestamount/i);
 assert.match(TRANSACTION_VIEWS['asset-details'].sql,/d\.amount/);
});
test('balances pick a single latest snapshot for each company and account without summing days',()=>{
 for(const key of ['imprest-balance','internal-balance','bank-balance']){
  const view=TRANSACTION_VIEWS[key];assert.equal(view.asOf,true);
  assert.match(view.sql,/PARTITION BY b\.companycode,b\.accountcode ORDER BY b\.fordate DESC/);
  assert.match(view.sql,/WHERE b\.rn=1/);assert.doesNotMatch(view.sql,/SUM\(/);
  assert.match(view.sql,/b\.fordate < TO_DATE\(:to_date,'YYYY-MM-DD'\)\+1/);
 }
 assert.match(TRANSACTION_VIEWS['internal-balance'].sql,/CONNECT BY NOCYCLE/);
});
test('current outstanding reports retain native settlement semantics and distinguish bill age from overdue days',()=>{
 const aged=TRANSACTION_VIEWS['outstanding-180'];
 assert.equal(aged.dated,false);assert.match(aged.sql,/a\.billage>180/);
 assert.match(aged.sql,/TRUNC\(SYSDATE\)-TRUNC\(a\.documentdate\)>180/);
 assert.match(aged.sql,/UNION ALL/);assert.match(aged.sql,/cmpl\.bi_receivable/);
 assert.match(TRANSACTION_VIEWS['payable-receivable'].note,/settlement amounts remain current/);
 assert.match(TRANSACTION_VIEWS['tds-payable'].sql,/GROUP BY v\.companycode,a\.partycode,a\.partyname,a\.taxsectionname/);
 assert.match(TRANSACTION_VIEWS['party-tcs'].sql,/GROUP BY a\.companycode,a\.partycode,a\.partyname,a\.type/);
});
test('the real Accounts component renders Masters and Transactions tabs inside the page',async()=>{
 const source=fs.readFileSync(new URL('../src/iboss-accounts.jsx',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replace('export default function','function');
 const {code}=await transformWithOxc(source,'accounts.jsx',{jsx:{runtime:'classic'}});
 const Null=()=>null;
 const scope={React,useEffect:React.useEffect,useMemo:React.useMemo,useState:React.useState,ACCOUNT_VIEWS,ACCOUNT_SECTIONS,indiaDateTimeInputValue,...Object.fromEntries(['BookUser','Contact','Wallet','Landmark','Network','Settings','BookOpen','Percent','ArrowLeft','RefreshCw'].map(name=>[name,Null]))};
 const Component=new Function(...Object.keys(scope),`${code};return IbossAccounts;`)(...Object.values(scope));
 const master=renderToStaticMarkup(React.createElement(Component,{initialSection:'masters'}));
 const transactions=renderToStaticMarkup(React.createElement(Component,{initialSection:'transactions'}));
 assert.match(master,/>Account Master</);assert.doesNotMatch(master,/>Payment Advice Register</);
 for(const title of titles)assert.ok(transactions.includes(`>${title}<`),title);
 assert.doesNotMatch(transactions,/>Account Master</);
 assert.match(transactions,/id="accounts-tab-transactions" tabindex="0" aria-selected="true"/);
 assert.match(master,/id="accounts-tab-masters" tabindex="0" aria-selected="true"/);
 assert.match(master+transactions,/role="tablist"/);
});
test('IBOSS opens Accounts directly without Masters and Transactions submenu entries',()=>{
 const source=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/iboss-accounts-submenus|\["Accounts Masters","Masters"\]|\["Accounts Transactions","Transactions"\]/);
 assert.match(source,/\["Accounts",Landmark,"iboss-accounts"\]/);
 assert.match(source,/renderedActive === "Accounts" \? \(\s*<IbossAccounts/);
});
