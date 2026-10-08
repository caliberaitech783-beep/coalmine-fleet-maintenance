import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {reconciliationBanks} from '../src/iboss-reconciliation-banks.mjs';
const rows=[
 {ACCOUNT_CODE:'1',ACCOUNT_NAME:'Pending bank',UNRECONCILED_COUNT:3,UNCLEAR_DR:100},
 {ACCOUNT_CODE:'2',ACCOUNT_NAME:'Cleared bank',RECONCILED_COUNT:4},
 {ACCOUNT_CODE:'3',ACCOUNT_NAME:'Mixed bank',UNRECONCILED_COUNT:2,UNCLEAR_CR:50},
 {ACCOUNT_CODE:'3',ACCOUNT_NAME:'Mixed bank',RECONCILED_COUNT:5,UNRECONCILED_COUNT:1,UNCLEAR_CR:25},
 {ACCOUNT_CODE:'4',ACCOUNT_NAME:'Inactive bank'}
];
test('bank status filters include partial banks, exclude no activity, and combine company rows',()=>{
 const pending=reconciliationBanks(rows,'unreconciled');
 assert.deepEqual(pending.map(r=>r.code),['3','1']);
 assert.equal(pending[0].state,'Partly reconciled');
 assert.equal(pending[0].UNRECONCILED_COUNT,3);
 assert.equal(pending[0].UNCLEAR_CR,75);
 assert.equal(pending[1].state,'Not reconciled');
 const cleared=reconciliationBanks(rows,'reconciled');
 assert.deepEqual(cleared.map(r=>r.code),['2','3']);
 assert.equal(cleared[0].state,'Fully reconciled');
 assert.equal(reconciliationBanks(rows,'both').length,3);
 assert.equal(reconciliationBanks(rows,'both',3).length,1);
 assert.deepEqual(reconciliationBanks(rows,'unreconciled','2'),[]);
 assert.deepEqual(reconciliationBanks([]),[]);
});
test('bank list renders selected status, counts, amounts and bank detail actions',async()=>{
 const source=fs.readFileSync(new URL('../src/iboss-bank-reconciliation.jsx',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replace('export default function','function');
 const {code}=await transformWithOxc(source,'component.jsx',{jsx:{runtime:'classic'}});
 const Component=new Function('React','reconciliationBanks',`${code};return ReconciliationControls;`)(React,reconciliationBanks);
 const render=(status,bank='')=>renderToStaticMarkup(React.createElement(Component,{rows,status,bank,onBank:()=>{},onStatus:()=>{}}));
 const html=render('unreconciled');
 const table=html.split('aria-label="Bank-wise reconciliation status"')[1].split('</table>')[0];
 assert.match(table,/Mixed bank \(3\)/); assert.match(table,/Pending bank \(1\)/);
 assert.doesNotMatch(table,/Cleared bank|Inactive bank/);
 assert.match(table,/Partly reconciled/);assert.match(table,/75\.00/);
 assert.match(render('reconciled'),/Fully reconciled/);
 assert.match(render('both'),/3 banks/);
 assert.match(render('unreconciled','2'),/No banks have matching entries/);
 assert.match(render('both','3'),/Show all banks/);
});
