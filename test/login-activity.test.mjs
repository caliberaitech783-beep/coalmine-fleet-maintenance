import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {daysSinceLogin,loginActivityStatus,loginActivityRows,LOGIN_ACTIVITY_FILTERS} from '../src/login-activity.mjs';

const view=readFileSync(new URL('../src/user-login-history.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const now=new Date('2026-09-18T10:16:00+05:30');

test('days since last login are counted on India calendar days',()=>{
  assert.equal(daysSinceLogin(null,now),null);
  assert.equal(daysSinceLogin('2026-09-18T01:00:00+05:30',now),0,'earlier today');
  assert.equal(daysSinceLogin('2026-09-17T23:30:00+05:30',now),1,'late last night is yesterday, not 0');
  assert.equal(daysSinceLogin('2026-09-17T17:30:00Z',now),1,'UTC value of 23:00 IST yesterday');
  assert.equal(daysSinceLogin('2026-09-17T18:30:00Z',now),0,'18:30Z is already midnight IST today');
  assert.equal(daysSinceLogin('2026-08-19T09:00:00+05:30',now),30);
  assert.equal(daysSinceLogin('not a date',now),null);
  assert.equal(loginActivityStatus({},now),'No recorded activity');
  assert.equal(loginActivityStatus({lastActivity:'2026-09-18T09:00:00+05:30'},now),'Used before · Login time unavailable');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-17T09:00:00+05:30',lastActivity:'2026-09-18T09:00:00+05:30'},now),'Active today · Earlier login');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-18T09:00:00+05:30'},now),'Logged in today');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-17T09:00:00+05:30'},now),'Last login yesterday');
  assert.equal(loginActivityStatus({lastLogin:'2026-09-06T09:00:00+05:30'},now),'Not logged in for 12 days');
});

test('missing login times are not evidence of inactivity; exact activity stays out of the no-evidence list',()=>{
  const users=[
    {id:1,name:'Zara',login:'zara',lastLogin:null},
    {id:2,name:'Amit',login:'amit',lastLogin:null},
    {id:3,name:'Ravi',login:'ravi',lastLogin:'2026-09-18T08:00:00+05:30'},
    {id:4,name:'Neha',login:'neha',lastLogin:'2026-09-10T08:00:00+05:30'},
    {id:5,name:'Kiran',login:'kiran',lastLogin:'2026-07-01T08:00:00+05:30'},
  ];
  assert.deepEqual(loginActivityRows(users,'never',now).map(row=>row.name),['Amit','Zara'],'never logged in, by name');
  assert.deepEqual(loginActivityRows(users,'all',now).map(row=>[row.name,row.daysSince]),[['Amit',null],['Zara',null],['Kiran',79],['Neha',8],['Ravi',0]],'never first, then longest absence first');
  assert.deepEqual(loginActivityRows(users,'7',now).map(row=>row.name),['Kiran','Neha']);
  assert.deepEqual(loginActivityRows(users,'30',now).map(row=>row.name),['Kiran']);
  assert.equal(loginActivityRows(users,'all',now)[3].status,'Not logged in for 8 days');
  assert.deepEqual(LOGIN_ACTIVITY_FILTERS.map(option=>option.value),['all','never','activity-only','7','30']);
  assert.deepEqual(loginActivityRows([],'never',now),[]);
  users.push({id:6,name:'Earlier user',lastLogin:null,lastActivity:'2026-09-01T09:00:00+05:30'});
  assert.deepEqual(loginActivityRows(users,'never',now).map(row=>row.name),['Amit','Zara']);
  assert.deepEqual(loginActivityRows(users,'activity-only',now).map(row=>row.name),['Earlier user']);
  assert.equal(loginActivityRows(users,'all',now).length,6);
  assert.deepEqual(loginActivityRows(users,'invalid',now),[]);
});

test('the page has no period or date controls any more and shows days since last login',()=>{
  const panel=view.slice(view.indexOf('export function UserLoginActivity('));
  assert.match(panel,/useHistory\(token,'period=all',refresh\)/,'always every retained login');
  assert.doesNotMatch(panel,/type="date"|Custom dates|Last 7 days|Apply dates|Logins in period/);
  assert.match(panel,/<th>Status<\/th><th>Days since last login<\/th><th>Last recorded login<\/th><th>Last activity<\/th><th>Retained logins<\/th><th>Retained login days<\/th>/);
  assert.match(panel,/row\.daysSince===null\?'—':row\.daysSince/);
  assert.match(panel,/row\.lastLogin\?formatDate\(row\.lastLogin\):'Not recorded'/);
  assert.match(panel,/row\.lastActivity\?formatDate\(row\.lastActivity\):'Not recorded'/);
  assert.match(panel,/with no recorded activity`:''/);
  assert.doesNotMatch(panel,/Never logged in/);
  assert.match(panel,/LOGIN_ACTIVITY_FILTERS\.map/);
  assert.ok(main.includes("savedStatus==='Never logged in'?'Login activity':savedStatus"),'existing tabs keep opening the report after the label changes');
});
