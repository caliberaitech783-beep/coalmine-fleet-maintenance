import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {summarizeUserSessions} from '../user-session-summary.mjs';

test('online users count one login once across devices, tabs, roles and applications', () => {
  assert.deepEqual(summarizeUserSessions([
    {login:' Alice ',online:true,deviceId:'phone'},
    {login:'ALICE',online:true,deviceId:'desktop',application:'Tender'},
    {login:'alice',online:false,deviceId:'phone'},
    {login:'bob',online:true,deviceId:'desktop'},
    {login:'charlie',online:false},
  ]), {unexpired:5,active:5,online:3,onlineUsers:2,users:3,devices:2});
});

test('same display names do not merge distinct accounts, and missing logins do not invent users', () => {
  const summary=summarizeUserSessions([
    {login:'gurpreet',name:'Gurpreet Singh',online:true},
    {login:'gurpreetsingh',name:'Gurpreet Singh',online:true},
    {login:' ',name:'Unknown',online:true},
    {name:'Unknown',online:true},
  ]);
  assert.equal(summary.onlineUsers,2);
  assert.equal(summary.users,2);
  assert.equal(summary.online,4);
  assert.equal(summary.unexpired,4);
});

test('empty and inactive lists never imply online users and do not mutate session rows', () => {
  assert.deepEqual(summarizeUserSessions(),{unexpired:0,active:0,online:0,onlineUsers:0,users:0,devices:0});
  const rows=Object.freeze([Object.freeze({login:'ALICE',online:false,deviceId:' '})]);
  assert.deepEqual(summarizeUserSessions(rows),{unexpired:1,active:1,online:0,onlineUsers:0,users:1,devices:0});
});

test('session endpoint preserves per-session controls and exposes a separate unique online count', async () => {
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=server.indexOf("app.get('/api/user-sessions',");
  const end=server.indexOf("app.post('/api/user-sessions/:sessionId/messages'",start);
  let handler,body;
  const now=Date.now();
  const rows=[
    {token:'current-token',sessionId:'a',login:'Alice',lastSeenAt:new Date(now-1000),userRecord:{}},
    {token:'other-token',sessionId:'b',login:' ALICE ',lastSeenAt:new Date(now-3000),userRecord:{}},
    {token:'third-token',sessionId:'c',login:'Bob',lastSeenAt:new Date(now-121000),userRecord:{}},
  ];
  runInNewContext(server.slice(start,end),{
    app:{get(path,...handlers){assert.equal(path,'/api/user-sessions');handler=handlers.at(-1);}},
    requireSession(){},requireUserSessionView(){},
    sessionStore:{async pruneExpired(){}},async expireRemoteAssistanceSessions(){},
    pool:{async query(sql){assert.match(sql,/created_at>NOW\(\)-INTERVAL '7 days'/);return {rows};}},
    userSessionLocationName:()=>'',REMOTE_ASSISTANCE_LIVE_STATUSES:[],summarizeUserSessions,
  });
  await handler({headers:{authorization:'Bearer current-token'},session:{login:'admin'}},
    {set(){},json(data){body=data;}},error=>{throw error;});
  assert.equal(body.summary.onlineUsers,1);
  assert.equal(body.summary.online,2);
  assert.equal(body.summary.unexpired,3);
  assert.equal(body.sessions.length,3);
  assert.equal(body.sessions[0].current,true);
  assert.ok(body.sessions.every(row=>!('token' in row)&&!('userRecord' in row)));
});

test('UI separates unexpired sessions from unique online users, including with an older API', () => {
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const page=client.slice(client.indexOf('function UserSessionsPage('),client.indexOf('function reportCategoryIdsForUser('));
  assert.match(page,/>Online users<\/small><button[\s\S]*?>\{Number\(summary.onlineUsers\|\|0\)/);
  assert.match(page,/>Valid user logins<\/small><button[\s\S]*?>\{Number\(summary.unexpired\|\|0\)/);
  assert.match(page,/Active in the last 2 minutes · unique accounts/);
  assert.match(page,/One valid session per user · 7-day maximum/);
  assert.match(page,/const nextSummary=summarizeUserSessions\(nextSessions\)/);
  assert.doesNotMatch(page,/>Active sessions<|>Online now</);
});
