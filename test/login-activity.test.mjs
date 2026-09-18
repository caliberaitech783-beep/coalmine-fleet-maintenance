import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {daysSinceLogin,loginActivityStatus,loginActivityRows,LOGIN_ACTIVITY_FILTERS} from '../src/login-activity.mjs';

const view=readFileSync(new URL('../src/user-login-history.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const now=new Date('2026-09-18T10:16:00+05:30');

test('days since last login are counted on India calendar days',()=>{
  assert.equal(daysSinceLogin(null,now),null);
  assert.equal(daysSinceLogin('2026-09-18T01:00:00+05:30',now),0,'earlier today');
  assert.equal(daysSinceLogin('2026-09-17T23:30:00+05:30',now),1,'late last night is yesterday, not 0');
  assert.equal(daysSinceLogin('2026-09-17T17:30:00Z',now),1,'UTC value of 23:00 IST yesterday');
  assert.equal(daysSinceLogin('2026-09-17T18:30:00Z',now),0,'18:30Z is already midnight IST today');
  assert.equal(daysSinceLogin('2026-08-19T09:00:00+05:30',now),30);
  assert.equal(daysSinceLogin('not a date',now),null);
  assert.equal(loginActivityStatus({},now),'Never logged in');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-18T09:00:00+05:30'},now),'Logged in today');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-17T09:00:00+05:30'},now),'Last login yesterday');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-06T09:00:00+05:30'},now),'Not logged in for 12 days');
});

test('the Never logged in view lists never-logged-in users without any date window, then the longest absences',()=>{
  const users=[
    {id:1,name:'Zara',login:'zara',lastLogin:null},
    {id:2,name:'Amit',login:'amit',lastLogin:null},
    {id:3,name:'Ravi',login:'ravi',lastLogin:'2026-09-18T08:00:00+05:30'},
    {id:4,name:'Neha',login:'neha',lastLogin:'2026-09-10T08:00:00+05:30'},
    {id:5,name:'Kiran',login:'kiran',lastLogin:'2026-07-01T08:00:00+05:30'},
  ];
  assert.deepEqual(loginActivityRows(users,'never',now).map(row=>row.name),['Amit','Zara'],'never logged in, by name');
  assert.deepEqual(loginActivityRows(users,'all',now).map(row=>[row.name,row.daysSince]),[['Amit',null],['Zara',null],['Kiran',79],['Neha',8],['Ravi',0]],'never first, then longest absence first');
  assert.deepEqual(loginActivityRows(users,'7',now).map(row=>row.name),['Amit','Zara','Kiran','Neha']);
  assert.deepEqual(loginActivityRows(users,'30',now).map(row=>row.name),['Amit','Zara','Kiran']);
  assert.equal(loginActivityRows(users,'all',now)[3].status,'Not logged in for 8 days');
  assert.deepEqual(LOGIN_ACTIVITY_FILTERS.map(option=>option.value),['never','7','30','all']);
  assert.deepEqual(loginActivityRows([],'never',now),[]);
});

test('the page has no period or date controls any more and shows days since last login',()=>{
  const panel=view.slice(view.indexOf('export function UserLoginActivity('));
  assert.match(panel,/useHistory\(token,'period=all',refresh\)/,'always every retained login');
  assert.doesNotMatch(panel,/type="date"|Custom dates|Last 7 days|Apply dates|Logins in period/);
  assert.match(panel,/<th>Status<\/th><th>Days since last login<\/th><th>Last recorded login<\/th><th>Total logins<\/th><th>Days with logins<\/th>/);
  assert.match(panel,/row\.daysSince===null\?'—':row\.daysSince/);
  assert.match(panel,/row\.lastLogin\?formatDate\(row\.lastLogin\):'Never'/);
  assert.match(panel,/never logged in`:''/,'the heading counts the never-logged-in users');
  assert.match(panel,/LOGIN_ACTIVITY_FILTERS\.map/);
});
