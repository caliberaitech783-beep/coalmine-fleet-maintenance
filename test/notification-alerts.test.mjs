import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {notificationText} from '../notification-text.mjs';
import {createNotificationFeed} from '../notification-feed.mjs';
import {createNotificationTracker, createNotificationSound} from '../src/notification-alerts.mjs';

test('legacy opened/closed messages put site and one door before retained details', () => {
  for (const action of ['opened', 'closed']) {
    const message = `Request REQ-1 ${action} for E32-MH34BZ2802 | Door: E32-MH34BZ2802 | Chassis: MC2DALRC0NH003558. Breakdown: WGM. Date & time: 10-09-2026 11:15:23 AM. Location: Majri OB. User: Example.`;
    const text = notificationText({message});
    assert.ok(text.startsWith('Site: Majri OB — Door No. E32-MH34BZ2802 — Request REQ-1'));
    assert.equal(text.split('E32-MH34BZ2802').length - 1, 1);
    assert.match(text, /Chassis: MC2DALRC0NH003558/);
    assert.match(text, /11:15:23 AM/);
    assert.match(text, /User: Example/);
  }
});

test('all event messages receive the same structured site/door prefix', () => {
  for (const message of [
    'Request REQ-1 was verified by MIS and its first trip was completed.',
    'Request REQ-1 was marked Idle (No work).',
    'Request REQ-1 was approved on road.',
    'Idle status for request REQ-1 was cancelled.',
    'User added a daily maintenance update for REQ-1.',
    '09:00 reminder: add today’s maintenance update and delay reason for REQ-1.',
    'User created ticket TKT-1.', 'Ticket TKT-1 was resolved by Admin.',
  ]) {
    assert.equal(notificationText({site:'Sasti OB',door:'V606-96911',message}), `Site: Sasti OB — Door No. V606-96911 — ${message}`);
  }
  assert.equal(notificationText({site:'Majri OB',message:'Ticket resolved.'}), 'Site: Majri OB — Ticket resolved.');
  assert.equal(notificationText({message:'System event.'}), 'Site: Not recorded — System event.');
});

test('a numeric door never corrupts timestamps, durations or other location details', () => {
  const text=notificationText({site:'Majri OB',door:'24',message:'Request REQ-1 closed for 24 | Door: 24 | Chassis: 12324. Closed: 12:24:00 PM. Work: 24 hours. Location: Workshop. User: Example.'});
  assert.match(text,/Site: Majri OB — Door No\. 24 — Request REQ-1 closed/);
  assert.match(text,/Chassis: 12324/);
  assert.match(text,/12:24:00 PM/);
  assert.match(text,/Work: 24 hours/);
  assert.match(text,/Location: Workshop/);
});

test('first response and refreshed history are silent; new IDs alert only once', () => {
  const track = createNotificationTracker();
  const old = {id:'9007199254740993',isRead:false};
  const fresh = {id:'9007199254740994',isRead:true};
  assert.deepEqual(track(null), []); // failed/invalid initial responses are not baselines
  assert.deepEqual(track([old]), []);
  assert.deepEqual(track([fresh,old]), [fresh]);
  assert.deepEqual(track([fresh,{...old,isRead:true},fresh]), []);
  assert.deepEqual(track([]), []);
  assert.deepEqual(track([fresh,old]), []);
  assert.deepEqual(createNotificationTracker()([fresh,old]), []); // page refresh
});

test('an initially empty inbox alerts for every new type, oldest first', () => {
  const track = createNotificationTracker();
  assert.deepEqual(track([]), []);
  const events = Array.from({length:10}, (_,id) => ({id:id+1}));
  assert.deepEqual(track([...events].reverse()), events);
  assert.deepEqual(track([...events].reverse()), []);
});

test('sound unlock is silent, blocked sounds are not queued, cleanup removes listeners', async () => {
  const events = new Map();
  let context, plays=0, closes=0;
  class AudioContext {
    constructor(){ context=this; this.state='suspended'; this.currentTime=0; }
    resume(){ this.state='running'; return Promise.resolve(); }
    close(){ closes++; return Promise.resolve(); }
    createOscillator(){ return {frequency:{setValueAtTime(){}},connect(){},start(){plays++;},stop(){},disconnect(){}}; }
    createGain(){ return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}; }
  }
  const sound=createNotificationSound({AudioContext,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:(key)=>events.delete(key)});
  sound.play(); assert.equal(plays,0);
  events.get('pointerdown')(); assert.equal(plays,0);
  sound.play(); assert.equal(plays,1);
  context.state='suspended'; sound.play(); assert.equal(plays,1);
  events.get('keydown')(); assert.equal(plays,1);
  sound.close(); sound.play();
  assert.equal(events.size,0); assert.equal(closes,1); assert.equal(plays,1);
});

test('shared database listener wakes only the recipient and handles notification-before-wait', async () => {
  const client=new EventEmitter(); let connections=0;
  client.query=async(sql)=>assert.equal(sql,'LISTEN bdms_notifications');
  client.release=()=>{};
  const subscribe=createNotificationFeed({connect:async()=>{connections++;return client;}},{timeoutMs:500});
  const response=new EventEmitter();
  const a=await subscribe('alice',response), b=await subscribe('bob',response);
  let bob=false; b.promise.then(()=>{bob=true;});
  client.emit('notification',{channel:'bdms_notifications',payload:'alice'});
  await a.promise;
  assert.equal(bob,false); assert.equal(connections,1);
  a.close(); b.close(); assert.equal(response.listenerCount('close'),0);
});

test('database listener timeout and disconnect are recoverable', async () => {
  const clients=[];
  const subscribe=createNotificationFeed({connect:async()=>{
    const client=new EventEmitter(); client.query=async()=>{}; client.release=()=>{}; clients.push(client); return client;
  }},{timeoutMs:5});
  const response=new EventEmitter();
  const first=await subscribe('alice',response);
  clients[0].emit('error',new Error('connection lost'));
  await first.promise; first.close();
  const second=await subscribe('alice',response);
  await second.promise; second.close();
  assert.equal(clients.length,2);
});

test('UI wires all toasts to exact-entry navigation and sounds outside state updaters', () => {
  const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/alerts\.map\(\(item\) => <IncomingNotification key=\{item.id\}/);
  assert.match(source,/onOpen=\{openEntry\}/);
  assert.match(source,/playedRef\.current\.has\(id\)/);
  assert.match(source,/soundRef\.current\?\.play\(\)/);
  assert.match(source,/const fresh = track\(next\)/);
  assert.match(source,/let delay = 1000/);
  assert.match(source,/if \(controller.signal.aborted\) return/);
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(server,/AFTER INSERT ON crm_notifications/);
  assert.match(server,/pg_notify\('bdms_notifications',NEW.recipient_login\)/);
  assert.match(server,/app.get\('\/api\/notifications',requireSession/);
  assert.match(server,/WHERE n.recipient_login=\$1/);
});
