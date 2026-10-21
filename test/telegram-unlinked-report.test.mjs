import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewTelegramUnlinkedReport,telegramUnlinkedRows} from '../src/telegram-unlinked-report.mjs';
test('unlinked report excludes linked users and keeps exempt users clearly marked',()=>{
  const rows=telegramUnlinkedRows([{login:'linked',linked:true},{login:'pending',name:'Pending',linked:false},{login:'exempt',name:'Exempt',linked:false,exempt:true}]);
  assert.deepEqual(rows.map(row=>row.login),['exempt','pending']);
  assert.equal(rows[0].exemption,'Exempt');assert.equal(rows[1].status,'Not linked');
  assert.deepEqual(telegramUnlinkedRows([]),[]);
});
test('report access matches Telegram status API administrator access',()=>{
  assert.equal(canViewTelegramUnlinkedReport({role:'super',permissions:{adminLevel:'Admin'}}),true);
  assert.equal(canViewTelegramUnlinkedReport({role:'super',permissions:{adminLevel:'Super Admin'}}),true);
  assert.equal(canViewTelegramUnlinkedReport({role:'super',permissions:{adminLevel:'Manager'}}),false);
  assert.equal(canViewTelegramUnlinkedReport({role:'production'}),false);
});
