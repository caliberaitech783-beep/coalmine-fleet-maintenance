import test from 'node:test';
import assert from 'node:assert/strict';
import {splitLedgerBalance,ledgerFooter} from '../src/iboss-ledger-format.mjs';
test('ERP credit opening is included once: account 6057 screenshot totals',()=>{
 assert.deepEqual(ledgerFooter({OPENING_BALANCE:65033.12,DEBITAMOUNT:616248.88,CREDITAMOUNT:551215.76}),{periodDebit:616248.88,periodCredit:551215.76,totalDebit:616248.88,totalCredit:616248.88});
});
test('debit opening goes to debit total and balance sides respect ERP signs',()=>{
 assert.deepEqual(ledgerFooter({OPENING_BALANCE:-100,DEBITAMOUNT:20,CREDITAMOUNT:30}),{periodDebit:20,periodCredit:30,totalDebit:120,totalCredit:30});
 assert.deepEqual(splitLedgerBalance(-90),{debit:90,credit:0});
 assert.deepEqual(splitLedgerBalance(90),{debit:0,credit:90});
 assert.deepEqual(splitLedgerBalance(0.000001),{debit:0,credit:0});
});
