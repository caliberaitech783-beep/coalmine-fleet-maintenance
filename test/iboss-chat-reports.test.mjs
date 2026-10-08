import test from 'node:test';import assert from 'node:assert/strict';
import {accountPageQuery} from '../iboss-account-pages.mjs';
import {CHAT_REPORTS} from '../iboss-chat-reports.mjs';
test('chat summaries aggregate before pagination and distinguish paid, unpaid and preclosed',()=>{
 const emi=accountPageQuery('chat-emi-summary');assert.match(emi.sql,/cmpl.emireport/);assert.match(emi.sql,/COUNT\(\*\) AS emi_count/);assert.doesNotMatch(emi.sql,/loandetail/);
 const paid=accountPageQuery('chat-payment-done','2026-10-01','2026-10-04');assert.match(paid.sql,/paymentdone\)\)='YES'/);assert.match(paid.sql,/SUM\(a.amount\)/);
 const pending=accountPageQuery('chat-payment-pending','2026-10-01','2026-10-04');assert.match(pending.sql,/paymentdone\)\)='NO'/);
 assert.match(CHAT_REPORTS['chat-emi-summary'].note,/future instalments/);
});
test('vendor lookup and closing balance bind text and never treat a missing balance as zero',()=>{
 const attack="x' OR 1=1 --";const lookup=accountPageQuery('chat-vendor-search',undefined,undefined,0,attack);assert.equal(lookup.binds.search_text,attack);assert.ok(!lookup.sql.includes(attack));assert.match(lookup.sql,/INSTR/);
 const closing=accountPageQuery('chat-vendor-closing','2026-10-01','2026-10-04',0,'V001');assert.equal(closing.binds.search_text,'V001');assert.match(closing.sql,/d.accountcode=:search_text/);assert.match(closing.sql,/GROUP BY v.companycode,d.accountcode/);
 assert.throws(()=>accountPageQuery('chat-vendor-search',undefined,undefined,0,['ABC']));assert.throws(()=>accountPageQuery('chat-vendor-search',undefined,undefined,0,'x'.repeat(121)));
 assert.match(CHAT_REPORTS['chat-vendor-closing'].note,/not a confirmed zero balance/);
});
